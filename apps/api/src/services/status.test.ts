import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  collectServicesStatus,
  parseDockerContainers,
  parseDockerRestartCounts,
  parseSystemctlProperties,
} from "./status";

describe("parseDockerContainers", () => {
  it("joins docker ps identity with one-shot resource stats", () => {
    const containers = parseDockerContainers(
      JSON.stringify({
        ID: "abc123",
        Image: "postgres:17",
        Names: "raspi5-postgres",
        State: "running",
        Status: "Up 2 hours (healthy)",
        HealthStatus: "healthy",
        RunningFor: "2 hours ago",
        Ports: "127.0.0.1:5432->5432/tcp",
      }),
      JSON.stringify({
        Name: "raspi5-postgres",
        CPUPerc: "1.25%",
        MemUsage: "42MiB / 4GiB",
        MemPerc: "1.03%",
        NetIO: "1MB / 2MB",
        BlockIO: "5MB / 1MB",
        PIDs: "7",
      }),
    );

    assert.deepEqual(containers, [
      {
        id: "abc123",
        name: "raspi5-postgres",
        image: "postgres:17",
        state: "running",
        status: "Up 2 hours (healthy)",
        health: "healthy",
        runningFor: "2 hours ago",
        ports: "127.0.0.1:5432->5432/tcp",
        cpuPercent: 1.25,
        memoryUsage: "42MiB / 4GiB",
        memoryPercent: 1.03,
        networkIo: "1MB / 2MB",
        blockIo: "5MB / 1MB",
        pids: 7,
        restartCount: null,
      },
    ]);
  });

  it("parses restart counts without exposing inspect metadata", () => {
    assert.deepEqual(
      [...parseDockerRestartCounts('"/raspi5-postgres" 0\n"/hello-pi" 3\n').entries()],
      [["raspi5-postgres", 0], ["hello-pi", 3]],
    );
  });

  it("keeps container identity when stats are unavailable", () => {
    const [container] = parseDockerContainers(
      JSON.stringify({ ID: "abc", Names: "demo", Image: "demo:latest", State: "running" }),
      "",
    );
    assert.equal(container?.cpuPercent, null);
    assert.equal(container?.memoryUsage, null);
    assert.equal(container?.health, "none");
  });

  it("treats unsupported zero-byte memory stats as unavailable", () => {
    const [container] = parseDockerContainers(
      JSON.stringify({ ID: "abc", Names: "demo", Image: "demo", State: "running" }),
      JSON.stringify({ Name: "demo", MemUsage: "0B / 0B", MemPerc: "0.00%" }),
    );
    assert.equal(container?.memoryUsage, null);
    assert.equal(container?.memoryPercent, null);
  });
});

describe("collectServicesStatus", () => {
  it("keeps API output when Docker, systemd, and web collectors fail", async () => {
    const result = await collectServicesStatus({
      docker: async () => { throw new Error("docker unavailable"); },
      scale: async () => { throw new Error("systemd unavailable"); },
      web: async () => { throw new Error("web unavailable"); },
    });

    assert.equal(result.dockerAvailable, false);
    assert.deepEqual(result.containers, []);
    assert.equal(result.processes.find(({ id }) => id === "api")?.active, true);
    assert.equal(result.processes.find(({ id }) => id === "web")?.state, "unknown");
    assert.equal(result.processes.find(({ id }) => id === "scale")?.state, "unknown");
  });
});

describe("parseSystemctlProperties", () => {
  it("normalizes scale service state and uptime", () => {
    const status = parseSystemctlProperties(
      [
        "MainPID=1234",
        "NRestarts=2",
        "ExecMainStartTimestamp=Sun 2026-08-30 22:00:00 +03",
        "ActiveState=active",
        "SubState=running",
      ].join("\n"),
      Date.parse("2026-08-30T20:00:00.000Z"),
    );
    assert.equal(status.active, true);
    assert.equal(status.pid, 1234);
    assert.equal(status.restarts, 2);
    assert.equal(status.uptimeSeconds, 3_600);
  });
});
