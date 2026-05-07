import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const logEvent = mutation({
  args: {
    eventType:     v.string(),
    verdict:       v.optional(v.string()),
    hotelName:     v.optional(v.string()),
    price:         v.optional(v.number()),
    city:          v.optional(v.string()),
    country:       v.optional(v.string()),
    checkIn:       v.optional(v.string()),
    checkOut:      v.optional(v.string()),
    flexibility:   v.optional(v.string()),
    urgency:       v.optional(v.string()),
    outboundLink:  v.optional(v.string()),
    hasHotelLink:  v.optional(v.boolean()),
    daysUntilTrip: v.optional(v.number()),
    source:        v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("appEvents", {
      ...args,
      timestamp: Date.now(),
    });
  },
});

export const listRecentEvents = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("appEvents")
      .order("desc")
      .take(100);
  },
});
