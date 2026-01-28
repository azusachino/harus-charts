import { Construct } from "constructs";
import { Chart, ChartProps } from "cdk8s";
import {
  KubeDeployment,
  KubeService,
  KubeConfigMap,
  IntOrString,
  Quantity,
} from "../imports/k8s";

export interface NginxChartProps extends ChartProps {
  replicas?: number;
  image?: string;
  serviceType?: string;
}

export class NginxChart extends Chart {
  constructor(scope: Construct, id: string, props: NginxChartProps = {}) {
    super(scope, id, props);

    const appLabel = { app: "nginx" };
    const replicas = props.replicas || 2;
    const image = props.image || "nginx:1.25-alpine";
    const serviceType = props.serviceType || "ClusterIP";

    // ConfigMap for nginx configuration
    new KubeConfigMap(this, "NginxConfigMap", {
      metadata: {
        name: "nginx-config",
        labels: appLabel,
      },
      data: {
        "nginx.conf": `
events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    sendfile on;
    keepalive_timeout 65;

    server {
        listen 80;
        server_name localhost;

        location / {
            root /usr/share/nginx/html;
            index index.html index.htm;
        }

        location /health {
            access_log off;
            return 200 "healthy\\n";
            add_header Content-Type text/plain;
        }
    }
}
        `.trim(),
      },
    });

    // Nginx Deployment
    new KubeDeployment(this, "NginxDeployment", {
      metadata: {
        name: "nginx",
        labels: appLabel,
      },
      spec: {
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
                name: "nginx",
                image: image,
                ports: [{ containerPort: 80, name: "http" }],
                volumeMounts: [
                  {
                    name: "nginx-config",
                    mountPath: "/etc/nginx/nginx.conf",
                    subPath: "nginx.conf",
                  },
                ],
                livenessProbe: {
                  httpGet: {
                    path: "/health",
                    port: IntOrString.fromNumber(80),
                  },
                  initialDelaySeconds: 10,
                  periodSeconds: 10,
                },
                readinessProbe: {
                  httpGet: {
                    path: "/health",
                    port: IntOrString.fromNumber(80),
                  },
                  initialDelaySeconds: 5,
                  periodSeconds: 5,
                },
                resources: {
                  requests: {
                    cpu: Quantity.fromString("100m"),
                    memory: Quantity.fromString("128Mi"),
                  },
                  limits: {
                    cpu: Quantity.fromString("200m"),
                    memory: Quantity.fromString("256Mi"),
                  },
                },
              },
            ],
            volumes: [
              {
                name: "nginx-config",
                configMap: {
                  name: "nginx-config",
                },
              },
            ],
          },
        },
      },
    });

    // Nginx Service
    new KubeService(this, "NginxService", {
      metadata: {
        name: "nginx",
        labels: appLabel,
      },
      spec: {
        type: serviceType,
        ports: [
          {
            port: 80,
            targetPort: IntOrString.fromNumber(80),
            name: "http",
          },
        ],
        selector: appLabel,
      },
    });
  }
}
