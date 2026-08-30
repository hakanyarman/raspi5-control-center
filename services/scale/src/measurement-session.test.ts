import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MeasurementSession } from "./measurement-session";

function stabilize(
  session: MeasurementSession,
  weight: number,
  startTime = 1_000,
): number | null {
  let stableWeight: number | null = null;
  for (let index = 0; index < 10; index += 1) {
    stableWeight = session.observe(weight, startTime + index * 100).stableWeight;
  }
  return stableWeight;
}

describe("MeasurementSession", () => {
  it("emits the rounded average after ten stable readings", () => {
    const session = new MeasurementSession();
    const readings = [94.01, 94.02, 94.03, 94.04, 94.05, 94.06, 94.07, 94.08, 94.09, 94.1];
    let stableWeight: number | null = null;

    for (const [index, reading] of readings.entries()) {
      stableWeight = session.observe(reading, 1_000 + index * 100).stableWeight;
    }

    assert.equal(stableWeight, 94.06);
  });

  it("does not emit an unstable window", () => {
    const session = new MeasurementSession();
    const readings = [94, 94.2, 94, 94.2, 94, 94.2, 94, 94.2, 94, 94.2];

    for (const [index, reading] of readings.entries()) {
      assert.equal(session.observe(reading, 1_000 + index * 100).stableWeight, null);
    }
  });

  it("ignores further readings after a save until unload", () => {
    const session = new MeasurementSession();
    const savedWeight = stabilize(session, 94);
    assert.equal(savedWeight, 94);
    session.markSaved(savedWeight!, 2_000);

    assert.deepEqual(session.observe(99, 2_100), {
      accepted: false,
      stableWeight: null,
    });
  });

  it("resets immediately on an unload reading", () => {
    const session = new MeasurementSession();
    const savedWeight = stabilize(session, 94);
    session.markSaved(savedWeight!, 2_000);

    assert.deepEqual(session.observe(0, 2_100), {
      accepted: false,
      stableWeight: null,
    });
    assert.equal(stabilize(session, 99, 2_200), 99);
  });

  it("resets after an advertisement gap", () => {
    const session = new MeasurementSession();
    const savedWeight = stabilize(session, 94);
    session.markSaved(savedWeight!, 2_000);

    assert.equal(stabilize(session, 99, 5_101), 99);
  });

  it("suppresses a near-duplicate session within thirty seconds", () => {
    const session = new MeasurementSession();
    const savedWeight = stabilize(session, 94);
    session.markSaved(savedWeight!, 2_000);
    session.observe(0, 2_100);

    assert.equal(stabilize(session, 94.1, 2_200), null);
  });
});
