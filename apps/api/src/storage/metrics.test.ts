import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseRootBlockDevice } from "./metrics";

describe("parseRootBlockDevice", () => {
  it("finds the root partition and inherits parent drive identity", () => {
    const output = JSON.stringify({
      blockdevices: [
        {
          path: "/dev/nvme0n1",
          type: "disk",
          fstype: null,
          mountpoints: [],
          model: "SAMSUNG MZALQ256HAJD-000L2 ",
          tran: "nvme",
          children: [
            {
              path: "/dev/nvme0n1p2",
              type: "part",
              fstype: "ext4",
              mountpoints: ["/"],
              model: null,
              tran: "nvme",
            },
          ],
        },
      ],
    });

    assert.deepEqual(parseRootBlockDevice(output), {
      devicePath: "/dev/nvme0n1p2",
      drivePath: "/dev/nvme0n1",
      model: "SAMSUNG MZALQ256HAJD-000L2",
      transport: "nvme",
      filesystem: "ext4",
      mountPoint: "/",
    });
  });

  it("rejects a tree without mounted root metadata", () => {
    assert.throws(
      () => parseRootBlockDevice('{"blockdevices":[]}'),
      /Root block device metadata is unavailable/,
    );
  });
});
