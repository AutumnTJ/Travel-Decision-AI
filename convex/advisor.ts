import { action } from "./_generated/server";
import { v } from "convex/values";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.CONVEX_OPENAI_API_KEY,
});

export const getExplanation = action({
  args: {
    country: v.string(),
    city: v.string(),
    budget: v.string(),
    travelTiming: v.string(),
    checkIn: v.string(),
    checkOut: v.string(),
    price: v.number(),
    flexibility: v.string(),
    urgency: v.string(),
    likesHotel: v.boolean(),
    score: v.number(),
    decision: v.string(),
    tripDays: v.number(),
  },
  handler: async (ctx, args) => {
    const prompt = `You are a calm travel advisor for international travelers during peak and high-demand periods.

Context:
- Destination: ${args.city}, ${args.country}
- Budget: ${args.budget}
- Travel timing: ${args.travelTiming}
- Check-in: ${args.checkIn}, Check-out: ${args.checkOut} (${args.tripDays} days)
- Price: $${args.price}/night
- Flexibility: ${args.flexibility}
- Urgency: ${args.urgency}
- Likes this hotel: ${args.likesHotel ? "Yes" : "No"}
- Recommendation: ${args.decision}

Write exactly 3 lines. No labels, no bullet points, no extra text — just the 3 lines.

Line 1 — Decision: One soft, actionable sentence. Use language like "It may be a good time to book." or "You might consider waiting a little longer." Never use "you should", "will", or absolute claims.
Line 2 — Reason: One or two short sentences. Reference high-demand signals relevant to the destination and timing (e.g. peak season, limited availability, price trends). Use "may", "could", "appears" — never "will". Keep it observational, not alarming.
Line 3 — Soft note (optional): One calm sentence like "You can check again later if you're unsure." or "No rush — this is just a quick signal." Omit this line entirely if nothing useful to add.

Total output: under 45 words. Calm, observational, no pressure.`;

    const resp = await openai.chat.completions.create({
      model: "gpt-4.1-nano",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 120,
    });

    return resp.choices[0].message.content ?? "";
  },
});
