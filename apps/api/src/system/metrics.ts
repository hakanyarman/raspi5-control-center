import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promises as fs } from "node:fs";
import { promisify } from "node:util";
import type { SystemMetrics } from "@raspi5-control-center/shared";

const execFileAsync = promisify(execFile);

export type { SystemMetrics } from "@raspi5-control-center/shared";

interface CpuSnapshot {
  idle: number;
  total: number;
}

function readCpuSnapshot(): CpuSnapshot {
  const line = readFileSync("/proc/stat", "utf8").split("\n")[0] ?? "";
  const values = line
    .trim()
    .split(/\s+/)
    .slice(1)
    .map(Number);
  const idle = (values[3] ?? 0) + (values[4] ?? 0);
  const total = values.reduce((sum, value) => sum + value, 0);
  return { idle, total };
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function readCpuUsagePercent(): Promise<number> {
  const before = readCpuSnapshot();
  await sleep(100);
  const after = readCpuSnapshot();
  const totalDelta = after.total - before.total;
  const idleDelta = after.idle - before.idle;

  if (totalDelta <= 0) return 0;
  return Math.round((100 * (totalDelta - idleDelta)) / totalDelta);
}

async function readTemperatureC(): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync("vcgencmd", ["measure_temp"]);
    const match = stdout.match(/temp=([\d.]+)/);
    return match?.[1] ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

async function readThrottle(): Promise<
  Pick<SystemMetrics, "throttled" | "throttleCode">
> {
  try {
    const { stdout } = await execFileAsync("vcgencmd", ["get_throttled"]);
    const code = stdout.trim().split("=")[1]?.trim();
    if (!code || !/^0x[\da-f]+$/i.test(code)) {
      return { throttled: null, throttleCode: null };
    }

    return { throttled: Number.parseInt(code, 16) !== 0, throttleCode: code };
  } catch {
    return { throttled: null, throttleCode: null };
  }
}

async function readFanRpm(): Promise<number | null> {
  try {
    const hwmonEntries = await fs.readdir("/sys/class/hwmon", {
      withFileTypes: true,
    });

    for (const entry of hwmonEntries) {
      const directory = `/sys/class/hwmon/${entry.name}`;
      const name = (await fs.readFile(`${directory}/name`, "utf8").catch(() => ""))
        .trim()
        .toLowerCase();
      if (!name.includes("pwm") && !name.includes("fan")) continue;

      const files = await fs.readdir(directory);
      const fanInput = files.find((file) => /^fan\d+_input$/.test(file));
      if (!fanInput) continue;

      const rpm = Number.parseInt(
        (await fs.readFile(`${directory}/${fanInput}`, "utf8")).trim(),
        10,
      );
      return Number.isFinite(rpm) ? rpm : null;
    }
  } catch {
    return null;
  }

  return null;
}

async function readMemory() {
  const contents = await fs.readFile("/proc/meminfo", "utf8");
  const values = new Map<string, number>();
  for (const line of contents.split("\n")) {
    const match = line.match(/^(\w+):\s+(\d+)/);
    if (match?.[1] && match[2]) values.set(match[1], Number(match[2]));
  }

  const totalKb = values.get("MemTotal") ?? 0;
  const availableKb = values.get("MemAvailable") ?? 0;
  const usedKb = Math.max(totalKb - availableKb, 0);
  const totalMb = Math.round(totalKb / 1024);
  const availableMb = Math.round(availableKb / 1024);
  const usedMb = Math.round(usedKb / 1024);

  return {
    usedMb,
    totalMb,
    availableMb,
    usagePercent: totalMb > 0 ? Math.round((100 * usedMb) / totalMb) : 0,
  };
}

async function readDisk() {
  const { statfs } = await import("node:fs/promises");
  const stats = await statfs("/");
  const totalBytes = Number(stats.blocks) * Number(stats.bsize);
  const availableBytes = Number(stats.bavail) * Number(stats.bsize);
  const usedBytes = Math.max(totalBytes - availableBytes, 0);
  const totalGb = Math.round(totalBytes / 1024 ** 3);
  const usedGb = Math.round(usedBytes / 1024 ** 3);

  return {
    usedGb,
    totalGb,
    usagePercent: totalBytes > 0 ? Math.round((100 * usedBytes) / totalBytes) : 0,
  };
}

export async function collectSystemMetrics(): Promise<SystemMetrics> {
  const [temperatureC, fanRpm, cpuUsagePercent, memory, disk, throttle] =
    await Promise.all([
      readTemperatureC(),
      readFanRpm(),
      readCpuUsagePercent(),
      readMemory(),
      readDisk(),
      readThrottle(),
    ]);
  const uptimeContents = await fs.readFile("/proc/uptime", "utf8");
  const uptimeSeconds = Math.floor(Number.parseFloat(uptimeContents));
  const [loadAverage] = (await fs.readFile("/proc/loadavg", "utf8"))
    .trim()
    .split(/\s+/)
    .map(Number);

  return {
    temperatureC,
    fanRpm,
    cpuUsagePercent,
    loadAverage: loadAverage ?? 0,
    memory,
    disk,
    ...throttle,
    uptimeSeconds: Number.isFinite(uptimeSeconds) ? uptimeSeconds : 0,
    collectedAt: new Date().toISOString(),
  };
}
