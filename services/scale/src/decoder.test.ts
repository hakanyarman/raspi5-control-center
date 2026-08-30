import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decodeWeightKg } from "./decoder";

describe("decodeWeightKg", () => {
  it("decodes weight after Noble's two-byte manufacturer prefix", () => {
    const manufacturerData = Buffer.from([0x00, 0x00, 0x24, 0xe8]);

    assert.equal(decodeWeightKg(manufacturerData), 94.48);
  });

  it("ignores payloads too short to contain the weight field", () => {
    assert.equal(decodeWeightKg(Buffer.from([0x00, 0x00, 0x24])), null);
  });
});
