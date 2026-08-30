export type LanNeighborState = "reachable" | "stale" | "unknown";

export interface LanNeighborObservation {
  ipAddress: string;
  macAddress: string;
  interfaceName: string;
  state: LanNeighborState;
}

const ipv6Pattern = /^[0-9a-f:]+$/i;
const macPattern = /^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i;

function isIpv4(value: string): boolean {
  const octets = value.split(".");
  return (
    octets.length === 4 &&
    octets.every((octet) =>
      /^(?:0|[1-9]\d{0,2})$/.test(octet) && Number(octet) <= 255,
    )
  );
}

function mapState(rawState: string | undefined): LanNeighborState {
  if (rawState === "REACHABLE") return "reachable";
  if (["STALE", "DELAY", "PROBE"].includes(rawState ?? "")) return "stale";
  return "unknown";
}

/** Parse `ip neigh show` output without resolving names or probing devices. */
export function parseNeighborTable(output: string): LanNeighborObservation[] {
  const observations: LanNeighborObservation[] = [];
  for (const line of output.split("\n")) {
    const columns = line.trim().split(/\s+/);
    const ipAddress = columns[0];
    const devIndex = columns.indexOf("dev");
    const macIndex = columns.indexOf("lladdr");
    const interfaceName = devIndex >= 0 ? columns[devIndex + 1] : undefined;
    const macAddress = macIndex >= 0 ? columns[macIndex + 1] : undefined;
    const rawState = columns.find((column) =>
      ["REACHABLE", "STALE", "DELAY", "PROBE", "FAILED", "INCOMPLETE"].includes(column),
    );
    const validIp =
      (ipAddress !== undefined && isIpv4(ipAddress)) ||
      (ipAddress !== undefined && ipv6Pattern.test(ipAddress));
    if (!validIp || !interfaceName || !macAddress || !macPattern.test(macAddress)) continue;
    observations.push({
      ipAddress,
      macAddress: macAddress.toLowerCase(),
      interfaceName,
      state: mapState(rawState),
    });
  }
  return observations;
}
