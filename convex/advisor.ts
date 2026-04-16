import { action } from "./_generated/server";
import { v } from "convex/values";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.CONVEX_OPENAI_API_KEY,
});

// Signal sentence pools keyed by headline.
// Each sentence blends a soft price comparison with a timing or behavior signal.
// "CITY" and "MONTH" are substituted before the prompt is sent.
const SIGNAL_POOLS: Record<string, string[]> = {
  "Wait — you're early": [
    "This looks like a fair rate, and you still have plenty of time before the trip.",
    "Prices are around a typical range, and there's no pressure to decide right now.",
    "Rates often settle before trips this far out — nothing stands out yet.",
  ],
  "Wait — low risk for now": [
    "This is around a typical range, and prices are usually stable at this stage.",
    "Nothing stands out here — waiting a bit longer carries low risk.",
    "There's no strong price signal, and no clear reason to rush right now.",
  ],
  "Wait — you have flexibility": [
    "Your flexible dates give you room to wait, and there's no strong pressure to book yet.",
    "With some flexibility, you're not locked into this price — and there's time to see if it shifts.",
    "Nothing stands out right now, and your flexibility gives you more room to hold off.",
  ],
  "Wait — no strong signal yet": [
    "This is around a typical range, and there's no strong pressure to book yet.",
    "Nothing stands out right now — no clear signal in either direction.",
    "There's no strong reason to act immediately — the situation looks neutral.",
  ],
  "Wait — price feels high": [
    "This is a bit higher than usual for these dates, and you still have time for prices to shift.",
    "This price is on the higher side — waiting may give you a better option.",
    "This looks slightly above the typical range, and there's no rush to lock it in now.",
  ],
  "Book now — good price": [
    "This looks slightly lower than typical, and prices don't usually improve much closer to the trip.",
    "This is on the lower side for these dates — a solid rate worth locking in.",
    "This looks better than what's often seen here, and good rates don't always stay available.",
  ],
  "Book now — getting close": [
    "Prices rarely improve much at this stage, and this looks like a fair rate to lock in.",
    "Getting closer to the date, options at this price are less likely to last.",
    "This is around a typical range, and prices don't usually drop from here.",
  ],
  "Book now — busy period": [
    "CITY in MONTH is a busy time, and this looks like a solid rate compared to usual.",
    "This period fills up quickly — and this price is around what you'd expect for these dates.",
    "MONTH in CITY doesn't usually get cheaper closer to the date, and this looks like a fair rate.",
  ],
  "Book now — for peace of mind": [
    "This looks like a fair rate, and booking now removes the uncertainty.",
    "The price is around a reasonable range, and locking it in now avoids any last-minute stress.",
    "Nothing stands out as a reason to wait — and booking now gives you more certainty.",
  ],
  "Book now — safer to lock in": [
    "This looks like a solid rate, and prices don't usually improve much from this point.",
    "This is around a typical range, and waiting may not give you much upside from here.",
    "Nothing here suggests waiting will help — and this is worth securing now.",
  ],
};

export const getExplanation = action({
  args: {
    country:       v.string(),
    city:          v.string(),
    checkIn:       v.string(),
    checkOut:      v.string(),
    price:         v.number(),
    flexibility:   v.string(),
    urgency:       v.string(),
    headline:      v.string(),
    confidence:    v.string(),
    tripDays:      v.number(),
    timing:        v.string(),
    pricePosition: v.string(),   // "good" | "normal" | "expensive"
    lowTypical:    v.number(),
    highTypical:   v.number(),
  },
  handler: async (_ctx, args) => {
    const checkInDate  = new Date(args.checkIn);
    const checkInMonth = checkInDate.toLocaleString("en-US", { month: "long" });

    const signalPool = (SIGNAL_POOLS[args.headline] ?? SIGNAL_POOLS["Wait — low risk for now"])
      .map((s) => s.replace("CITY", args.city).replace("MONTH", checkInMonth));

    const priceDesc =
      args.pricePosition === "good"
        ? `below the typical range ($${args.lowTypical}–$${args.highTypical}/night)`
        : args.pricePosition === "expensive"
        ? `above the typical range ($${args.lowTypical}–$${args.highTypical}/night)`
        : `within the typical range ($${args.lowTypical}–$${args.highTypical}/night)`;

    const prompt = `You are a calm hotel booking advisor. Write exactly 1 sentence. No labels, bullets, or numbering.

Situation:
- Destination: ${args.city}, ${args.country}
- Month: ${checkInMonth}
- Timing: ${args.timing}
- Stay: ${args.tripDays} nights at $${args.price}/night (${priceDesc})
- Flexibility: ${args.flexibility || "not specified"}
- Urgency: ${args.urgency || "not specified"}
- Decision: ${args.headline} (${args.confidence} confidence)

Write ONE signal sentence that combines a soft price comparison with a timing or behavior signal.
Choose the option below that fits best. You may lightly adapt for city or month, but keep the structure intact.

Options:
1. "${signalPool[0]}"
2. "${signalPool[1]}"
3. "${signalPool[2]}"

Hard rules:
- One sentence only
- No exact day counts
- No generic phrases like "choose what suits you" or "it's up to you"
- No urgency or pressure language
- Under 25 words`;

    const resp = await openai.chat.completions.create({
      model: "gpt-4.1-nano",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 70,
    });

    return resp.choices[0].message.content ?? "";
  },
});
