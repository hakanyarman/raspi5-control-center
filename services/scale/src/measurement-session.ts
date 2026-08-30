export interface MeasurementObservation {
  accepted: boolean;
  stableWeight: number | null;
}

interface MeasurementSessionOptions {
  windowSize?: number;
  stableDifference?: number;
  minValidWeight?: number;
  maxValidWeight?: number;
  sessionResetAfterMs?: number;
  duplicateDifference?: number;
  duplicateAfterMs?: number;
}

export class MeasurementSession {
  private readonly recentWeights: number[] = [];
  private readonly windowSize: number;
  private readonly stableDifference: number;
  private readonly minValidWeight: number;
  private readonly maxValidWeight: number;
  private readonly sessionResetAfterMs: number;
  private readonly duplicateDifference: number;
  private readonly duplicateAfterMs: number;
  private state: "idle" | "stabilizing" | "saved" = "idle";
  private lastAdvertisementTime: number | null = null;
  private lastSavedWeight: number | null = null;
  private lastSavedTime = 0;

  constructor(options: MeasurementSessionOptions = {}) {
    this.windowSize = options.windowSize ?? 10;
    this.stableDifference = options.stableDifference ?? 0.1;
    this.minValidWeight = options.minValidWeight ?? 20;
    this.maxValidWeight = options.maxValidWeight ?? 250;
    this.sessionResetAfterMs = options.sessionResetAfterMs ?? 3_000;
    this.duplicateDifference = options.duplicateDifference ?? 0.2;
    this.duplicateAfterMs = options.duplicateAfterMs ?? 30_000;
  }

  observe(weight: number, now: number): MeasurementObservation {
    if (
      this.state !== "idle" &&
      this.lastAdvertisementTime !== null &&
      now - this.lastAdvertisementTime > this.sessionResetAfterMs
    ) {
      this.resetSession();
    }

    if (weight < this.minValidWeight) {
      this.resetSession();
      return { accepted: false, stableWeight: null };
    }

    this.lastAdvertisementTime = now;
    if (weight > this.maxValidWeight || this.state === "saved") {
      return { accepted: false, stableWeight: null };
    }

    this.state = "stabilizing";
    this.recentWeights.push(weight);
    if (this.recentWeights.length > this.windowSize) {
      this.recentWeights.shift();
    }

    if (this.recentWeights.length < this.windowSize) {
      return { accepted: true, stableWeight: null };
    }

    const min = Math.min(...this.recentWeights);
    const max = Math.max(...this.recentWeights);
    if (max - min > this.stableDifference) {
      return { accepted: true, stableWeight: null };
    }

    const average =
      this.recentWeights.reduce((sum, value) => sum + value, 0) /
      this.recentWeights.length;
    const stableWeight = Number(average.toFixed(2));
    const shouldSave =
      this.lastSavedWeight === null ||
      Math.abs(stableWeight - this.lastSavedWeight) >=
        this.duplicateDifference ||
      now - this.lastSavedTime > this.duplicateAfterMs;

    return {
      accepted: true,
      stableWeight: shouldSave ? stableWeight : null,
    };
  }

  markSaved(weight: number, now: number): void {
    this.lastSavedWeight = weight;
    this.lastSavedTime = now;
    this.state = "saved";
  }

  private resetSession(): void {
    this.recentWeights.length = 0;
    this.state = "idle";
    this.lastAdvertisementTime = null;
  }
}
