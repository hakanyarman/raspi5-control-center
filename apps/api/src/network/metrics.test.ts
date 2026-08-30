import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isPhysicalCandidate,
  NetworkRateTracker,
  parseDefaultRouteInterface,
} from "./metrics";
import { parseNeighborTable } from "./lan-inventory";

describe("parseDefaultRouteInterface", () => {
  it("selects the up default route with the lowest metric", () => {
    const routeTable = [
      "Iface Destination Gateway Flags RefCnt Use Metric Mask MTU Window IRTT",
      "eth0 00000000 0101A8C0 0003 0 0 200 00000000 0 0 0",
      "wlan0 00000000 0101A8C0 0003 0 0 100 00000000 0 0 0",
      "docker0 000011AC 00000000 0001 0 0 0 0000FFFF 0 0 0",
    ].join("\n");

    assert.equal(parseDefaultRouteInterface(routeTable), "wlan0");
  });

  it("ignores default routes that are not marked up", () => {
    const routeTable = [
      "Iface Destination Gateway Flags RefCnt Use Metric Mask MTU Window IRTT",
      "eth0 00000000 0101A8C0 0000 0 0 10 00000000 0 0 0",
    ].join("\n");

    assert.equal(parseDefaultRouteInterface(routeTable), null);
  });
});

describe("isPhysicalCandidate", () => {
  it("excludes loopback and common Docker virtual interfaces", () => {
    assert.equal(isPhysicalCandidate("lo"), false);
    assert.equal(isPhysicalCandidate("docker0"), false);
    assert.equal(isPhysicalCandidate("br-deadbeef"), false);
    assert.equal(isPhysicalCandidate("veth1234"), false);
    assert.equal(isPhysicalCandidate("wlan0"), true);
    assert.equal(isPhysicalCandidate("eth0"), true);
  });
});

describe("NetworkRateTracker", () => {
  it("returns null rates for the first sample", () => {
    const tracker = new NetworkRateTracker();

    assert.deepEqual(tracker.sample("wlan0", 1_000, 2_000, 1_000), {
      downloadBytesPerSecond: null,
      uploadBytesPerSecond: null,
    });
  });

  it("calculates rates from byte and time deltas", () => {
    const tracker = new NetworkRateTracker();
    tracker.sample("wlan0", 1_000, 2_000, 1_000);

    assert.deepEqual(tracker.sample("wlan0", 3_000, 5_000, 3_000), {
      downloadBytesPerSecond: 1_000,
      uploadBytesPerSecond: 1_500,
    });
  });

  it("keeps the last rate for samples closer than 500 ms", () => {
    const tracker = new NetworkRateTracker();
    tracker.sample("wlan0", 1_000, 2_000, 1_000);
    tracker.sample("wlan0", 2_000, 4_000, 2_000);

    assert.deepEqual(tracker.sample("wlan0", 2_100, 4_100, 2_100), {
      downloadBytesPerSecond: 1_000,
      uploadBytesPerSecond: 2_000,
    });
  });

  it("resets when the selected interface changes or counters decrease", () => {
    const tracker = new NetworkRateTracker();
    tracker.sample("wlan0", 5_000, 5_000, 1_000);

    assert.deepEqual(tracker.sample("eth0", 100, 100, 2_000), {
      downloadBytesPerSecond: null,
      uploadBytesPerSecond: null,
    });
    assert.deepEqual(tracker.sample("eth0", 50, 50, 3_000), {
      downloadBytesPerSecond: 0,
      uploadBytesPerSecond: 0,
    });
  });
});

describe("parseNeighborTable", () => {
  it("normalizes valid IPv4/IPv6 observations and states", () => {
    assert.deepEqual(
      parseNeighborTable(
        [
          "192.168.1.121 dev wlan0 lladdr F6:4E:08:06:D7:D3 REACHABLE",
          "fe80::1 dev wlan0 lladdr D8:E8:44:A6:BC:C6 router STALE",
        ].join("\n"),
      ),
      [
        { ipAddress: "192.168.1.121", macAddress: "f6:4e:08:06:d7:d3", interfaceName: "wlan0", state: "reachable" },
        { ipAddress: "fe80::1", macAddress: "d8:e8:44:a6:bc:c6", interfaceName: "wlan0", state: "stale" },
      ],
    );
  });

  it("ignores incomplete and malformed neighbor lines", () => {
    assert.deepEqual(
      parseNeighborTable(
        [
          "192.168.1.1 dev wlan0 FAILED",
          "192.168.1.9 dev wlan0 lladdr not-a-mac REACHABLE",
          "999.1.1.1 dev wlan0 lladdr 00:11:22:33:44:55 REACHABLE",
          "garbage output",
        ].join("\n"),
      ),
      [],
    );
  });
});
