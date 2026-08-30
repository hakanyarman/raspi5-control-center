export function decodeWeightKg(manufacturerData: Buffer): number | null {
  if (manufacturerData.length < 4) return null;
  return manufacturerData.readUInt16BE(2) / 100;
}
