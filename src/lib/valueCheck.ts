// Value check module — Phase 2
// Evaluates whether a hotel price is genuinely cheap after basic reality checks.
// Inputs: pricePerNight, nights, taxesIncluded, breakfastIncluded, refundable, locationLevel
// Output: verdict + 3 internal factor levels used by the UI

export type TotalCostLevel  = "low" | "normal" | "high";
export type ValueLevel      = "weak" | "fair" | "strong";
export type FrictionLevel   = "low" | "medium" | "high";
export type CheapnessVerdict = "ACTUALLY_CHEAP" | "CHECK_DETAILS" | "NOT_CHEAP";
export type LocationLevel   = "central" | "okay" | "far";

export interface ValueCheckInput {
  pricePerNight:     number;
  nights:            number;
  taxesIncluded:     boolean;
  breakfastIncluded: boolean;
  refundable:        boolean;
  locationLevel:     LocationLevel;
}

export interface ValueCheckResult {
  verdict:        CheapnessVerdict;
  estimatedTotal: number;
  totalCostLevel: TotalCostLevel;
  valueLevel:     ValueLevel;
  frictionLevel:  FrictionLevel;
}

// ---------------------------------------------------------------------------
// Step 1: Total cost
// ---------------------------------------------------------------------------

export function calculateTotalCost(
  pricePerNight: number,
  nights: number,
  taxesIncluded: boolean
): number {
  const base = pricePerNight * nights;
  return taxesIncluded ? base : Math.round(base * 1.15);
}

export function getTotalCostLevel(totalCost: number): TotalCostLevel {
  if (totalCost < 800)  return "low";
  if (totalCost <= 1500) return "normal";
  return "high";
}

// ---------------------------------------------------------------------------
// Step 2: Value level
// Start weak; each included benefit upgrades one level (max: strong)
// ---------------------------------------------------------------------------

export function getValueLevel(
  breakfastIncluded: boolean,
  refundable: boolean
): ValueLevel {
  const score = (breakfastIncluded ? 1 : 0) + (refundable ? 1 : 0);
  if (score === 0) return "weak";
  if (score === 1) return "fair";
  return "strong";
}

// ---------------------------------------------------------------------------
// Step 3: Friction level
// Start low; each friction factor increases one level (max: high)
// ---------------------------------------------------------------------------

export function getFrictionLevel(
  locationLevel: LocationLevel,
  refundable: boolean
): FrictionLevel {
  const score = (locationLevel === "far" ? 1 : 0) + (!refundable ? 1 : 0);
  if (score === 0) return "low";
  if (score === 1) return "medium";
  return "high";
}

// ---------------------------------------------------------------------------
// Step 4: Verdict
// ---------------------------------------------------------------------------

export function getCheapnessVerdict(
  totalCostLevel: TotalCostLevel,
  valueLevel:     ValueLevel,
  frictionLevel:  FrictionLevel
): CheapnessVerdict {
  // NOT_CHEAP: high total cost, or high friction with nothing to show for it
  if (totalCostLevel === "high") return "NOT_CHEAP";
  if (frictionLevel === "high" && valueLevel === "weak") return "NOT_CHEAP";

  // ACTUALLY_CHEAP: all three factors align
  if (
    (totalCostLevel === "low" || totalCostLevel === "normal") &&
    (valueLevel === "fair" || valueLevel === "strong") &&
    frictionLevel === "low"
  ) return "ACTUALLY_CHEAP";

  // Everything else: worth a closer look
  return "CHECK_DETAILS";
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function runValueCheck(input: ValueCheckInput): ValueCheckResult {
  const estimatedTotal = calculateTotalCost(
    input.pricePerNight,
    input.nights,
    input.taxesIncluded
  );
  const totalCostLevel = getTotalCostLevel(estimatedTotal);
  const valueLevel     = getValueLevel(input.breakfastIncluded, input.refundable);
  const frictionLevel  = getFrictionLevel(input.locationLevel, input.refundable);
  const verdict        = getCheapnessVerdict(totalCostLevel, valueLevel, frictionLevel);

  return { verdict, estimatedTotal, totalCostLevel, valueLevel, frictionLevel };
}
