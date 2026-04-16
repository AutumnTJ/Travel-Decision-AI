// Fare context adapter
// V1: heuristic nightly rate ranges per country (USD), mid-range segment
// future: replace getFareContext() with a live hotel pricing API call
//         e.g. Booking.com API, Hotels.com Content API, or Google Hotel Search

export type PricePosition = "good" | "normal" | "expensive";

export interface FareContextResult {
  lowTypical: number;
  highTypical: number;
  pricePosition: PricePosition;
  sourceLabel: string;
}

// Approximate typical nightly rate range per country (USD)
// future: pull from live pricing data per destination + season + room tier
const TYPICAL_RANGES: Record<string, { low: number; high: number }> = {
  Thailand:         { low: 55,  high: 110 },
  Japan:            { low: 110, high: 195 },
  France:           { low: 135, high: 240 },
  "United States":  { low: 120, high: 210 },
  Italy:            { low: 120, high: 215 },
  "United Kingdom": { low: 140, high: 240 },
  Spain:            { low: 105, high: 185 },
  Australia:        { low: 115, high: 200 },
};

const DEFAULT_RANGE = { low: 100, high: 200 };

export function getFareContext(
  price: number,
  country: string
): FareContextResult {
  const range = TYPICAL_RANGES[country] ?? DEFAULT_RANGE;

  let pricePosition: PricePosition;
  if (price < range.low) {
    pricePosition = "good";
  } else if (price > range.high) {
    pricePosition = "expensive";
  } else {
    pricePosition = "normal";
  }

  return {
    lowTypical: range.low,
    highTypical: range.high,
    pricePosition,
    sourceLabel: "fare context",
  };
}
