import { action } from "./_generated/server";
import { v } from "convex/values";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.CONVEX_OPENAI_API_KEY,
});

export const getExplanation = action({
  args: {
    destination: v.string(),
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
    const prompt = `You are a concise travel advisor. A user is deciding whether to book a hotel.

Details:
- Destination: ${args.destination}
- Check-in: ${args.checkIn}, Check-out: ${args.checkOut} (${args.tripDays} days)
- Current price: $${args.price}
- Flexibility: ${args.flexibility}
- Urgency: ${args.urgency}
- Likes this hotel: ${args.likesHotel ? "Yes" : "No"}
- Decision score: ${args.score}
- Recommendation: ${args.decision}

Write exactly 2-3 short, practical reasons (1 sentence each) explaining why the recommendation is "${args.decision}". Be direct and specific to their situation. No bullet symbols, just plain numbered lines like "1. ...", "2. ...", "3. ...". Then on a new line write "Next step: " followed by one clear action they should take.`;

    const resp = await openai.chat.completions.create({
      model: "gpt-4.1-nano",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 200,
    });

    return resp.choices[0].message.content ?? "";
  },
});
