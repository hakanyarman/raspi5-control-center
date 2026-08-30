import noble from "@abandonware/noble";
import { createDatabasePool } from "@raspi5-control-center/database";
import dotenv from "dotenv";
import { resolve } from "node:path";
import { decodeWeightKg } from "./decoder";
import { MeasurementSession } from "./measurement-session";

dotenv.config({
  path: resolve(__dirname, "../../../.env"),
  quiet: true,
});

const SCALE_MAC = "78:66:a5:21:29:04";

let isSaving = false;
const measurementSession = new MeasurementSession();

const pool = createDatabasePool();

async function saveWeight(weight: number) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [895_431]);
    const result = await client.query<{ id: string }>(
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
    if (result.rowCount === 0) {
      await client.query("COMMIT");
      console.log(`Yakın duplicate atlandı: ${weight.toFixed(2)} kg`);
      return false;
    }

    await client.query("SELECT pg_notify($1, $2)", [
      "weight_measurement_saved",
      result.rows[0]!.id,
    ]);
    await client.query("COMMIT");

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

  if (!data) return;
  const weight = decodeWeightKg(data);
  if (weight === null) return;
  const now = Date.now();
  const observation = measurementSession.observe(weight, now);
  if (!observation.accepted) return;
  process.stdout.write(`\rCanlı: ${weight.toFixed(2)} kg`);
  if (observation.stableWeight === null || isSaving) return;

  const stableWeight = observation.stableWeight;
  isSaving = true;
  console.log(`\nÖLÇÜM TAMAMLANDI: ${stableWeight.toFixed(2)} kg`);

  try {
    await saveWeight(stableWeight);
    measurementSession.markSaved(stableWeight, now);
  } catch (error) {
    console.error("\nDB kayıt hatası:", error);
  } finally {
    isSaving = false;
  }
});
