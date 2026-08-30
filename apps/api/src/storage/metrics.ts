import type { StorageMetrics } from "@raspi5-control-center/shared";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { promisify } from "node:util";

export type { StorageMetrics } from "@raspi5-control-center/shared";

interface BlockDevice {
  path?: string;
  type?: string;
  fstype?: string | null;
  mountpoints?: Array<string | null> | null;
  model?: string | null;
  tran?: string | null;
  children?: BlockDevice[];
}

interface BlockDeviceTree {
  blockdevices?: BlockDevice[];
}

interface RootBlockDevice {
  device: BlockDevice;
  drive: BlockDevice;
}

const execFileAsync = promisify(execFile);

function findRootDevice(
  devices: BlockDevice[],
  drive: BlockDevice | null = null,
): RootBlockDevice | null {
  for (const device of devices) {
    const currentDrive = device.type === "disk" ? device : drive;
    if (device.mountpoints?.includes("/") && currentDrive) {
      return { device, drive: currentDrive };
    }
    const nested = findRootDevice(device.children ?? [], currentDrive);
    if (nested) return nested;
  }
  return null;
}

export function parseRootBlockDevice(output: string): Pick<
  StorageMetrics,
  "devicePath" | "drivePath" | "model" | "transport" | "filesystem" | "mountPoint"
> {
  const tree = JSON.parse(output) as BlockDeviceTree;
  const root = findRootDevice(tree.blockdevices ?? []);
  if (!root?.device.path || !root.drive.path || !root.device.fstype) {
    throw new Error("Root block device metadata is unavailable");
  }
  return {
    devicePath: root.device.path,
    drivePath: root.drive.path,
    model: root.drive.model?.trim() || null,
    transport: root.drive.tran?.trim() || null,
    filesystem: root.device.fstype,
    mountPoint: "/",
  };
}

export async function collectStorageMetrics(): Promise<StorageMetrics> {
  const [{ stdout }, stats] = await Promise.all([
    execFileAsync(
      "lsblk",
      // NAME keeps lsblk's parent/child tree; PATH alone is emitted as a flat list.
      ["-J", "-b", "-o", "NAME,PATH,TYPE,FSTYPE,MOUNTPOINTS,MODEL,TRAN"],
      { timeout: 1_000, maxBuffer: 256 * 1024 },
    ),
    fs.statfs("/", { bigint: true }),
  ]);
  const metadata = parseRootBlockDevice(stdout);
  const totalBytes = Number(stats.blocks * stats.bsize);
  const availableBytes = Number(stats.bavail * stats.bsize);
  const usedBytes = totalBytes - Number(stats.bfree * stats.bsize);
  const usageBase = usedBytes + availableBytes;

  return {
    ...metadata,
    totalBytes,
    usedBytes,
    availableBytes,
    usagePercent: usageBase === 0 ? 0 : Math.round((usedBytes / usageBase) * 100),
    collectedAt: new Date().toISOString(),
  };
}
