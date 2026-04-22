import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "../convex/_generated/api";
import { Toaster, toast } from "sonner";
import { track } from "./lib/track";
import {
  runDecisionPipeline,
  type Verdict,
  type Confidence,
  type FactorStates,
  type PricePosition,
  type TimePressureLevel,
  type DemandLevel,
} from "./lib/decisionPipeline";
import {
  evaluateRateOptions,
  type RateOptionInput,
  type RateRecommendation,
} from "./lib/rateEvaluator";

// ===========================================================================
// Types
// ===========================================================================

type AppMode    = "home" | "link-confirm";
type Flexibility = "Fixed dates" | "Flexible";
type Urgency     = "Low" | "Medium" | "High";

interface RateOption {
  id:               string;
  label:            string;
  pricePerNight:    string; // string to handle live input
  refundable:       boolean;
  breakfastIncluded: boolean;
}

interface FormData {
  hotelName:   string;
  country:     string;
  city:        string;
  checkIn:     string;
  checkOut:    string;
  price:       string; // manual mode only
  flexibility: Flexibility | "";
  urgency:     Urgency | "";
}

const EMPTY_RATE = (): RateOption => ({
  id:               String(Date.now() + Math.random()),
  label:            "",
  pricePerNight:    "",
  refundable:       true,
  breakfastIncluded: false,
});

const CITY_MAP: Record<string, string[]> = {
  Thailand:         ["Bangkok", "Chiang Mai", "Phuket", "Pattaya", "Krabi"],
  Japan:            ["Tokyo", "Osaka", "Kyoto", "Sapporo", "Fukuoka"],
  France:           ["Paris", "Nice", "Lyon", "Marseille", "Bordeaux"],
  "United States":  ["New York", "Los Angeles", "Miami", "Chicago", "Las Vegas"],
  Italy:            ["Rome", "Florence", "Venice", "Milan", "Amalfi"],
  "United Kingdom": ["London", "Edinburgh", "Manchester", "Bath", "Oxford"],
  Spain:            ["Barcelona", "Madrid", "Seville", "Valencia", "Granada"],
  Australia:        ["Sydney", "Melbourne", "Brisbane", "Perth", "Cairns"],
};

// ===========================================================================
// Copy generators — pure functions
// ===========================================================================

const CHIP_TEXT: {
  price:  Record<PricePosition,     string>;
  time:   Record<TimePressureLevel, string>;
  demand: Record<DemandLevel,       string>;
} = {
  price: {
    good:      "Price looks lower than usual for these dates",
    normal:    "Price looks reasonable for these dates",
    expensive: "Price looks high for these dates",
  },
  time: {
    low:    "You still have plenty of time before check-in",
    medium: "Booking timing is becoming more relevant",
    high:   "Check-in is close enough that waiting adds risk",
  },
  demand: {
    low:    "Availability looks relatively stable for this destination",
    medium: "Prices may change as availability fills closer to your dates",
    high:   "This market tends to get tighter as check-in approaches",
  },
};

const CHIP_COLOR: {
  price:  Record<PricePosition,     string>;
  time:   Record<TimePressureLevel, string>;
  demand: Record<DemandLevel,       string>;
} = {
  price: {
    good:      "bg-slate-50 text-slate-700 border-slate-200",
    normal:    "bg-gray-50 text-gray-500 border-gray-200",
    expensive: "bg-amber-50 text-amber-700 border-amber-200",
  },
  time: {
    low:    "bg-gray-50 text-gray-500 border-gray-200",
    medium: "bg-gray-50 text-gray-600 border-gray-200",
    high:   "bg-amber-50 text-amber-700 border-amber-200",
  },
  demand: {
    low:    "bg-gray-50 text-gray-500 border-gray-200",
    medium: "bg-gray-50 text-gray-500 border-gray-200",
    high:   "bg-blue-50 text-blue-700 border-blue-200",
  },
};

function getWhyBullets(verdict: Verdict, factors: FactorStates): string[] {
  const { pricePosition, timePressure, demand } = factors;
  if (verdict === "BOOK_NOW") {
    if (pricePosition === "good" && timePressure === "high") return [
      "This price is already on the lower side for your dates",
      "Check-in is close, and options at this price may not last",
      "Booking now removes any last-minute uncertainty",
    ];
    if (pricePosition === "good") return [
      "This price is already on the lower side for your dates",
      "Waiting may not create much additional upside",
      "Availability may tighten as check-in approaches",
    ];
    if (timePressure === "high") return [
      "Check-in is close and prices rarely improve at this stage",
      "Options at this price may not stay available",
      "Booking now reduces last-minute uncertainty",
    ];
    if (demand === "high") return [
      "This is a busy period for this destination",
      "Good options tend to go earlier in high-demand periods",
      "This rate is fair for the conditions",
    ];
    return [
      "This rate is reasonable for these dates",
      "Waiting may not offer much price upside from here",
      "Conditions lean toward booking now",
    ];
  }
  if (verdict === "WAIT") {
    if (pricePosition === "expensive" && timePressure === "low") return [
      "This price is higher than what is typically seen",
      "You still have enough time before your trip",
      "Waiting may give you a better opportunity",
    ];
    if (pricePosition === "expensive") return [
      "This price is on the higher side for these dates",
      "There is still some time before check-in",
      "A better rate may still appear",
    ];
    return [
      "The fare is in a typical range",
      "There is no strong signal to book today",
      "Giving it a little more time is reasonable",
    ];
  }
  return [
    "The current price is reasonable but not especially low",
    "Timing is a factor, but not urgently yet",
    "Checking again soon may help clarify the decision",
  ];
}

function getFinalAction(verdict: Verdict, factors: FactorStates, confidence: Confidence): string {
  const { pricePosition, timePressure } = factors;
  if (verdict === "BOOK_NOW") {
    if (confidence === "High") return "This looks like a good time to lock it in.";
    if (pricePosition === "good") return "This is a reasonable time to book.";
    return "You can book now.";
  }
  if (verdict === "WAIT") {
    if (pricePosition === "expensive") return "Wait for now — this price may soften.";
    if (timePressure === "low")        return "You can give this a little more time.";
    return "Waiting is reasonable at this stage.";
  }
  return "Check again soon before deciding.";
}

function timingLabel(daysUntilCheckIn: number): string {
  if (daysUntilCheckIn <= 14) return "very close to the date";
  if (daysUntilCheckIn <= 30) return "about a month away";
  if (daysUntilCheckIn <= 60) return "around 6–8 weeks away";
  if (daysUntilCheckIn <= 90) return "a few months away";
  return "well in advance";
}

// ===========================================================================
// Optional 4th chip — value/friction insight from Phase 1 context
// ===========================================================================

interface ValueChip { text: string; color: string }

function getOptionalValueChip(
  verdict:     Verdict,
  factors:     FactorStates,
  flexibility: string,
  totalCost:   number
): ValueChip | null {
  const { pricePosition, timePressure, demand } = factors;

  if (pricePosition === "expensive" && demand === "high")
    return { text: "Added costs may weaken the value in a high-demand period", color: "bg-amber-50 text-amber-700 border-amber-200" };
  if (pricePosition === "expensive" && flexibility === "Fixed dates")
    return { text: "Limited flexibility may reduce the overall value here",      color: "bg-amber-50 text-amber-700 border-amber-200" };
  if (totalCost > 1500 && pricePosition !== "good")
    return { text: "Total cost may be higher than it first appears",              color: "bg-amber-50 text-amber-700 border-amber-200" };
  if (flexibility === "Fixed dates" && timePressure === "high")
    return { text: "Fixed dates at this stage leave little room to adjust",       color: "bg-amber-50 text-amber-700 border-amber-200" };
  if (pricePosition === "good" && demand === "high")
    return { text: "This still looks strong after basic checks",                  color: "bg-slate-50 text-slate-700 border-slate-200" };
  if (flexibility === "Flexible" && verdict === "WAIT")
    return { text: "Flexible booking adds useful peace of mind",                  color: "bg-slate-50 text-slate-600 border-slate-200" };

  return null;
}

function getOptionalValueDetail(
  factors:     FactorStates,
  flexibility: string,
  totalCost:   number
): string | null {
  const { pricePosition, demand } = factors;
  if (pricePosition === "expensive" && demand === "high")
    return "High demand may reduce the chance of finding a lower rate nearby.";
  if (pricePosition === "expensive" && flexibility === "Fixed dates")
    return "Fixed dates reduce your ability to hold out for a lower price.";
  if (totalCost > 1500 && pricePosition !== "good")
    return "Multiplied over this stay, the total cost may be higher than the nightly rate suggests.";
  if (pricePosition === "good" && demand === "high")
    return "Good rates during peak periods tend to go earlier than expected.";
  if (flexibility === "Flexible")
    return "Flexible dates give you more options if prices shift before your trip.";
  return null;
}

function getEnrichedSourceBasis(original: string, hasValueChip: boolean, factors: FactorStates): string {
  if (!hasValueChip) return original;
  const { pricePosition, timePressure } = factors;
  if (timePressure === "high")       return "Based on current price, timing, and booking constraints";
  if (pricePosition === "expensive") return "Based on current price, booking timing, and value tradeoffs";
  return "Based on price range, timing, and overall value";
}

// ===========================================================================
// 4-state decision mapping — pure, deterministic
// ===========================================================================

type PriceSignal = "rising" | "stable" | "dropping";
type RoomsSignal = "decreasing" | "available";

interface FourStateResult {
  verdict:     "BOOK_NOW" | "WAIT";
  priceSignal: PriceSignal;
  roomsSignal: RoomsSignal;
}

function get4StateDecision(
  pricePosition: PricePosition,
  demand:        DemandLevel,
  timePressure:  TimePressureLevel
): FourStateResult {
  const priceSignal: PriceSignal =
    pricePosition === "expensive" ? "rising"   :
    pricePosition === "good"      ? "dropping" : "stable";

  const rawRoomsSignal: RoomsSignal =
    (demand === "high" || timePressure === "high") ? "decreasing" : "available";

  // Conflict rule: price signal is primary driver for verdict
  let verdict: "BOOK_NOW" | "WAIT";
  if      (priceSignal === "rising")   verdict = "BOOK_NOW";
  else if (priceSignal === "dropping") verdict = "WAIT";
  else                                 verdict = rawRoomsSignal === "decreasing" ? "BOOK_NOW" : "WAIT";

  // Strict consistency: rooms signal must align with verdict direction
  // BOOK_NOW never shows "rooms available"; WAIT never shows "rooms decreasing"
  const roomsSignal: RoomsSignal =
    verdict === "BOOK_NOW" ? "decreasing" : "available";

  return { verdict, priceSignal, roomsSignal };
}

// ===========================================================================
// Utility helpers — lightweight URL parsing (no fetch, no scraping)
// ===========================================================================

interface HotelLinkContext {
  sourceLabel:       string | null;
  detectedHotelName: string | null;
  // "detected" = name found; "partial" = source only; "none" = nothing readable
  extractionStatus:  "detected" | "partial" | "none";
}

function detectBookingSourceFromUrl(url: string): string | null {
  if (/booking\.com/i.test(url))     return "Booking.com";
  if (/agoda\.com/i.test(url))       return "Agoda";
  if (/expedia\.com/i.test(url))     return "Expedia";
  if (/hotels\.com/i.test(url))      return "Hotels.com";
  if (/airbnb\.com/i.test(url))      return "Airbnb";
  if (/tripadvisor\.com/i.test(url)) return "TripAdvisor";
  if (/kayak\.com/i.test(url))       return "Kayak";
  if (/trivago\.com/i.test(url))     return "Trivago";
  return null;
}

/** Convert a URL slug like "anantara-riverside-bangkok-resort" → "Anantara Riverside Bangkok Resort" */
function slugToTitle(slug: string): string {
  return slug
    .replace(/[_+]/g, "-")
    .split("-")
    .filter((w) => w.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function extractHotelNameFromUrlSlug(url: string): string | null {
  // Booking.com — /hotel/{cc}/{slug}.html
  // e.g. booking.com/hotel/th/anantara-riverside-bangkok-resort.html
  const bookingM = url.match(/booking\.com\/hotel\/[a-z]{2}\/([^./?#]+)(?:\.html)?/i);
  if (bookingM) return slugToTitle(bookingM[1]);

  // Agoda — /{slug}/hotel/ (with optional locale prefix like /en-gb/)
  // e.g. agoda.com/anantara-riverside-bangkok-resort/hotel/bangkok-th.html
  const agodaM = url.match(/agoda\.com\/(?:[a-z]{2}-[a-z]{2}\/)?([^/]+)\/hotel\//i);
  if (agodaM) return slugToTitle(agodaM[1]);

  // Hotels.com — /ho{id}/{slug}/
  // e.g. hotels.com/ho123456/anantara-riverside-bangkok-resort-bangkok-thailand/
  const hotelsM = url.match(/hotels\.com\/ho\d+\/([^/?#]+)/i);
  if (hotelsM) {
    // Strip trailing city/country tokens (typically the last 1–2 hyphen-words)
    const clean = hotelsM[1].replace(/-[a-z]{2,20}-[a-z]{2,20}\/?$/, "");
    return slugToTitle(clean);
  }

  // TripAdvisor — Hotel_Review-...-Reviews-{Name_Tokens}-{City}.html
  // e.g. tripadvisor.com/Hotel_Review-g293916-d501655-Reviews-Anantara_Riverside_Bangkok_Resort-Bangkok.html
  const taM = url.match(/Hotel_Review-[^-]+-[^-]+-Reviews-([A-Za-z0-9_]+(?:-[A-Za-z0-9_]+)*)-[A-Z][a-zA-Z]+\.html/);
  if (taM) return taM[1].replace(/_/g, " ");

  // Expedia — Hotels-{Hotel-Name}.h{id}.Hotel-Information
  // e.g. expedia.com/Bangkok-Hotels-Anantara-Riverside.h12345.Hotel-Information
  const expediaM = url.match(/expedia\.com\/[^/]+-Hotels?-([A-Za-z0-9-]+)\.h\d+\./i);
  if (expediaM) return slugToTitle(expediaM[1]);

  return null;
}

function getHotelLinkContext(url: string): HotelLinkContext {
  const sourceLabel       = detectBookingSourceFromUrl(url);
  const detectedHotelName = extractHotelNameFromUrlSlug(url);
  const extractionStatus: HotelLinkContext["extractionStatus"] =
    detectedHotelName ? "detected" : sourceLabel ? "partial" : "none";
  return { sourceLabel, detectedHotelName, extractionStatus };
}

// ===========================================================================
// UI components
// ===========================================================================

function OptionPills<T extends string>({
  label, options, value, onChange, optional,
}: {
  label: string; options: T[]; value: T | ""; onChange: (v: T | "") => void; optional?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {label}
        {optional && <span className="text-gray-400 font-normal ml-1.5">— optional</span>}
      </label>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button key={opt} type="button" onClick={() => onChange(value === opt ? "" : opt)}
            className={`px-3.5 py-1.5 rounded-full text-sm border transition-colors ${
              value === opt
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
            }`}>
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

function BooleanPills({
  label, trueLabel, falseLabel, value, onChange, compact,
}: {
  label: string; trueLabel: string; falseLabel: string;
  value: boolean; onChange: (v: boolean) => void; compact?: boolean;
}) {
  return (
    <div>
      <label className={`block font-medium text-gray-700 mb-1.5 ${compact ? "text-xs" : "text-sm"}`}>
        {label}
      </label>
      <div className="flex gap-2">
        {([true, false] as const).map((v) => (
          <button key={String(v)} type="button" onClick={() => onChange(v)}
            className={`px-3 py-1 rounded-full border transition-colors ${compact ? "text-xs" : "text-sm"} ${
              value === v
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
            }`}>
            {v ? trueLabel : falseLabel}
          </button>
        ))}
      </div>
    </div>
  );
}

function RateOptionCard({
  rate, index, onChange, onRemove, canRemove,
}: {
  rate: RateOption; index: number;
  onChange: (updated: RateOption) => void;
  onRemove: () => void; canRemove: boolean;
}) {
  return (
    <div className="bg-gray-50 rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Rate {index + 1}
        </span>
        {canRemove && (
          <button type="button" onClick={onRemove}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
            Remove
          </button>
        )}
      </div>

      <input
        type="text"
        placeholder="Label — e.g. Free cancellation, Breakfast included"
        value={rate.label}
        onChange={(e) => onChange({ ...rate, label: e.target.value })}
        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent"
      />

      <div>
        <label className="block text-xs text-gray-500 mb-1.5">Price per night ($)</label>
        <input
          type="number" placeholder="e.g. 175" min="1"
          value={rate.pricePerNight}
          onChange={(e) => onChange({ ...rate, pricePerNight: e.target.value })}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <BooleanPills
          label="Cancellation" trueLabel="Refundable" falseLabel="Non-refund."
          value={rate.refundable} onChange={(v) => onChange({ ...rate, refundable: v })}
          compact
        />
        <BooleanPills
          label="Breakfast" trueLabel="Included" falseLabel="Not incl."
          value={rate.breakfastIncluded}
          onChange={(v) => onChange({ ...rate, breakfastIncluded: v })}
          compact
        />
      </div>
    </div>
  );
}

const inputClass =
  "w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent";
const selectClass =
  `${inputClass} bg-white disabled:bg-gray-50 disabled:text-gray-400`;

// ===========================================================================
// App
// ===========================================================================

export default function App() {
  // ── mode & link state ──────────────────────────────────────────────────────
  const [appMode,          setAppMode]          = useState<AppMode>("home");
  const [pastedLink,       setPastedLink]       = useState("");
  const [hotelLinkContext, setHotelLinkContext] = useState<HotelLinkContext | null>(null);

  // ── form state ─────────────────────────────────────────────────────────────
  const [form, setForm] = useState<FormData>({
    hotelName: "", country: "", city: "", checkIn: "", checkOut: "",
    price: "", flexibility: "", urgency: "",
  });

  // ── rate options ───────────────────────────────────────────────────────────
  // Manual mode: empty by default, shown when user expands the section
  // Link-confirm mode: always visible, at least 1 card
  const [rateOptions,     setRateOptions]     = useState<RateOption[]>([]);
  const [showRateOptions, setShowRateOptions] = useState(false); // manual mode toggle

  // ── refine panel ──────────────────────────────────────────────────────────
  const [showRefine, setShowRefine] = useState(false);

  // ── result & UI state ──────────────────────────────────────────────────────
  const [result, setResult] = useState<{
    headline:         string;
    confidence:       Confidence;
    signal:           string;
    verdict:          Verdict;
    factors:          FactorStates;
    sourceBasis:      string;
    daysUntilCheckIn: number;
    currentPrice:     number;
    tripDays:         number;
    flexibility:      string;
    hotelName:        string;
    rateEvaluation:   RateRecommendation | null;
  } | null>(null);

  const [showWhy, setShowWhy] = useState(false);
  const [loading, setLoading] = useState(false);

  const getExplanation = useAction(api.advisor.getExplanation);

  // ── helpers ────────────────────────────────────────────────────────────────

  function getTripDays(checkIn = form.checkIn, checkOut = form.checkOut): number {
    if (!checkIn || !checkOut) return 0;
    const diff = new Date(checkOut).getTime() - new Date(checkIn).getTime();
    return Math.max(0, Math.round(diff / (1000 * 60 * 60 * 24)));
  }

  function getDaysUntilCheckIn(checkIn = form.checkIn): number {
    if (!checkIn) return 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = new Date(checkIn).getTime() - today.getTime();
    return Math.max(0, Math.round(diff / (1000 * 60 * 60 * 24)));
  }

  // ── link flow ──────────────────────────────────────────────────────────────

  function handleLinkContinue() {
    const url = pastedLink.trim();
    if (!url) { toast.error("Please paste a hotel link."); return; }
    const ctx = getHotelLinkContext(url);
    setHotelLinkContext(ctx);
    setAppMode("link-confirm");
    setForm(f => ({
      ...f,
      hotelName: ctx.detectedHotelName ?? "",
      country: "", city: "", checkIn: "", checkOut: "",
    }));
    setRateOptions([]);
    setShowRateOptions(false);
    setResult(null);
    setShowWhy(false);
    setShowRefine(false);
  }

  function handleBackToHome() {
    setAppMode("home");
    setPastedLink("");
    setHotelLinkContext(null);
    setResult(null);
    setShowWhy(false);
    setShowRefine(false);
    handleDisableRateOptions();
  }

  // ── manual rate-options toggle ─────────────────────────────────────────────

  function handleEnableRateOptions() {
    const seed = form.price ? [{ ...EMPTY_RATE(), pricePerNight: form.price }] : [EMPTY_RATE()];
    setRateOptions(seed);
    setShowRateOptions(true);
  }

  function handleDisableRateOptions() {
    setRateOptions([]);
    setShowRateOptions(false);
  }

  // ── shared submit ──────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!form.country) { toast.error("Please select a country."); return; }
    if (!form.city)    { toast.error("Please select a city.");    return; }

    const tripDays = getTripDays();
    if (tripDays <= 0) { toast.error("Check-out must be after check-in."); return; }

    // Determine the primary price for timing analysis
    const isRateMode = showRateOptions;
    let primaryPrice: number;

    if (isRateMode) {
      if (rateOptions.length === 0 || !rateOptions[0].pricePerNight) {
        toast.error("Please enter a price for at least one rate option."); return;
      }
      primaryPrice = Number(rateOptions[0].pricePerNight);
      if (isNaN(primaryPrice) || primaryPrice <= 0) {
        toast.error("Please enter a valid price for Rate 1."); return;
      }
    } else {
      if (!form.price || isNaN(Number(form.price)) || Number(form.price) <= 0) {
        toast.error("Please enter a valid price."); return;
      }
      primaryPrice = Number(form.price);
    }

    const daysUntilCheckIn = getDaysUntilCheckIn();
    const pipeline = runDecisionPipeline({
      country:          form.country,
      city:             form.city,
      checkIn:          form.checkIn,
      price:            primaryPrice,
      daysUntilCheckIn,
      flexibility:      form.flexibility,
      urgency:          form.urgency,
    });

    // Build rate inputs for evaluation (if 2+ options)
    const rateInputs: RateOptionInput[] = rateOptions
      .filter(r => Number(r.pricePerNight) > 0)
      .map(r => ({
        label:             r.label.trim(),
        pricePerNight:     Number(r.pricePerNight),
        refundable:        r.refundable,
        breakfastIncluded: r.breakfastIncluded,
      }));

    setLoading(true);
    setResult(null);
    setShowWhy(false);

    try {
      const raw = await getExplanation({
        country:       form.country,
        city:          form.city,
        checkIn:       form.checkIn,
        checkOut:      form.checkOut,
        price:         primaryPrice,
        flexibility:   form.flexibility,
        urgency:       form.urgency,
        headline:      pipeline.headline,
        confidence:    pipeline.confidence,
        tripDays,
        timing:        timingLabel(daysUntilCheckIn),
        pricePosition: pipeline.factors.pricePosition,
        lowTypical:    pipeline.factors.fareContext.lowTypical,
        highTypical:   pipeline.factors.fareContext.highTypical,
      });

      const nextResult = {
        headline:         pipeline.headline,
        confidence:       pipeline.confidence,
        signal:           (raw ?? "").trim(),
        verdict:          pipeline.verdict,
        factors:          pipeline.factors,
        sourceBasis:      pipeline.sourceBasis,
        daysUntilCheckIn,
        currentPrice:     primaryPrice,
        tripDays,
        flexibility:      form.flexibility,
        hotelName:        form.hotelName.trim(),
        rateEvaluation:   evaluateRateOptions(rateInputs),
      };
      setResult(nextResult);
      const { verdict: renderedVerdict } = get4StateDecision(
        nextResult.factors.pricePosition,
        nextResult.factors.demand,
        nextResult.factors.timePressure,
      );
      track("result_generated", { verdict: renderedVerdict, city: form.city, country: form.country });
    } catch {
      toast.error("Failed to get a recommendation. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── derived values ─────────────────────────────────────────────────────────

  const fourState = result
    ? get4StateDecision(result.factors.pricePosition, result.factors.demand, result.factors.timePressure)
    : null;

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-start py-14 px-4">
      <div className="w-full max-w-md">

        {/* ── Page heading ─────────────────────────────────────────────────── */}
        <h1 className="text-2xl font-bold text-gray-900 mb-2 leading-snug">
          Should You Book This Hotel Now — or Wait?
        </h1>
        <p className="text-sm text-gray-500 mb-1">
          A quick, calm way to decide if it&apos;s better to book now or give it a little more time.
        </p>
        <p className="text-xs text-gray-400 mb-10">
          Best for trips where price and availability may change quickly.
        </p>

        {/* ================================================================= */}
        {/* HOME MODE                                                         */}
        {/* ================================================================= */}
        {appMode === "home" && (
          <>
            {/* ── Link paste section ───────────────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 flex flex-col gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">Already found a hotel?</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Paste the hotel link and we&apos;ll help you decide.
                </p>
              </div>
              <div className="flex gap-2">
                <input
                  type="url"
                  placeholder="Paste hotel link here…"
                  value={pastedLink}
                  onChange={(e) => setPastedLink(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLinkContinue()}
                  className={`flex-1 ${inputClass}`}
                />
                <button
                  type="button"
                  onClick={handleLinkContinue}
                  className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 transition-colors whitespace-nowrap"
                >
                  Continue →
                </button>
              </div>
            </div>

            {/* ── Divider ──────────────────────────────────────────────────── */}
            <div className="flex items-center gap-3 my-7">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-gray-400">or enter details manually</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            {/* ── Manual form ──────────────────────────────────────────────── */}
            <form
              onSubmit={handleSubmit}
              className="bg-white rounded-2xl border border-gray-200 shadow-sm p-7 flex flex-col gap-6"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                  <select value={form.country}
                    onChange={(e) => setForm((f) => ({ ...f, country: e.target.value, city: "" }))}
                    className={selectClass}>
                    <option value="">Select country</option>
                    {Object.keys(CITY_MAP).map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                  <select value={form.city}
                    onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                    disabled={!form.country} className={selectClass}>
                    <option value="">Select city</option>
                    {(CITY_MAP[form.country] ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Check-in</label>
                  <input type="date" value={form.checkIn}
                    onChange={(e) => setForm((f) => ({ ...f, checkIn: e.target.value }))}
                    className={inputClass} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Check-out</label>
                  <input type="date" value={form.checkOut}
                    onChange={(e) => setForm((f) => ({ ...f, checkOut: e.target.value }))}
                    className={inputClass} required />
                </div>
              </div>

              {/* Price */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Current price per night ($)
                </label>
                <input type="number" placeholder="e.g. 180" min="1"
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                  className={inputClass} required={!showRateOptions} />
              </div>

              {/* Refine (optional) */}
              <div className="flex flex-col gap-0">
                <button
                  type="button"
                  onClick={() => {
                    if (showRefine) { handleDisableRateOptions(); }
                    setShowRefine(v => !v);
                  }}
                  className="flex items-center justify-between w-full py-2 text-left group"
                >
                  <span className="flex items-center gap-2 text-xs text-gray-400 group-hover:text-gray-600 transition-colors">
                    <span className="text-gray-300 group-hover:text-gray-500 transition-colors">
                      {showRefine ? "▾" : "▸"}
                    </span>
                    Refine (optional)
                  </span>
                  {!showRefine && (
                    <span className="text-xs text-gray-300">Works fine without this</span>
                  )}
                </button>

                {showRefine && (
                  <div className="flex flex-col gap-5 pt-3 pb-1 border-t border-gray-100 mt-1">

                    <OptionPills<Flexibility>
                      label="Flexibility" options={["Fixed dates", "Flexible"]}
                      value={form.flexibility} onChange={(v) => setForm((f) => ({ ...f, flexibility: v }))}
                      optional />
                    <OptionPills<Urgency>
                      label="Urgency" options={["Low", "Medium", "High"]}
                      value={form.urgency} onChange={(v) => setForm((f) => ({ ...f, urgency: v }))}
                      optional />

                    {/* Rate comparison */}
                    {!showRateOptions ? (
                      <button type="button" onClick={handleEnableRateOptions}
                        className="text-xs text-gray-400 hover:text-gray-600 transition-colors text-left">
                        + Compare rate options
                      </button>
                    ) : (
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <label className="block text-sm font-medium text-gray-700">Rate options</label>
                          <button type="button" onClick={handleDisableRateOptions}
                            className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
                            Remove
                          </button>
                        </div>
                        {rateOptions.map((rate, i) => (
                          <RateOptionCard key={rate.id} rate={rate} index={i}
                            onChange={(u) => setRateOptions(prev => prev.map((r) => r.id === u.id ? u : r))}
                            onRemove={() => setRateOptions(prev => prev.filter((r) => r.id !== rate.id))}
                            canRemove={rateOptions.length > 1}
                          />
                        ))}
                        {rateOptions.length < 3 && (
                          <button type="button" onClick={() => setRateOptions(prev => [...prev, EMPTY_RATE()])}
                            className="text-xs text-gray-500 border border-dashed border-gray-300 rounded-xl py-2.5 hover:border-gray-400 hover:text-gray-700 transition-colors">
                            + Add another rate
                          </button>
                        )}
                      </div>
                    )}

                  </div>
                )}
              </div>

              <button type="submit" disabled={loading}
                className="w-full py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-1">
                {loading ? "Thinking…" : "Should I book now?"}
              </button>
            </form>
          </>
        )}

        {/* ================================================================= */}
        {/* LINK-CONFIRM MODE                                                 */}
        {/* ================================================================= */}
        {appMode === "link-confirm" && (
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-2xl border border-gray-200 shadow-sm p-7 flex flex-col gap-6"
          >
            {/* ── Link context block ───────────────────────────────────────── */}
            <div className="bg-gray-50 rounded-xl px-4 py-3.5 flex flex-col gap-1.5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                  <p className="text-sm font-semibold text-gray-800">Hotel link added</p>
                  {hotelLinkContext?.sourceLabel && (
                    <p className="text-xs text-gray-500">Source: {hotelLinkContext.sourceLabel}</p>
                  )}
                </div>
                <button type="button" onClick={handleBackToHome}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors shrink-0 mt-0.5">
                  ← Change
                </button>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">
                {hotelLinkContext?.extractionStatus === "detected"
                  ? "We detected the hotel name from the link. Please confirm the details below."
                  : hotelLinkContext?.extractionStatus === "partial"
                  ? "We saved your link and will use it as context. Please confirm the stay details below."
                  : "We saved the link, but couldn't read booking details from it. Please fill in the details below."
                }
              </p>
            </div>

            {/* Hotel name — prefilled when detected */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hotel name</label>
              <input type="text" placeholder="e.g. Marriott Sukhumvit Bangkok"
                value={form.hotelName}
                onChange={(e) => setForm((f) => ({ ...f, hotelName: e.target.value }))}
                className={inputClass} />
              {hotelLinkContext?.extractionStatus === "detected" && (
                <p className="text-xs text-gray-400 mt-1.5">
                  Name detected from your link — adjust if needed.
                </p>
              )}
            </div>

            {/* Country + City */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                <select value={form.country}
                  onChange={(e) => setForm((f) => ({ ...f, country: e.target.value, city: "" }))}
                  className={selectClass}>
                  <option value="">Select country</option>
                  {Object.keys(CITY_MAP).map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                <select value={form.city}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                  disabled={!form.country} className={selectClass}>
                  <option value="">Select city</option>
                  {(CITY_MAP[form.country] ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {/* Check-in + Check-out */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Check-in</label>
                <input type="date" value={form.checkIn}
                  onChange={(e) => setForm((f) => ({ ...f, checkIn: e.target.value }))}
                  className={inputClass} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Check-out</label>
                <input type="date" value={form.checkOut}
                  onChange={(e) => setForm((f) => ({ ...f, checkOut: e.target.value }))}
                  className={inputClass} required />
              </div>
            </div>

            {/* Price */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Current price per night ($)
              </label>
              <input type="number" placeholder="e.g. 180" min="1"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                className={inputClass} required={!showRateOptions} />
            </div>

            {/* Refine (optional) */}
            <div className="flex flex-col gap-0">
              <button
                type="button"
                onClick={() => {
                  if (showRefine) { handleDisableRateOptions(); }
                  setShowRefine(v => !v);
                }}
                className="flex items-center justify-between w-full py-2 text-left group"
              >
                <span className="flex items-center gap-2 text-xs text-gray-400 group-hover:text-gray-600 transition-colors">
                  <span className="text-gray-300 group-hover:text-gray-500 transition-colors">
                    {showRefine ? "▾" : "▸"}
                  </span>
                  Refine (optional)
                </span>
                {!showRefine && (
                  <span className="text-xs text-gray-300">Works fine without this</span>
                )}
              </button>

              {showRefine && (
                <div className="flex flex-col gap-5 pt-3 pb-1 border-t border-gray-100 mt-1">
                  <OptionPills<Flexibility>
                    label="Flexibility" options={["Fixed dates", "Flexible"]}
                    value={form.flexibility} onChange={(v) => setForm((f) => ({ ...f, flexibility: v }))}
                    optional />
                  <OptionPills<Urgency>
                    label="Urgency" options={["Low", "Medium", "High"]}
                    value={form.urgency} onChange={(v) => setForm((f) => ({ ...f, urgency: v }))}
                    optional />

                  {/* Rate comparison */}
                  {!showRateOptions ? (
                    <button type="button" onClick={handleEnableRateOptions}
                      className="text-xs text-gray-400 hover:text-gray-600 transition-colors text-left">
                      + Compare rate options
                    </button>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <label className="block text-sm font-medium text-gray-700">Rate options</label>
                        <button type="button" onClick={handleDisableRateOptions}
                          className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
                          Remove
                        </button>
                      </div>
                      {rateOptions.map((rate, i) => (
                        <RateOptionCard key={rate.id} rate={rate} index={i}
                          onChange={(u) => setRateOptions(prev => prev.map((r) => r.id === u.id ? u : r))}
                          onRemove={() => setRateOptions(prev => prev.filter((r) => r.id !== rate.id))}
                          canRemove={rateOptions.length > 1}
                        />
                      ))}
                      {rateOptions.length < 3 && (
                        <button type="button" onClick={() => setRateOptions(prev => [...prev, EMPTY_RATE()])}
                          className="text-xs text-gray-500 border border-dashed border-gray-300 rounded-xl py-2.5 hover:border-gray-400 hover:text-gray-700 transition-colors">
                          + Add another rate
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <button type="submit" disabled={loading}
              className="w-full py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-1">
              {loading ? "Thinking…" : "Should I book now?"}
            </button>
          </form>
        )}

        {/* ── Loading ────────────────────────────────────────────────────────── */}
        {loading && (
          <div className="mt-10 flex justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-400" />
          </div>
        )}

        {/* ================================================================= */}
        {/* RESULT — DECISION CARD                                           */}
        {/* ================================================================= */}
        {result && fourState && (
          <div className="mt-8 bg-white rounded-2xl border border-gray-200 shadow-sm px-8 py-12 flex flex-col gap-8">

            {/* Hotel name — subtle context only */}
            {result.hotelName && (
              <p className="text-xs text-gray-400 -mb-4">{result.hotelName}</p>
            )}

            {/* Primary decision */}
            <p className="text-5xl font-black tracking-tight text-gray-900 leading-none">
              {fourState.verdict === "BOOK_NOW" ? "Book now" : "Wait"}
            </p>

            {/* 2 support lines */}
            <div className="flex flex-col gap-2">
              <p className="text-sm text-gray-500">price {fourState.priceSignal}</p>
              <p className="text-sm text-gray-500">rooms {fourState.roomsSignal}</p>
            </div>

            {/* Divider — decision boundary */}
            <div className="mt-2 mb-2 h-px bg-gray-200" />

            {/* Opposite option — present but not the answer */}
            <p className="text-xs text-gray-900/30 mt-2">
              {fourState.verdict === "BOOK_NOW" ? "wait" : "book now"}
            </p>

            {/* Check price — BOOK NOW only; href is replaced with affiliate link later */}
            {fourState.verdict === "BOOK_NOW" && (
              <a
                href={pastedLink || "https://www.booking.com/"}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track("check_price_clicked", { hotelName: result.hotelName })}
                className="mt-8 block w-full text-center py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 transition-colors"
              >
                Check price
              </a>
            )}

          </div>
        )}

        {/* ================================================================= */}
        {/* RESULT — RATE CHOICE CARD (only when 2+ rate options evaluated)  */}
        {/* ================================================================= */}
        {result?.rateEvaluation && (
          <div className="mt-4 bg-white rounded-2xl border border-gray-200 shadow-sm px-7 py-6 flex flex-col gap-4">

            {/* Section label */}
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">
              Rate choice
            </p>

            {/* Best rate label + headline */}
            <div className="flex flex-col gap-1">
              <p className="text-xs text-gray-500">{result.rateEvaluation.bestLabel}</p>
              <p className="text-base font-semibold text-gray-900 leading-snug">
                {result.rateEvaluation.headline}
              </p>
            </div>

            {/* Why bullets */}
            {result.rateEvaluation.reasons.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Why</p>
                <ul className="flex flex-col gap-1.5">
                  {result.rateEvaluation.reasons.map((line, i) => (
                    <li key={i} className="flex gap-2 text-xs text-gray-500 leading-relaxed">
                      <span className="text-gray-300 shrink-0 mt-px">—</span>
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Alternative note */}
            {result.rateEvaluation.alternativeNote && (
              <p className="text-xs text-gray-400 leading-relaxed pt-1 border-t border-gray-100">
                {result.rateEvaluation.alternativeNote}
              </p>
            )}
          </div>
        )}

      </div>
      <Toaster />
    </div>
  );
}
