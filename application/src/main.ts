import { App } from "cdk8s";
import { EtcdClusterChart } from "./etcd";
import { NginxChart } from "./nginx";
import { MySQLChart } from "./mysql";
import { KafkaChart } from "./kafka";

const app = new App();

// Enable the charts you want to deploy by uncommenting them:

new EtcdClusterChart(app, "etcd-cluster");

new NginxChart(app, "nginx", {
  replicas: 2,
  serviceType: "ClusterIP",
});

new MySQLChart(app, "mysql", {
  replicas: 2,
  rootPassword: "strong_password",
  database: "mydb",
});

new KafkaChart(app, "kafka", {
  replicas: 3,
  clusterId: "kafka-cluster-prod",
});

app.synth();
