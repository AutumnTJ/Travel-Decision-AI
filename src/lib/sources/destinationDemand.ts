// Destination demand adapter
// V1: lightweight proxy using seasonality + high-demand city heuristics
// future: connect to destination occupancy data, tourism index APIs,
//         or real-time hotel availability rate signals

export type DemandLevel = "low" | "medium" | "high";

// Peak travel months per destination (1-based month index)
// future: replace with live occupancy or demand curve data per city
const PEAK_MONTHS: Record<string, number[]> = {
  Thailand:         [11, 12, 1, 2, 3],
  Japan:            [3, 4, 10, 11],
  France:           [6, 7, 8],
  "United States":  [6, 7, 8, 12],
  Italy:            [6, 7, 8],
  "United Kingdom": [6, 7, 8],
  Spain:            [6, 7, 8],
  Australia:        [12, 1, 2],
};

// Cities with consistently elevated booking demand within their country
// future: derive from hotel occupancy rates or search trend data
const HIGH_DEMAND_CITIES: Record<string, string[]> = {
  Thailand:         ["Phuket", "Bangkok"],
  Japan:            ["Tokyo", "Kyoto"],
  France:           ["Paris", "Nice"],
  "United States":  ["New York", "Las Vegas", "Miami"],
  Italy:            ["Venice", "Florence", "Rome"],
  "United Kingdom": ["London"],
  Spain:            ["Barcelona"],
  Australia:        ["Sydney"],
};

export function getDestinationDemand(
  country: string,
  city: string,
  checkIn: string
): DemandLevel {
  if (!checkIn) return "medium";
  const month = new Date(checkIn).getMonth() + 1;
  const isPeak = (PEAK_MONTHS[country] ?? []).includes(month);
  const isHighDemandCity = (HIGH_DEMAND_CITIES[country] ?? []).includes(city);

  if (isPeak && isHighDemandCity) return "high";
  if (isPeak || isHighDemandCity) return "medium";
  return "low";
}
