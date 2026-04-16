// Time pressure adapter
// V1: maps days-to-check-in into a simple three-level pressure signal
// future: incorporate route-specific booking window curves,
//         seasonal demand multipliers, or live hotel availability signals

export type TimePressureLevel = "low" | "medium" | "high";

export function getTimePressure(daysUntilCheckIn: number): TimePressureLevel {
  if (daysUntilCheckIn < 30) return "high";
  if (daysUntilCheckIn <= 90) return "medium";
  return "low";
}
