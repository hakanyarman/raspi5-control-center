import type {
  DockerContainerStatus,
  ProcessServiceStatus,
  ServicesStatus,
} from "@raspi5-control-center/shared";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

export type {
  DockerContainerStatus,
  ProcessServiceStatus,
  ServicesStatus,
} from "@raspi5-control-center/shared";

interface DockerPsRow {
  ID?: string;
  Image?: string;
  Names?: string;
  State?: string;
  Status?: string;
  HealthStatus?: string;
  RunningFor?: string;
  Ports?: string;
}

interface DockerStatsRow {
  Name?: string;
  CPUPerc?: string;
  MemUsage?: string;
  MemPerc?: string;
  NetIO?: string;
  BlockIO?: string;
  PIDs?: string;
}

interface ServicesCollectors {
  docker: () => Promise<DockerContainerStatus[]>;
  scale: () => Promise<ProcessServiceStatus>;
  web: () => Promise<ProcessServiceStatus>;
}

const execFileAsync = promisify(execFile);

function parseJsonLines<T>(output: string): T[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function parsePercent(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value.replace("%", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseInteger(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function normalizeHealth(
  health: string | undefined,
): DockerContainerStatus["health"] {
  if (health === "healthy" || health === "unhealthy" || health === "starting") {
    return health;
  }
  return health === "none" || !health ? "none" : "unknown";
}

export function parseDockerContainers(
  psOutput: string,
  statsOutput: string,
): DockerContainerStatus[] {
  const statsByName = new Map(
    parseJsonLines<DockerStatsRow>(statsOutput).map((row) => [row.Name, row]),
  );
  return parseJsonLines<DockerPsRow>(psOutput).map((row) => {
    const stats = statsByName.get(row.Names);
    const memoryUnavailable = stats?.MemUsage?.replaceAll(" ", "") === "0B/0B";
    return {
      id: row.ID ?? "unknown",
      name: row.Names ?? "unknown",
      image: row.Image ?? "unknown",
      state: row.State ?? "unknown",
      status: row.Status ?? "unknown",
      health: normalizeHealth(row.HealthStatus),
      runningFor: row.RunningFor ?? "unknown",
      ports: row.Ports || null,
      cpuPercent: parsePercent(stats?.CPUPerc),
      memoryUsage: memoryUnavailable ? null : stats?.MemUsage || null,
      memoryPercent: memoryUnavailable ? null : parsePercent(stats?.MemPerc),
      networkIo: stats?.NetIO || null,
      blockIo: stats?.BlockIO || null,
      pids: parseInteger(stats?.PIDs),
      restartCount: null,
    };
  });
}

export function parseDockerRestartCounts(output: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const line of output.split("\n").map((value) => value.trim()).filter(Boolean)) {
    const separator = line.lastIndexOf(" ");
    if (separator < 0) continue;
    try {
      const rawName = JSON.parse(line.slice(0, separator)) as string;
      const count = parseInteger(line.slice(separator + 1));
      if (count !== null) counts.set(rawName.replace(/^\//, ""), count);
    } catch {
      // Ignore a malformed inspect row and keep the remaining containers.
    }
  }
  return counts;
}

export function parseSystemctlProperties(
  output: string,
  nowMs = Date.now(),
): ProcessServiceStatus {
  const values = new Map(
    output
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)] as const;
      }),
  );
  const active = values.get("ActiveState") === "active";
  const started = values.get("ExecMainStartTimestamp") || null;
  const startedMs = started ? Date.parse(started) : Number.NaN;
  return {
    id: "scale",
    label: "BLE Tartı",
    active,
    state: values.get("ActiveState") ?? "unknown",
    detail: values.get("SubState") ?? "unknown",
    pid: parseInteger(values.get("MainPID")),
    startedAt: Number.isFinite(startedMs) ? new Date(startedMs).toISOString() : null,
    uptimeSeconds: Number.isFinite(startedMs)
      ? Math.max(0, Math.floor((nowMs - startedMs) / 1_000))
      : null,
    restarts: parseInteger(values.get("NRestarts")),
  };
}

async function collectDockerContainers(): Promise<DockerContainerStatus[]> {
  const ps = await execFileAsync(
    "docker",
    ["ps", "--all", "--format", "{{json .}}"],
    { timeout: 2_000, maxBuffer: 512 * 1024 },
  );
  const stats = await execFileAsync(
    "docker",
    ["stats", "--no-stream", "--format", "{{json .}}"],
    { timeout: 3_000, maxBuffer: 512 * 1024 },
  ).then(
    (result) => result.stdout,
    () => "",
  );
  const containers = parseDockerContainers(ps.stdout, stats);
  const ids = containers
    .map(({ id }) => id)
    .filter((id) => /^[0-9a-f]{12,64}$/.test(id));
  if (ids.length === 0) return containers;
  const restartCounts = await execFileAsync(
    "docker",
    ["inspect", "--format", "{{json .Name}} {{.RestartCount}}", ...ids],
    { timeout: 2_000, maxBuffer: 64 * 1024 },
  ).then(
    ({ stdout }) => parseDockerRestartCounts(stdout),
    () => new Map<string, number>(),
  );
  return containers.map((container) => ({
    ...container,
    restartCount: restartCounts.get(container.name) ?? null,
  }));
}

async function collectScaleStatus(): Promise<ProcessServiceStatus> {
  const { stdout } = await execFileAsync(
    "systemctl",
    [
      "show",
      "raspi5-scale.service",
      "--no-pager",
      "-p",
      "ActiveState",
      "-p",
      "SubState",
      "-p",
      "MainPID",
      "-p",
      "ExecMainStartTimestamp",
      "-p",
      "NRestarts",
    ],
    { timeout: 1_000, maxBuffer: 64 * 1024 },
  );
  return parseSystemctlProperties(stdout);
}

async function collectWebStatus(): Promise<ProcessServiceStatus> {
  try {
    const response = await fetch("http://127.0.0.1:5173", {
      method: "HEAD",
      signal: AbortSignal.timeout(700),
    });
    return {
      id: "web",
      label: "Web Dashboard",
      active: response.ok,
      state: response.ok ? "active" : "unavailable",
      detail: response.ok ? "HTTP :5173" : `HTTP ${response.status}`,
      pid: null,
      startedAt: null,
      uptimeSeconds: null,
      restarts: null,
    };
  } catch {
    return {
      id: "web",
      label: "Web Dashboard",
      active: false,
      state: "unavailable",
      detail: "Port 5173 yanıt vermiyor",
      pid: null,
      startedAt: null,
      uptimeSeconds: null,
      restarts: null,
    };
  }
}

function apiStatus(): ProcessServiceStatus {
  const uptimeSeconds = Math.floor(process.uptime());
  return {
    id: "api",
    label: "Express API",
    active: true,
    state: "active",
    detail: "Loopback :3001",
    pid: process.pid,
    startedAt: new Date(Date.now() - uptimeSeconds * 1_000).toISOString(),
    uptimeSeconds,
    restarts: null,
  };
}

function unavailableScaleStatus(): ProcessServiceStatus {
  return {
    id: "scale",
    label: "BLE Tartı",
    active: false,
    state: "unknown",
    detail: "systemd durumu okunamadı",
    pid: null,
    startedAt: null,
    uptimeSeconds: null,
    restarts: null,
  };
}

function unavailableWebStatus(): ProcessServiceStatus {
  return {
    id: "web",
    label: "Web Dashboard",
    active: false,
    state: "unknown",
    detail: "web durumu okunamadı",
    pid: null,
    startedAt: null,
    uptimeSeconds: null,
    restarts: null,
  };
}

export async function collectServicesStatus(
  collectors: ServicesCollectors = {
    docker: collectDockerContainers,
    scale: collectScaleStatus,
    web: collectWebStatus,
  },
): Promise<ServicesStatus> {
  const [dockerResult, scaleResult, web] = await Promise.all([
    collectors.docker().then(
      (containers) => ({ available: true, containers }),
      () => ({ available: false, containers: [] as DockerContainerStatus[] }),
    ),
    collectors.scale().catch(unavailableScaleStatus),
    collectors.web().catch(unavailableWebStatus),
  ]);
  return {
    dockerAvailable: dockerResult.available,
    containers: dockerResult.containers,
    processes: [apiStatus(), web, scaleResult],
    collectedAt: new Date().toISOString(),
  };
}
