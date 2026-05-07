// Lightweight event tracking wrapper — wire to any analytics provider later.
// Drop-in replacement: swap the console.log body for window.gtag / posthog / etc.

type TrackEvent =
  | "page_view"
  | "start_decision"
  | "destination_entered"
  | "hotel_link_entered"
  | "result_generated"
  | "check_price_clicked"
  | "drop_off_before_result";

export function track(event: TrackEvent, props?: Record<string, unknown>): void {
  try {
    console.log("[track]", event, props ?? {});
    // TODO: replace with real analytics call, e.g.:
    // window.gtag?.("event", event, props);
    // posthog?.capture(event, props);
  } catch {
    // never throw — tracking must not break the app
  }
}
