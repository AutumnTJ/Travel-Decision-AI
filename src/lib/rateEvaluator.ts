// Rate option evaluator — Phase 2 rate comparison
// Compares 1–3 rate options for the same hotel stay and picks the best overall value.
// All logic is deterministic; no AI call needed.

export interface RateOptionInput {
  label:             string;
  pricePerNight:     number;
  refundable:        boolean;
  breakfastIncluded: boolean;
}

// Internal classification — not exposed in UI directly
export type RateTag =
  | "strong_value"    // good benefits at a reasonable premium (or cheapest with perks)
  | "budget_tradeoff" // cheapest but limited flexibility/benefits
  | "safer_choice"    // not cheapest, but meaningfully better protection
  | "weak_upgrade";   // costs more without enough benefit to justify it

export interface EvaluatedRate {
  index: number;
  rate:  RateOptionInput;
  tag:   RateTag;
  score: number; // internal only — not shown
}

export interface RateRecommendation {
  bestIndex:        number;
  bestLabel:        string;   // "Best overall value", "Best balance", etc.
  evaluations:      EvaluatedRate[];
  headline:         string;   // e.g. "Free cancellation — $175/night"
  reasons:          string[]; // 1–2 bullets explaining the pick
  alternativeNote?: string;   // soft note about the runner-up
}

// ---------------------------------------------------------------------------
// Scoring — higher = better value
// Flexibility and meals add points; price premium subtracts points.
// ---------------------------------------------------------------------------

function scoreRate(rate: RateOptionInput, minPrice: number): number {
  const premiumRatio = minPrice > 0 ? (rate.pricePerNight - minPrice) / minPrice : 0;
  let score = 0;
  if (rate.refundable)        score += 20;
  if (rate.breakfastIncluded) score += 5;
  score -= premiumRatio * 90;
  return score;
}

function tagRate(rate: RateOptionInput, minPrice: number): RateTag {
  const isLowest     = rate.pricePerNight <= minPrice;
  const hasPerks     = rate.refundable || rate.breakfastIncluded;
  const premiumRatio = minPrice > 0 ? (rate.pricePerNight - minPrice) / minPrice : 0;

  if (isLowest && hasPerks)                                          return "strong_value";
  if (isLowest && !hasPerks)                                         return "budget_tradeoff";
  if (!isLowest && rate.refundable && rate.breakfastIncluded
      && premiumRatio < 0.30)                                        return "strong_value";
  if (!isLowest && hasPerks && premiumRatio < 0.20)                  return "safer_choice";
  return "weak_upgrade";
}

export function getBestRateLabel(tag: RateTag): string {
  if (tag === "strong_value")    return "Best overall value";
  if (tag === "safer_choice")    return "Best balance";
  if (tag === "budget_tradeoff") return "Lowest cost option";
  return "Best available";
}

// ---------------------------------------------------------------------------
// Recommendation text generation
// ---------------------------------------------------------------------------

function buildText(
  evaluations: EvaluatedRate[],
  bestIndex:   number,
  minPrice:    number
): { reasons: string[]; alternativeNote?: string } {
  const best = evaluations[bestIndex];
  const reasons: string[] = [];

  if (best.tag === "strong_value") {
    if (best.rate.refundable && best.rate.breakfastIncluded) {
      reasons.push("Includes both flexibility and breakfast for a reasonable price");
      reasons.push("Better balance for this stay than the other options");
    } else if (best.rate.refundable) {
      if (best.rate.pricePerNight <= minPrice) {
        reasons.push("Flexibility to cancel at the lowest available price");
        reasons.push("No reason to give up that option here");
      } else {
        const premium = best.rate.pricePerNight - minPrice;
        reasons.push(`Small $${premium}/night increase for added flexibility`);
        reasons.push("Usually the better balance for most stays");
      }
    } else {
      reasons.push("Best value at the lowest available price");
      reasons.push("Includes a useful benefit without paying more");
    }
  } else if (best.tag === "safer_choice") {
    const premium = best.rate.pricePerNight - minPrice;
    reasons.push(`Small $${premium}/night increase for the option to cancel`);
    reasons.push("Worth considering if there is any chance your plans shift");
  } else if (best.tag === "budget_tradeoff") {
    reasons.push("Lowest rate available for this stay");
    reasons.push("Good fit if you're confident the plans won't change");
  }

  // Alternative note: compare best vs cheapest (if different)
  let alternativeNote: string | undefined;
  const cheapestEval = evaluations.reduce((a, b) =>
    a.rate.pricePerNight < b.rate.pricePerNight ? a : b
  );
  if (bestIndex !== cheapestEval.index) {
    const saving = best.rate.pricePerNight - cheapestEval.rate.pricePerNight;
    const cheapLabel = cheapestEval.rate.label || `Option ${cheapestEval.index + 1}`;
    if (saving > 30) {
      alternativeNote = `${cheapLabel} is notably cheaper — worth considering if flexibility isn't a priority`;
    } else if (!cheapestEval.rate.refundable && !cheapestEval.rate.breakfastIncluded) {
      alternativeNote = `${cheapLabel} saves $${saving}/night but gives up all flexibility`;
    } else if (!cheapestEval.rate.refundable) {
      alternativeNote = `${cheapLabel} saves $${saving}/night but doesn't allow cancellation`;
    } else {
      alternativeNote = `${cheapLabel} is $${saving}/night cheaper but includes fewer benefits`;
    }
  }

  return { reasons, alternativeNote };
}

// ---------------------------------------------------------------------------
// Public entry point
// Returns null when fewer than 2 valid rates are provided.
// ---------------------------------------------------------------------------

export function evaluateRateOptions(
  rates: RateOptionInput[]
): RateRecommendation | null {
  const valid = rates.filter(r => r.pricePerNight > 0);
  if (valid.length < 2) return null;

  const minPrice = Math.min(...valid.map(r => r.pricePerNight));

  const evaluations: EvaluatedRate[] = valid.map((rate, index) => ({
    index,
    rate,
    tag:   tagRate(rate, minPrice),
    score: scoreRate(rate, minPrice),
  }));

  // Pick highest score; break ties by preferring refundable, then breakfast
  const bestIndex = evaluations.reduce((best, curr, i) => {
    const b = evaluations[best];
    if (curr.score > b.score) return i;
    if (curr.score === b.score) {
      if (curr.rate.refundable && !b.rate.refundable) return i;
      if (curr.rate.breakfastIncluded && !b.rate.breakfastIncluded) return i;
    }
    return best;
  }, 0);

  const best      = evaluations[bestIndex];
  const bestLabel = getBestRateLabel(best.tag);
  const rateDisplay = best.rate.label || `Option ${bestIndex + 1}`;
  const headline  = `${rateDisplay} — $${best.rate.pricePerNight}/night`;

  const { reasons, alternativeNote } = buildText(evaluations, bestIndex, minPrice);

  return { bestIndex, bestLabel, evaluations, headline, reasons, alternativeNote };
}
