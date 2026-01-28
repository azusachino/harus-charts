import { EtcdClusterChart } from "./etcd";
import { Testing } from "cdk8s";

describe("Etcd Cluster", () => {
  test("Snapshot", () => {
    const app = Testing.app();
    const chart = new EtcdClusterChart(app, "test-chart");
    const results = Testing.synth(chart);
    expect(results).toMatchSnapshot();
  });
});
