import { promises as fs } from "node:fs";
import { hostname, networkInterfaces } from "node:os";

export interface NetworkMetrics {
  hostname: string;
  interfaceName: string | null;
  ipv4Address: string | null;
  connected: boolean;
  receivedBytes: number | null;
  transmittedBytes: number | null;
  downloadBytesPerSecond: number | null;
  uploadBytesPerSecond: number | null;
  collectedAt: string;
}

interface NetworkSample {
  interfaceName: string;
  receivedBytes: number;
  transmittedBytes: number;
  sampledAtMs: number;
  downloadBytesPerSecond: number | null;
  uploadBytesPerSecond: number | null;
}

let previousSample: NetworkSample | null = null;

async function readText(path: string): Promise<string | null> {
  try {
    return (await fs.readFile(path, "utf8")).trim();
  } catch {
    return null;
  }
}

async function findDefaultRouteInterface(): Promise<string | null> {
  const routeTable = await readText("/proc/net/route");
  if (!routeTable) return null;

  let selectedRoute: { interfaceName: string; metric: number } | null = null;
  for (const line of routeTable.split("\n").slice(1)) {
    const columns = line.trim().split(/\s+/);
    const interfaceName = columns[0];
    const destination = columns[1];
    const flags = Number.parseInt(columns[3] ?? "0", 16);
    const metric = Number(columns[6] ?? Number.POSITIVE_INFINITY);
    if (
      interfaceName &&
      destination === "00000000" &&
      Number.isFinite(flags) &&
      (flags & 0x1) === 0x1
    ) {
      if (!selectedRoute || metric < selectedRoute.metric) {
        selectedRoute = { interfaceName, metric };
      }
    }
  }

  return selectedRoute?.interfaceName ?? null;
}

function isPhysicalCandidate(interfaceName: string): boolean {
  return !(
    interfaceName === "lo" ||
    interfaceName === "docker0" ||
    interfaceName.startsWith("br-") ||
    interfaceName.startsWith("veth")
  );
}

async function findActiveInterface(): Promise<string | null> {
  const defaultRouteInterface = await findDefaultRouteInterface();
  if (defaultRouteInterface) return defaultRouteInterface;

  const interfaces = networkInterfaces();
  for (const interfaceName of Object.keys(interfaces).sort()) {
    if (!isPhysicalCandidate(interfaceName)) continue;
    const state = await readText(`/sys/class/net/${interfaceName}/operstate`);
    const hasIpv4 = interfaces[interfaceName]?.some(
      (address) => address.family === "IPv4" && !address.internal,
    );
    if (state === "up" && hasIpv4) return interfaceName;
  }

  return null;
}

function findIpv4Address(interfaceName: string): string | null {
  const address = networkInterfaces()[interfaceName]?.find(
    (candidate) => candidate.family === "IPv4" && !candidate.internal,
  );
  return address?.address ?? null;
}

async function readCounter(
  interfaceName: string,
  counter: "rx_bytes" | "tx_bytes",
): Promise<number | null> {
  const value = await readText(
    `/sys/class/net/${interfaceName}/statistics/${counter}`,
  );
  if (!value || !/^\d+$/.test(value)) return null;
  const bytes = Number(value);
  return Number.isSafeInteger(bytes) ? bytes : null;
}

function calculateRates(
  interfaceName: string,
  receivedBytes: number,
  transmittedBytes: number,
  sampledAtMs: number,
): Pick<
  NetworkMetrics,
  "downloadBytesPerSecond" | "uploadBytesPerSecond"
> {
  if (!previousSample || previousSample.interfaceName !== interfaceName) {
    previousSample = {
      interfaceName,
      receivedBytes,
      transmittedBytes,
      sampledAtMs,
      downloadBytesPerSecond: null,
      uploadBytesPerSecond: null,
    };
    return { downloadBytesPerSecond: null, uploadBytesPerSecond: null };
  }

  const elapsedSeconds = (sampledAtMs - previousSample.sampledAtMs) / 1_000;
  if (elapsedSeconds < 0.5) {
    return {
      downloadBytesPerSecond: previousSample.downloadBytesPerSecond,
      uploadBytesPerSecond: previousSample.uploadBytesPerSecond,
    };
  }

  const downloadBytesPerSecond = Math.max(
    0,
    Math.round((receivedBytes - previousSample.receivedBytes) / elapsedSeconds),
  );
  const uploadBytesPerSecond = Math.max(
    0,
    Math.round(
      (transmittedBytes - previousSample.transmittedBytes) / elapsedSeconds,
    ),
  );
  previousSample = {
    interfaceName,
    receivedBytes,
    transmittedBytes,
    sampledAtMs,
    downloadBytesPerSecond,
    uploadBytesPerSecond,
  };

  return { downloadBytesPerSecond, uploadBytesPerSecond };
}

export async function collectNetworkMetrics(): Promise<NetworkMetrics> {
  const interfaceName = await findActiveInterface();
  const collectedAt = new Date().toISOString();

  if (!interfaceName) {
    previousSample = null;
    return {
      hostname: hostname(),
      interfaceName: null,
      ipv4Address: null,
      connected: false,
      receivedBytes: null,
      transmittedBytes: null,
      downloadBytesPerSecond: null,
      uploadBytesPerSecond: null,
      collectedAt,
    };
  }

  const [operstate, receivedBytes, transmittedBytes] = await Promise.all([
    readText(`/sys/class/net/${interfaceName}/operstate`),
    readCounter(interfaceName, "rx_bytes"),
    readCounter(interfaceName, "tx_bytes"),
  ]);
  const ipv4Address = findIpv4Address(interfaceName);
  const rates =
    receivedBytes === null || transmittedBytes === null
      ? { downloadBytesPerSecond: null, uploadBytesPerSecond: null }
      : calculateRates(
          interfaceName,
          receivedBytes,
          transmittedBytes,
          Date.now(),
        );

  return {
    hostname: hostname(),
    interfaceName,
    ipv4Address,
    connected: operstate === "up" && ipv4Address !== null,
    receivedBytes,
    transmittedBytes,
    ...rates,
    collectedAt,
  };
}
