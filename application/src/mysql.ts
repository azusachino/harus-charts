import { Construct } from "constructs";
import { Chart, ChartProps } from "cdk8s";
import {
  KubeStatefulSet,
  KubeService,
  KubeConfigMap,
  IntOrString,
  Quantity,
} from "../imports/k8s";

export interface MySQLChartProps extends ChartProps {
  replicas?: number;
  rootPassword?: string;
  database?: string;
}

export class MySQLChart extends Chart {
  constructor(scope: Construct, id: string, props: MySQLChartProps = {}) {
    super(scope, id, props);

    const appLabel = { app: "mysql" };
    const masterLabel = { app: "mysql", role: "master" };
    const slaveLabel = { app: "mysql", role: "slave" };
    const replicas = props.replicas || 2;
    const rootPassword = props.rootPassword || "changeme";
    const database = props.database || "mydb";

    // ConfigMap for MySQL configuration
    new KubeConfigMap(this, "MySQLConfigMap", {
      metadata: {
        name: "mysql-config",
        labels: appLabel,
      },
      data: {
        "master.cnf": `
[mysqld]
log-bin=mysql-bin
binlog-format=ROW
server-id=1
        `.trim(),
        "slave.cnf": `
[mysqld]
server-id=2
relay-log=relay-log
log-bin=mysql-bin
binlog-format=ROW
        `.trim(),
      },
    });

    // Headless Service for StatefulSet
    new KubeService(this, "MySQLHeadlessService", {
      metadata: {
        name: "mysql-headless",
        labels: appLabel,
      },
      spec: {
        clusterIp: "None",
        ports: [{ port: 3306, name: "mysql" }],
        selector: appLabel,
      },
    });

    // Master Service
    new KubeService(this, "MySQLMasterService", {
      metadata: {
        name: "mysql-master",
        labels: masterLabel,
      },
      spec: {
        ports: [
          {
            port: 3306,
            targetPort: IntOrString.fromNumber(3306),
            name: "mysql",
          },
        ],
        selector: masterLabel,
      },
    });

    // Slave Service (Read-only)
    new KubeService(this, "MySQLSlaveService", {
      metadata: {
        name: "mysql-slave",
        labels: slaveLabel,
      },
      spec: {
        ports: [
          {
            port: 3306,
            targetPort: IntOrString.fromNumber(3306),
            name: "mysql",
          },
        ],
        selector: slaveLabel,
      },
    });

    // MySQL StatefulSet
    new KubeStatefulSet(this, "MySQLStatefulSet", {
      metadata: {
        name: "mysql",
        labels: appLabel,
      },
      spec: {
        serviceName: "mysql-headless",
        replicas: replicas,
        selector: {
          matchLabels: appLabel,
        },
        template: {
          metadata: {
            labels: appLabel,
          },
          spec: {
            initContainers: [
              {
                name: "init-mysql",
                image: "mysql:8.0",
                command: [
                  "bash",
                  "-c",
                  `
set -ex
# Generate server-id from pod ordinal index
[[ $(hostname) =~ -([0-9]+)$ ]] || exit 1
ordinal=\${BASH_REMATCH[1]}
echo [mysqld] > /mnt/conf.d/server-id.cnf
echo server-id=$((100 + $ordinal)) >> /mnt/conf.d/server-id.cnf
# Copy appropriate conf.d files based on role (master or slave)
if [[ $ordinal -eq 0 ]]; then
  cp /mnt/config-map/master.cnf /mnt/conf.d/
else
  cp /mnt/config-map/slave.cnf /mnt/conf.d/
fi
                  `.trim(),
                ],
                volumeMounts: [
                  { name: "conf", mountPath: "/mnt/conf.d" },
                  { name: "config-map", mountPath: "/mnt/config-map" },
                ],
              },
              {
                name: "clone-mysql",
                image: "gcr.io/google-samples/xtrabackup:1.0",
                command: [
                  "bash",
                  "-c",
                  `
set -ex
# Skip clone on master (ordinal index 0)
[[ -d /var/lib/mysql/mysql ]] && exit 0
[[ $(hostname) =~ -([0-9]+)$ ]] || exit 1
ordinal=\${BASH_REMATCH[1]}
[[ $ordinal -eq 0 ]] && exit 0
# Clone data from previous peer
ncat --recv-only mysql-$(($ordinal-1)).mysql-headless 3307 | xbstream -x -C /var/lib/mysql
# Prepare the backup
xtrabackup --prepare --target-dir=/var/lib/mysql
                  `.trim(),
                ],
                volumeMounts: [
                  { name: "data", mountPath: "/var/lib/mysql", subPath: "mysql" },
                  { name: "conf", mountPath: "/etc/mysql/conf.d" },
                ],
              },
            ],
            containers: [
              {
                name: "mysql",
                image: "mysql:8.0",
                env: [
                  {
                    name: "MYSQL_ROOT_PASSWORD",
                    value: rootPassword,
                  },
                  {
                    name: "MYSQL_DATABASE",
                    value: database,
                  },
                ],
                ports: [{ containerPort: 3306, name: "mysql" }],
                volumeMounts: [
                  { name: "data", mountPath: "/var/lib/mysql", subPath: "mysql" },
                  { name: "conf", mountPath: "/etc/mysql/conf.d" },
                ],
                resources: {
                  requests: {
                    cpu: Quantity.fromString("500m"),
                    memory: Quantity.fromString("1Gi"),
                  },
                  limits: {
                    cpu: Quantity.fromString("1000m"),
                    memory: Quantity.fromString("2Gi"),
                  },
                },
                livenessProbe: {
                  exec: {
                    command: ["mysqladmin", "ping", "-h", "localhost"],
                  },
                  initialDelaySeconds: 30,
                  periodSeconds: 10,
                  timeoutSeconds: 5,
                },
                readinessProbe: {
                  exec: {
                    command: [
                      "mysql",
                      "-h",
                      "127.0.0.1",
                      `-p${rootPassword}`,
                      "-e",
                      "SELECT 1",
                    ],
                  },
                  initialDelaySeconds: 10,
                  periodSeconds: 5,
                  timeoutSeconds: 2,
                },
              },
              {
                name: "xtrabackup",
                image: "gcr.io/google-samples/xtrabackup:1.0",
                ports: [{ containerPort: 3307, name: "xtrabackup" }],
                command: [
                  "bash",
                  "-c",
                  `
set -ex
cd /var/lib/mysql
# Determine binlog position (if any)
if [[ -f xtrabackup_slave_info && "x$(<xtrabackup_slave_info)" != "x" ]]; then
  cat xtrabackup_slave_info | sed -E 's/;$//g' > change_master_to.sql.in
  rm -f xtrabackup_slave_info xtrabackup_binlog_info
elif [[ -f xtrabackup_binlog_info ]]; then
  [[ $(cat xtrabackup_binlog_info) =~ ^(.*?)[[:space:]]+(.*?)$ ]] || exit 1
  rm -f xtrabackup_binlog_info xtrabackup_slave_info
  echo "CHANGE MASTER TO MASTER_LOG_FILE='\${BASH_REMATCH[1]}',\\
        MASTER_LOG_POS=\${BASH_REMATCH[2]}" > change_master_to.sql.in
fi

# Check if we need to complete a clone by starting replication
if [[ -f change_master_to.sql.in ]]; then
  echo "Waiting for mysqld to be ready (accepting connections)"
  until mysql -h 127.0.0.1 -p${rootPassword} -e "SELECT 1"; do sleep 1; done

  echo "Initializing replication from clone position"
  mysql -h 127.0.0.1 -p${rootPassword} \\
        -e "$(<change_master_to.sql.in), \\
                MASTER_HOST='mysql-0.mysql-headless', \\
                MASTER_USER='root', \\
                MASTER_PASSWORD='${rootPassword}', \\
                MASTER_CONNECT_RETRY=10; \\
              START SLAVE;" || exit 1
  mv change_master_to.sql.in change_master_to.sql.orig
fi

# Start a server to send backups when requested by peers
exec ncat --listen --keep-open --send-only --max-conns=1 3307 -c \\
  "xtrabackup --backup --slave-info --stream=xbstream --host=127.0.0.1 --user=root --password=${rootPassword}"
                  `.trim(),
                ],
                volumeMounts: [
                  { name: "data", mountPath: "/var/lib/mysql", subPath: "mysql" },
                  { name: "conf", mountPath: "/etc/mysql/conf.d" },
                ],
                resources: {
                  requests: {
                    cpu: Quantity.fromString("100m"),
                    memory: Quantity.fromString("100Mi"),
                  },
                  limits: {
                    cpu: Quantity.fromString("200m"),
                    memory: Quantity.fromString("200Mi"),
                  },
                },
              },
            ],
            volumes: [
              { name: "conf", emptyDir: {} },
              { name: "config-map", configMap: { name: "mysql-config" } },
            ],
          },
        },
        volumeClaimTemplates: [
          {
            metadata: {
              name: "data",
            },
            spec: {
              accessModes: ["ReadWriteOnce"],
              resources: {
                requests: {
                  storage: Quantity.fromString("10Gi"),
                },
              },
            },
          },
        ],
      },
    });
  }
}
