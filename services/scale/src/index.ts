import noble from "@abandonware/noble";
import { createDatabasePool } from "@raspi5-control-center/database";
import dotenv from "dotenv";
import { resolve } from "node:path";

dotenv.config({
  path: resolve(__dirname, "../../../.env"),
  quiet: true,
});

const SCALE_MAC = "78:66:a5:21:29:04";

const recentWeights: number[] = [];
const WINDOW_SIZE = 10;
const STABLE_DIFFERENCE = 0.1;
const MIN_VALID_WEIGHT = 20;
const MAX_VALID_WEIGHT = 250;
const SESSION_RESET_AFTER_MS = 3_000;

let lastSavedWeight: number | null = null;
let lastSavedTime = 0;
let isSaving = false;
let measurementState: "idle" | "stabilizing" | "saved" = "idle";
let lastAdvertisementTime = 0;

const pool = createDatabasePool();

async function saveWeight(weight: number) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [895_431]);
    const result = await client.query(
      `
        INSERT INTO weight_measurements (weight_kg)
        SELECT $1
        WHERE NOT EXISTS (
          SELECT 1
          FROM weight_measurements
          WHERE weight_kg = $1
            AND measured_at > NOW() - INTERVAL '5 seconds'
        )
        RETURNING id
      `,
      [weight],
    );
    await client.query("COMMIT");

    if (result.rowCount === 0) {
      console.log(`Yakın duplicate atlandı: ${weight.toFixed(2)} kg`);
      return false;
    }

    console.log(`DB'ye kaydedildi: ${weight.toFixed(2)} kg`);
    return true;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

noble.on("stateChange", async (state) => {
  console.log("Bluetooth state:", state);

  if (state === "poweredOn") {
    await noble.startScanningAsync([], true);
    console.log("Tartı bekleniyor...");
  } else {
    await noble.stopScanningAsync();
  }
});

noble.on("discover", async (peripheral) => {
  const address = peripheral.address?.toLowerCase();

  if (address !== SCALE_MAC) return;

  const data = peripheral.advertisement.manufacturerData;

  if (!data || data.length < 4) return;

  const weightRaw = data.readUInt16BE(2);
  const weight = weightRaw / 100;
  const now = Date.now();

  if (
    measurementState !== "idle" &&
    now - lastAdvertisementTime > SESSION_RESET_AFTER_MS
  ) {
    recentWeights.length = 0;
    measurementState = "idle";
  }

  if (weight < MIN_VALID_WEIGHT) {
    return;
  }

  lastAdvertisementTime = now;
  if (weight > MAX_VALID_WEIGHT || measurementState === "saved") return;

  measurementState = "stabilizing";

  recentWeights.push(weight);

  if (recentWeights.length > WINDOW_SIZE) {
    recentWeights.shift();
  }

  process.stdout.write(`\rCanlı: ${weight.toFixed(2)} kg`);

  if (recentWeights.length < WINDOW_SIZE) return;

  const min = Math.min(...recentWeights);
  const max = Math.max(...recentWeights);
  const difference = max - min;

  if (difference <= STABLE_DIFFERENCE) {
    const average =
      recentWeights.reduce((sum, value) => sum + value, 0) /
      recentWeights.length;

    const stableWeight = Number(average.toFixed(2));
    const shouldSave =
      lastSavedWeight === null ||
      Math.abs(stableWeight - lastSavedWeight) >= 0.2 ||
      now - lastSavedTime > 30_000;

    if (shouldSave) {
      if (isSaving) return;
      isSaving = true;

      console.log(
        `\nÖLÇÜM TAMAMLANDI: ${stableWeight.toFixed(2)} kg`,
      );

      try {
        await saveWeight(stableWeight);

        lastSavedWeight = stableWeight;
        lastSavedTime = now;
        measurementState = "saved";
      } catch (error) {
        console.error("\nDB kayıt hatası:", error);
      } finally {
        isSaving = false;
      }
    }
  }
});
