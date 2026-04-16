import { getFareContext, type PricePosition, type FareContextResult } from "./sources/fareContext";
import { getTimePressure, type TimePressureLevel } from "./sources/timePressure";
import { getDestinationDemand, type DemandLevel } from "./sources/destinationDemand";

export type { PricePosition, TimePressureLevel, DemandLevel, FareContextResult };

export type Verdict    = "BOOK_NOW" | "WAIT" | "MONITOR";
export type Confidence = "High" | "Medium" | "Low";

export interface PipelineInput {
  country: string;
  city: string;
  checkIn: string;
  price: number;
  daysUntilCheckIn: number;
  flexibility: string;
  urgency: string;
}

export interface FactorStates {
  pricePosition: PricePosition;
  timePressure: TimePressureLevel;
  demand: DemandLevel;
  fareContext: FareContextResult;
}

export interface PipelineResult {
  verdict: Verdict;
  confidence: Confidence;
  headline: string;
  factors: FactorStates;
  sourceBasis: string;
}

// ---------------------------------------------------------------------------
// Step 1: Verdict + confidence from enriched factor states
// ---------------------------------------------------------------------------
function verdictFromFactors(
  factors: FactorStates,
  urgency: string
): { verdict: Verdict; confidence: Confidence } {
  const { pricePosition, timePressure, demand } = factors;

  // High time pressure: check-in is close — lean toward booking regardless of price
  if (timePressure === "high") {
    const confidence: Confidence =
      pricePosition === "good" ? "High" : pricePosition === "expensive" ? "Low" : "Medium";
    return { verdict: "BOOK_NOW", confidence };
  }

  // Good price + high demand: strongest buy signal
  if (pricePosition === "good" && demand === "high") {
    return { verdict: "BOOK_NOW", confidence: "High" };
  }

  // Good price alone: lean book
  if (pricePosition === "good") {
    const confidence: Confidence = urgency === "High" ? "High" : "Medium";
    return { verdict: "BOOK_NOW", confidence };
  }

  // User urgency override (when price isn't actively bad)
  if (urgency === "High" && pricePosition !== "expensive") {
    return { verdict: "BOOK_NOW", confidence: "Medium" };
  }

  // Expensive price with room to wait → wait
  if (pricePosition === "expensive" && timePressure === "low") {
    return { verdict: "WAIT", confidence: "High" };
  }
  if (pricePosition === "expensive" && timePressure === "medium") {
    return { verdict: "WAIT", confidence: "Medium" };
  }

  // Low time pressure + no strong buy reason → wait
  if (timePressure === "low") {
    return { verdict: "WAIT", confidence: "Medium" };
  }

  // Mixed medium signals → monitor
  return { verdict: "MONITOR", confidence: "Low" };
}

// ---------------------------------------------------------------------------
// Step 2: Map verdict + factors to a human headline
// ---------------------------------------------------------------------------
function headlineFromResult(
  verdict: Verdict,
  confidence: Confidence,
  factors: FactorStates,
  flexibility: string,
  daysUntilCheckIn: number
): string {
  const { pricePosition, timePressure, demand } = factors;

  if (verdict === "BOOK_NOW") {
    if (timePressure === "high" && daysUntilCheckIn <= 30) return "Book now — getting close";
    if (pricePosition === "good")                           return "Book now — good price";
    if (demand === "high")                                  return "Book now — busy period";
    if (confidence === "High")                              return "Book now — safer to lock in";
    return "Book now — for peace of mind";
  }

  if (verdict === "WAIT") {
    if (pricePosition === "expensive")                      return "Wait — price feels high";
    if (flexibility === "Flexible")                         return "Wait — you have flexibility";
    if (timePressure === "low" && daysUntilCheckIn > 60)    return "Wait — you're early";
    return "Wait — low risk for now";
  }

  // MONITOR → soft wait framing
  if (pricePosition === "expensive")  return "Wait — price feels high";
  if (flexibility === "Flexible")     return "Wait — you have flexibility";
  return "Wait — no strong signal yet";
}

// ---------------------------------------------------------------------------
// Step 3: Build a grounded source basis line (never mentions AI or scores)
// ---------------------------------------------------------------------------
function buildSourceBasis(factors: FactorStates): string {
  const { pricePosition, timePressure, demand } = factors;
  if (timePressure === "high") {
    return "Based on current price level and how close your check-in is";
  }
  if (pricePosition !== "normal" && demand === "high") {
    return "Based on current price level, timing, and expected availability";
  }
  if (pricePosition !== "normal") {
    return "Based on price range and time to your travel dates";
  }
  if (demand === "high") {
    return "Based on booking timing and expected availability";
  }
  return "Based on typical price range and booking timing";
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------
export function runDecisionPipeline(input: PipelineInput): PipelineResult {
  // Source enrichment
  const fareContext  = getFareContext(input.price, input.country);
  const timePressure = getTimePressure(input.daysUntilCheckIn);
  const demand       = getDestinationDemand(input.country, input.city, input.checkIn);

  const factors: FactorStates = {
    pricePosition: fareContext.pricePosition,
    timePressure,
    demand,
    fareContext,
  };

  const { verdict, confidence } = verdictFromFactors(factors, input.urgency);
  const headline    = headlineFromResult(verdict, confidence, factors, input.flexibility, input.daysUntilCheckIn);
  const sourceBasis = buildSourceBasis(factors);

  return { verdict, confidence, headline, factors, sourceBasis };
}
