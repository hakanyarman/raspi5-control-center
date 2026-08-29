import noble from "@abandonware/noble";
import { Pool } from "pg";

const SCALE_MAC = "78:66:a5:21:29:04";

const recentWeights: number[] = [];
const WINDOW_SIZE = 10;
const STABLE_DIFFERENCE = 0.1;

let lastSavedWeight: number | null = null;
let lastSavedTime = 0;

const pool = new Pool({
  host: "127.0.0.1",
  port: 5432,
  user: "raspi",
  password: "raspi_password",
  database: "control_center",
});

async function saveWeight(weight: number) {
  await pool.query(
    `
      INSERT INTO weight_measurements (weight_kg)
      VALUES ($1)
    `,
    [weight],
  );

  console.log(`DB'ye kaydedildi: ${weight.toFixed(2)} kg`);
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

  if (weight < 20 || weight > 250) return;

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
    const now = Date.now();

    const shouldSave =
      lastSavedWeight === null ||
      Math.abs(stableWeight - lastSavedWeight) >= 0.2 ||
      now - lastSavedTime > 30_000;

    if (shouldSave) {
      console.log(
        `\nÖLÇÜM TAMAMLANDI: ${stableWeight.toFixed(2)} kg`,
      );

      try {
        await saveWeight(stableWeight);

        lastSavedWeight = stableWeight;
        lastSavedTime = now;
      } catch (error) {
        console.error("\nDB kayıt hatası:", error);
      }
    }
  }
});
