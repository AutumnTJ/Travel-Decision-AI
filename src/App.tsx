import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "../convex/_generated/api";
import { Toaster, toast } from "sonner";

type BudgetType = "Budget" | "Mid-range" | "Luxury";
type TravelTiming = "Last-minute" | "Flexible" | "Fixed dates";
type Flexibility = "Low" | "Medium" | "High";
type Urgency = "Low" | "Medium" | "High";

const CITY_MAP: Record<string, string[]> = {
  Thailand: ["Bangkok", "Chiang Mai", "Phuket", "Pattaya", "Krabi"],
  Japan: ["Tokyo", "Osaka", "Kyoto", "Sapporo", "Fukuoka"],
  France: ["Paris", "Nice", "Lyon", "Marseille", "Bordeaux"],
  "United States": ["New York", "Los Angeles", "Miami", "Chicago", "Las Vegas"],
  Italy: ["Rome", "Florence", "Venice", "Milan", "Amalfi"],
  "United Kingdom": ["London", "Edinburgh", "Manchester", "Bath", "Oxford"],
  Spain: ["Barcelona", "Madrid", "Seville", "Valencia", "Granada"],
  Australia: ["Sydney", "Melbourne", "Brisbane", "Perth", "Cairns"],
};

interface FormData {
  country: string;
  city: string;
  budget: BudgetType | "";
  travelTiming: TravelTiming | "";
  checkIn: string;
  checkOut: string;
  price: string;
  flexibility: Flexibility;
  urgency: Urgency;
  likesHotel: boolean;
}

function calcScore(
  tripDays: number,
  flexibility: Flexibility,
  urgency: Urgency,
  likesHotel: boolean
): number {
  let score = 0;
  if (tripDays < 14) score += 2;
  else if (tripDays < 30) score += 1;
  if (tripDays > 45) score -= 1;
  if (flexibility === "Low") score += 2;
  if (flexibility === "High") score -= 2;
  if (urgency === "High") score += 2;
  if (urgency === "Medium") score += 1;
  if (urgency === "Low") score -= 1;
  if (likesHotel) score += 1;
  return score;
}

function scoreToDecision(score: number): string {
  if (score >= 3) return "Book Now";
  if (score >= 1) return "Lean Book";
  if (score >= -1) return "Lean Wait";
  return "Wait";
}

const decisionStyles: Record<string, { bg: string; text: string; border: string }> = {
  "Book Now": { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-300" },
  "Lean Book": { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-300" },
  "Lean Wait": { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-300" },
  "Wait": { bg: "bg-red-50", text: "text-red-700", border: "border-red-300" },
};

function FilterGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: T[];
  value: T | "";
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
              value === opt
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

const selectClass = "w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white disabled:bg-gray-50 disabled:text-gray-400";

export default function App() {
  const [form, setForm] = useState<FormData>({
    country: "",
    city: "",
    budget: "",
    travelTiming: "",
    checkIn: "",
    checkOut: "",
    price: "",
    flexibility: "Medium",
    urgency: "Medium",
    likesHotel: false,
  });
  const [result, setResult] = useState<{
    decision: string;
    score: number;
    explanation: string;
    isHighDemand: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const getExplanation = useAction(api.advisor.getExplanation);

  function getTripDays(): number {
    if (!form.checkIn || !form.checkOut) return 0;
    const diff = new Date(form.checkOut).getTime() - new Date(form.checkIn).getTime();
    return Math.max(0, Math.round(diff / (1000 * 60 * 60 * 24)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.country) {
      toast.error("Please select a country.");
      return;
    }
    if (!form.city) {
      toast.error("Please select a city.");
      return;
    }
    if (!form.budget) {
      toast.error("Please select a budget range.");
      return;
    }
    if (!form.travelTiming) {
      toast.error("Please select your travel timing.");
      return;
    }
    const tripDays = getTripDays();
    if (tripDays <= 0) {
      toast.error("Check-out must be after check-in.");
      return;
    }
    if (!form.price || isNaN(Number(form.price)) || Number(form.price) <= 0) {
      toast.error("Please enter a valid price.");
      return;
    }

    const score = calcScore(tripDays, form.flexibility, form.urgency, form.likesHotel);
    const decision = scoreToDecision(score);
    const isHighDemand = form.urgency === "High" || form.travelTiming === "Last-minute";

    setLoading(true);
    setResult(null);
    try {
      const explanation = await getExplanation({
        country: form.country,
        city: form.city,
        budget: form.budget,
        travelTiming: form.travelTiming,
        checkIn: form.checkIn,
        checkOut: form.checkOut,
        price: Number(form.price),
        flexibility: form.flexibility,
        urgency: form.urgency,
        likesHotel: form.likesHotel,
        score,
        decision,
        tripDays,
      });

      setResult({ decision, score, explanation: explanation ?? "", isHighDemand });
    } catch {
      toast.error("Failed to get a recommendation. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const style = result ? decisionStyles[result.decision] : null;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-start py-10 px-4">
      <div className="w-full max-w-lg">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Should You Book This Hotel Now — or Wait?</h1>
        <p className="text-sm text-gray-500 mb-2">For trips where prices and availability can change quickly.</p>
        <p className="text-xs text-gray-400 mb-8">Best for peak season trips — Japan, Europe, holidays, and high-demand periods.</p>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 flex flex-col gap-5">
          {/* Location */}
          <div>
            <p className="text-xs text-gray-400 mb-2">Where are you going during a high-demand period?</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
              <select
                value={form.country}
                onChange={(e) => setForm((f) => ({ ...f, country: e.target.value, city: "" }))}
                className={selectClass}
              >
                <option value="">Select country</option>
                {Object.keys(CITY_MAP).map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
              <select
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                disabled={!form.country}
                className={selectClass}
              >
                <option value="">Select city</option>
                {(CITY_MAP[form.country] ?? []).map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
          </div>

          {/* Budget */}
          <FilterGroup<BudgetType>
            label="Budget"
            options={["Budget", "Mid-range", "Luxury"]}
            value={form.budget}
            onChange={(v) => setForm((f) => ({ ...f, budget: v }))}
          />

          {/* Travel timing */}
          <FilterGroup<TravelTiming>
            label="Travel timing"
            options={["Last-minute", "Flexible", "Fixed dates"]}
            value={form.travelTiming}
            onChange={(v) => setForm((f) => ({ ...f, travelTiming: v }))}
          />

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Check-in</label>
              <input
                type="date"
                value={form.checkIn}
                onChange={(e) => setForm((f) => ({ ...f, checkIn: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Check-out</label>
              <input
                type="date"
                value={form.checkOut}
                onChange={(e) => setForm((f) => ({ ...f, checkOut: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>
          </div>

          {/* Price */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Current price (per night, $)</label>
            <input
              type="number"
              placeholder="e.g. 180"
              min="1"
              value={form.price}
              onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          {/* Flexibility & Urgency */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Flexibility</label>
              <select
                value={form.flexibility}
                onChange={(e) => setForm((f) => ({ ...f, flexibility: e.target.value as Flexibility }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Urgency</label>
              <select
                value={form.urgency}
                onChange={(e) => setForm((f) => ({ ...f, urgency: e.target.value as Urgency }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
            </div>
          </div>

          {/* Likes hotel */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.likesHotel}
              onChange={(e) => setForm((f) => ({ ...f, likesHotel: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">I really like this hotel</span>
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-1"
          >
            {loading ? "Thinking…" : "Get Recommendation"}
          </button>
        </form>

        {/* Loading */}
        {loading && (
          <div className="mt-8 flex justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
          </div>
        )}

        {/* Result */}
        {result && style && (
          <div className={`mt-8 rounded-xl border ${style.border} ${style.bg} p-5`}>
            <div className="flex items-center justify-between mb-4">
              <span className={`text-xl font-bold ${style.text}`}>{result.decision}</span>
              <div className="flex items-center gap-2">
                {result.isHighDemand && (
                  <span className="text-xs text-gray-400 border border-gray-200 px-2 py-0.5 rounded-full">
                    Peak travel period
                  </span>
                )}
                <span className="text-xs text-gray-400 font-mono">score: {result.score > 0 ? "+" : ""}{result.score}</span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {result.explanation
                .split("\n")
                .map((line) => line.trim())
                .filter((line) => line.length > 0)
                .map((line, i) => (
                  <p
                    key={i}
                    className={
                      i === 0
                        ? `text-sm font-medium text-gray-800 leading-snug`
                        : `text-sm text-gray-500 leading-snug`
                    }
                  >
                    {line}
                  </p>
                ))}
            </div>
          </div>
        )}
      </div>
      <Toaster />
    </div>
  );
}
