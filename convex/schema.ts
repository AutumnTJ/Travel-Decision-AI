import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

const applicationTables = {
  appEvents: defineTable({
    eventType:    v.string(),
    timestamp:    v.number(),
    verdict:      v.optional(v.string()),
    hotelName:    v.optional(v.string()),
    price:        v.optional(v.number()),
    city:         v.optional(v.string()),
    country:      v.optional(v.string()),
    checkIn:      v.optional(v.string()),
    checkOut:     v.optional(v.string()),
    flexibility:  v.optional(v.string()),
    urgency:      v.optional(v.string()),
    outboundLink: v.optional(v.string()),
    hasHotelLink: v.optional(v.boolean()),
    daysUntilTrip: v.optional(v.number()),
    source: v.optional(v.string()),
  }),
};

export default defineSchema({
  ...authTables,
  ...applicationTables,
});
