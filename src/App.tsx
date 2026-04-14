import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "../convex/_generated/api";
import { Toaster, toast } from "sonner";

type Flexibility = "Low" | "Medium" | "High";
type Urgency = "Low" | "Medium" | "High";

interface FormData {
  destination: string;
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

export default function App() {
  const [form, setForm] = useState<FormData>({
    destination: "",
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
    nextStep: string;
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
    const tripDays = getTripDays();
    if (tripDays <= 0) {
      toast.error("Check-out must be after check-in.");
      return;
    }
    if (!form.destination.trim()) {
      toast.error("Please enter a destination.");
      return;
    }
    if (!form.price || isNaN(Number(form.price)) || Number(form.price) <= 0) {
      toast.error("Please enter a valid price.");
      return;
    }

    const score = calcScore(tripDays, form.flexibility, form.urgency, form.likesHotel);
    const decision = scoreToDecision(score);

    setLoading(true);
    setResult(null);
    try {
      const raw = await getExplanation({
        destination: form.destination,
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

      // Parse explanation and next step
      const nextStepMatch = raw?.match(/Next step:\s*(.+)/i);
      const nextStep = nextStepMatch ? nextStepMatch[1].trim() : "";
      const explanation = raw
        ? raw.replace(/Next step:.*/is, "").trim()
        : "";

      setResult({ decision, score, explanation, nextStep });
    } catch {
      toast.error("Failed to get explanation. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const style = result ? decisionStyles[result.decision] : null;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-start py-10 px-4">
      <div className="w-full max-w-lg">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Book or Wait?</h1>
        <p className="text-sm text-gray-500 mb-6">Enter your trip details to get a quick booking recommendation.</p>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 flex flex-col gap-4">
          {/* Destination */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Destination</label>
            <input
              type="text"
              placeholder="e.g. Paris, France"
              value={form.destination}
              onChange={e => setForm(f => ({ ...f, destination: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Check-in</label>
              <input
                type="date"
                value={form.checkIn}
                onChange={e => setForm(f => ({ ...f, checkIn: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Check-out</label>
              <input
                type="date"
                value={form.checkOut}
                onChange={e => setForm(f => ({ ...f, checkOut: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>
          </div>

          {/* Price */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Current Price (per night, $)</label>
            <input
              type="number"
              placeholder="e.g. 180"
              min="1"
              value={form.price}
              onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
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
                onChange={e => setForm(f => ({ ...f, flexibility: e.target.value as Flexibility }))}
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
                onChange={e => setForm(f => ({ ...f, urgency: e.target.value as Urgency }))}
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
              onChange={e => setForm(f => ({ ...f, likesHotel: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">I really like this hotel</span>
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-1"
          >
            {loading ? "Analyzing…" : "Get Recommendation"}
          </button>
        </form>

        {/* Result */}
        {loading && (
          <div className="mt-6 flex justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
          </div>
        )}

        {result && style && (
          <div className={`mt-6 rounded-xl border ${style.border} ${style.bg} p-5`}>
            <div className="flex items-center justify-between mb-3">
              <span className={`text-xl font-bold ${style.text}`}>{result.decision}</span>
              <span className="text-xs text-gray-400 font-mono">score: {result.score > 0 ? "+" : ""}{result.score}</span>
            </div>
            <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-line mb-3">
              {result.explanation}
            </div>
            {result.nextStep && (
              <div className="border-t border-gray-200 pt-3 mt-1">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Next step</span>
                <p className="text-sm text-gray-800 mt-0.5">{result.nextStep}</p>
              </div>
            )}
          </div>
        )}
      </div>
      <Toaster />
    </div>
  );
}
