import { Construct } from "constructs";
import { Chart, ChartProps } from "cdk8s";
import {
  KubeStatefulSet,
  KubeService,
  IntOrString,
  Quantity,
} from "../imports/k8s";

export interface KafkaChartProps extends ChartProps {
  replicas?: number;
  clusterId?: string;
}

export class KafkaChart extends Chart {
  constructor(scope: Construct, id: string, props: KafkaChartProps = {}) {
    super(scope, id, props);

    const replicas = props.replicas || 3;
    const clusterId = props.clusterId || "kafka-cluster-1";
    const namespace = props.namespace || "default";

    // Kafka Labels
    const kafkaLabel = { app: "kafka" };

    // Kafka Headless Service (for internal cluster communication)
    new KubeService(this, "KafkaHeadlessService", {
      metadata: {
        name: "kafka-headless",
        labels: kafkaLabel,
      },
      spec: {
        clusterIp: "None",
        ports: [
          { port: 9092, name: "client" },
          { port: 9093, name: "controller" },
        ],
        selector: kafkaLabel,
      },
    });

    // Kafka Client Service
    new KubeService(this, "KafkaService", {
      metadata: {
        name: "kafka",
        labels: kafkaLabel,
      },
      spec: {
        ports: [{ port: 9092, name: "client" }],
        selector: kafkaLabel,
      },
    });

    // Build controller quorum voters string
    // Format: id@host:port,id@host:port,...
    let controllerQuorum: string[] = [];
    for (let i = 0; i < replicas; i++) {
      controllerQuorum.push(
        `${i + 1}@kafka-${i}.kafka-headless.${namespace}.svc.cluster.local:9093`,
      );
    }

    // Kafka StatefulSet with KRaft mode
    new KubeStatefulSet(this, "KafkaStatefulSet", {
      metadata: {
        name: "kafka",
        labels: kafkaLabel,
      },
      spec: {
        serviceName: "kafka-headless",
        replicas: replicas,
        selector: {
          matchLabels: kafkaLabel,
        },
        template: {
          metadata: {
            labels: kafkaLabel,
          },
          spec: {
            containers: [
              {
                name: "kafka",
                image: "confluentinc/cp-kafka:7.5.0",
                ports: [
                  { containerPort: 9092, name: "client" },
                  { containerPort: 9093, name: "controller" },
                ],
                env: [
                  {
                    name: "MY_POD_NAME",
                    valueFrom: { fieldRef: { fieldPath: "metadata.name" } },
                  },
                  {
                    name: "MY_POD_NAMESPACE",
                    valueFrom: {
                      fieldRef: { fieldPath: "metadata.namespace" },
                    },
                  },
                  {
                    name: "MY_POD_IP",
                    valueFrom: { fieldRef: { fieldPath: "status.podIP" } },
                  },
                  {
                    name: "CLUSTER_ID",
                    value: clusterId,
                  },
                  // KRaft Configuration
                  {
                    name: "KAFKA_PROCESS_ROLES",
                    value: "broker,controller",
                  },
                  {
                    name: "KAFKA_CONTROLLER_QUORUM_VOTERS",
                    value: controllerQuorum.join(","),
                  },
                  {
                    name: "KAFKA_LISTENER_SECURITY_PROTOCOL_MAP",
                    value: "CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT",
                  },
                  {
                    name: "KAFKA_INTER_BROKER_LISTENER_NAME",
                    value: "PLAINTEXT",
                  },
                  {
                    name: "KAFKA_CONTROLLER_LISTENER_NAMES",
                    value: "CONTROLLER",
                  },
                  // Replication settings
                  {
                    name: "KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR",
                    value: Math.min(replicas, 3).toString(),
                  },
                  {
                    name: "KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR",
                    value: Math.min(replicas, 3).toString(),
                  },
                  {
                    name: "KAFKA_TRANSACTION_STATE_LOG_MIN_ISR",
                    value: Math.min(replicas - 1, 2).toString(),
                  },
                  {
                    name: "KAFKA_DEFAULT_REPLICATION_FACTOR",
                    value: Math.min(replicas, 3).toString(),
                  },
                  {
                    name: "KAFKA_MIN_INSYNC_REPLICAS",
                    value: Math.min(replicas - 1, 2).toString(),
                  },
                  // Log settings
                  {
                    name: "KAFKA_LOG_DIRS",
                    value: "/var/lib/kafka/data",
                  },
                  {
                    name: "KAFKA_AUTO_CREATE_TOPICS_ENABLE",
                    value: "true",
                  },
                ],
                command: [
                  "bash",
                  "-c",
                  `
set -ex

# Extract pod ordinal from hostname
[[ $(hostname) =~ -([0-9]+)$ ]] || exit 1
ordinal=\${BASH_REMATCH[1]}

# Node ID is 1-based
export KAFKA_NODE_ID=$((ordinal + 1))

# Set advertised listeners
export KAFKA_ADVERTISED_LISTENERS="PLAINTEXT://$(MY_POD_NAME).kafka-headless.$(MY_POD_NAMESPACE).svc.cluster.local:9092"
export KAFKA_LISTENERS="PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:9093"

# Format storage if this is the first time
if [ ! -f /var/lib/kafka/data/meta.properties ]; then
  echo "Formatting storage directory..."
  kafka-storage format -t $CLUSTER_ID -c /etc/kafka/kafka.properties
fi

# Start Kafka
exec /etc/confluent/docker/run
                  `.trim(),
                ],
                volumeMounts: [
                  { name: "data", mountPath: "/var/lib/kafka/data" },
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
                  tcpSocket: { port: IntOrString.fromNumber(9092) },
                  initialDelaySeconds: 60,
                  periodSeconds: 10,
                  timeoutSeconds: 5,
                  failureThreshold: 3,
                },
                readinessProbe: {
                  tcpSocket: { port: IntOrString.fromNumber(9092) },
                  initialDelaySeconds: 20,
                  periodSeconds: 5,
                  timeoutSeconds: 3,
                  failureThreshold: 3,
                },
              },
            ],
          },
        },
        volumeClaimTemplates: [
          {
            metadata: { name: "data" },
            spec: {
              accessModes: ["ReadWriteOnce"],
              resources: {
                requests: {
                  storage: Quantity.fromString("20Gi"),
                },
              },
            },
          },
        ],
      },
    });
  }
}
