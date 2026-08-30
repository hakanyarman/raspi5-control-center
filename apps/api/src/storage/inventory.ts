import type {
  StorageDevice,
  StorageInventory,
  StorageVolume,
} from "@raspi5-control-center/shared";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { promisify } from "node:util";

export type {
  StorageDevice,
  StorageInventory,
  StorageVolume,
} from "@raspi5-control-center/shared";

interface BlockDevice {
  path?: string;
  type?: string;
  size?: number;
  fstype?: string | null;
  mountpoints?: Array<string | null> | null;
  model?: string | null;
  tran?: string | null;
  rm?: boolean;
  ro?: boolean;
  children?: BlockDevice[];
}

const execFileAsync = promisify(execFile);

function primaryMountPoint(device: BlockDevice): string | null {
  return device.mountpoints?.find((mount) => mount?.startsWith("/")) ?? null;
}

function collectVolumes(device: BlockDevice): StorageVolume[] {
  const descendants = device.children?.flatMap(collectVolumes) ?? [];
  if (!device.path || (!device.fstype && descendants.length > 0)) return descendants;
  if (!device.path || device.fstype === "swap") return descendants;
  return [
    {
      path: device.path,
      filesystem: device.fstype ?? null,
      mountPoint: primaryMountPoint(device),
      partitionSizeBytes: device.size ?? 0,
      totalBytes: null,
      usedBytes: null,
      availableBytes: null,
      usagePercent: null,
    },
    ...descendants,
  ];
}

export function parseStorageDevices(output: string): StorageDevice[] {
  const tree = JSON.parse(output) as { blockdevices?: BlockDevice[] };
  return (tree.blockdevices ?? [])
    .filter(
      (device) =>
        device.type === "disk" &&
        device.path &&
        !device.path.startsWith("/dev/zram"),
    )
    .map((device) => {
      const volumes = collectVolumes(device);
      const transport = device.tran?.trim() || null;
      const removable = device.rm === true;
      return {
        path: device.path!,
        model: device.model?.trim() || null,
        transport,
        sizeBytes: device.size ?? 0,
        removable,
        readOnly: device.ro === true,
        isRoot: volumes.some(({ mountPoint }) => mountPoint === "/"),
        isExternal: removable || transport === "usb",
        volumes,
      };
    });
}

async function addFilesystemUsage(volume: StorageVolume): Promise<StorageVolume> {
  if (!volume.mountPoint) return volume;
  try {
    const stats = await fs.statfs(volume.mountPoint, { bigint: true });
    const totalBytes = Number(stats.blocks * stats.bsize);
    const availableBytes = Number(stats.bavail * stats.bsize);
    const usedBytes = totalBytes - Number(stats.bfree * stats.bsize);
    const usageBase = usedBytes + availableBytes;
    return {
      ...volume,
      totalBytes,
      usedBytes,
      availableBytes,
      usagePercent:
        usageBase === 0 ? 0 : Math.round((usedBytes / usageBase) * 100),
    };
  } catch {
    return volume;
  }
}

export async function collectStorageInventory(): Promise<StorageInventory> {
  const { stdout } = await execFileAsync(
    "lsblk",
    [
      "-J",
      "-b",
      "-o",
      "NAME,PATH,TYPE,SIZE,FSTYPE,MOUNTPOINTS,MODEL,TRAN,RM,RO",
    ],
    { timeout: 1_000, maxBuffer: 256 * 1024 },
  );
  const devices = await Promise.all(
    parseStorageDevices(stdout).map(async (device) => ({
      ...device,
      volumes: await Promise.all(device.volumes.map(addFilesystemUsage)),
    })),
  );
  return {
    devices,
    externalDriveConnected: devices.some(({ isExternal }) => isExternal),
    collectedAt: new Date().toISOString(),
  };
}
