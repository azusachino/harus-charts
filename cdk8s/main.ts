import { Construct } from 'constructs';
import { App, Chart, ChartProps } from 'cdk8s';
import { KubeStatefulSet, KubeService } from './imports/k8s';

export class EtcdClusterChart extends Chart {
  constructor(scope: Construct, id: string, props: ChartProps = { }) {
    super(scope, id, props);

    const appLabel = { app: 'etcd' };
    const namespace = props.namespace || 'default';
    const headlessServiceName = 'etcd-headless';
    const clientServiceName = 'etcd-client';
    const replicas = 3;

    // Headless Service for Peer Discovery
    new KubeService(this, 'EtcdHeadlessService', {
      metadata: {
        name: headlessServiceName,
        labels: appLabel,
      },
      spec: {
        clusterIp: 'None',
        ports: [
          { port: 2380, name: 'peer' },
          { port: 2379, name: 'client' },
        ],
        selector: appLabel,
      },
    });

    // Client Service
    new KubeService(this, 'EtcdClientService', {
      metadata: {
        name: clientServiceName,
        labels: appLabel,
      },
      spec: {
        ports: [
          { port: 2379, name: 'client' },
        ],
        selector: appLabel,
      },
    });

    // Construct the initial cluster string dynamically based on replicas
    // e.g., etcd-0=http://etcd-0.etcd-headless.default.svc.cluster.local:2380,...
    let initialCluster: string[] = [];
    for (let i = 0; i < replicas; i++) {
        initialCluster.push(`etcd-${i}=http://etcd-${i}.${headlessServiceName}.${namespace}.svc.cluster.local:2380`);
    }

    // StatefulSet
    new KubeStatefulSet(this, 'EtcdStatefulSet', {
      metadata: {
        name: 'etcd',
        labels: appLabel,
      },
      spec: {
        serviceName: headlessServiceName,
        replicas: replicas,
        selector: {
          matchLabels: appLabel,
        },
        template: {
          metadata: {
            labels: appLabel,
          },
          spec: {
            containers: [
              {
                name: 'etcd',
                image: 'registry.k8s.io/etcd:3.5.6-0',
                ports: [
                  { containerPort: 2380, name: 'peer' },
                  { containerPort: 2379, name: 'client' },
                ],
                env: [
                    {
                        name: 'MY_POD_NAME',
                        valueFrom: { fieldRef: { fieldPath: 'metadata.name' } }
                    },
                    {
                        name: 'MY_POD_NAMESPACE',
                        valueFrom: { fieldRef: { fieldPath: 'metadata.namespace' } }
                    },
                    {
                        name: 'MY_POD_IP',
                        valueFrom: { fieldRef: { fieldPath: 'status.podIP' } }
                    }
                ],
                command: [
                    '/usr/local/bin/etcd',
                    '--name=$(MY_POD_NAME)',
                    '--data-dir=/var/run/etcd/default.etcd',
                    '--listen-peer-urls=http://0.0.0.0:2380',
                    '--listen-client-urls=http://0.0.0.0:2379',
                    '--advertise-client-urls=http://$(MY_POD_IP):2379',
                    // Note: This relies on DNS resolution which requires the headless service
                    `--initial-advertise-peer-urls=http://$(MY_POD_NAME).${headlessServiceName}.$(MY_POD_NAMESPACE).svc.cluster.local:2380`,
                    '--initial-cluster-token=etcd-cluster-1',
                    `--initial-cluster=${initialCluster.join(',')}`,
                    '--initial-cluster-state=new'
                ],
              },
            ],
          },
        },
      },
    });
  }
}

const app = new App();
new EtcdClusterChart(app, 'etcd-cluster');
app.synth();