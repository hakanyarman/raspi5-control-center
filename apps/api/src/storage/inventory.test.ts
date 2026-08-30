import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseStorageDevices } from "./inventory";

describe("parseStorageDevices", () => {
  it("normalizes root NVMe and connected USB storage without zram", () => {
    const devices = parseStorageDevices(JSON.stringify({
      blockdevices: [
        { path: "/dev/zram0", type: "disk", size: 2_000, fstype: "swap" },
        {
          path: "/dev/nvme0n1", type: "disk", size: 256_000, model: "Samsung ", tran: "nvme", rm: false, ro: false,
          children: [{ path: "/dev/nvme0n1p2", type: "part", size: 250_000, fstype: "ext4", mountpoints: ["/"] }],
        },
        {
          path: "/dev/sda", type: "disk", size: 1_000_000, model: "Archive Drive", tran: "usb", rm: false, ro: false,
          children: [{ path: "/dev/sda1", type: "part", size: 999_000, fstype: "exfat", mountpoints: ["/media/archive"] }],
        },
      ],
    }));

    assert.equal(devices.length, 2);
    assert.equal(devices[0]?.isRoot, true);
    assert.equal(devices[0]?.model, "Samsung");
    assert.equal(devices[1]?.isExternal, true);
    assert.equal(devices[1]?.volumes[0]?.mountPoint, "/media/archive");
  });

  it("keeps an unmounted filesystem visible with null mount state", () => {
    const [device] = parseStorageDevices(JSON.stringify({
      blockdevices: [{
        path: "/dev/sdb", type: "disk", size: 1000, model: null, tran: "usb", rm: true, ro: true,
        children: [{ path: "/dev/sdb1", type: "part", size: 900, fstype: "ext4", mountpoints: [] }],
      }],
    }));
    assert.equal(device?.readOnly, true);
    assert.equal(device?.volumes[0]?.mountPoint, null);
  });
});
