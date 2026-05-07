import { useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { track } from "../lib/track";

export default function SeoLandingPage() {
  const logEvent = useMutation(api.events.logEvent);

  useEffect(() => {
    document.title = "Should I Book My Hotel Now or Wait? — Hotel Decision";
    const ts = new Date().toISOString();
    track("page_view", { source: "seo_landing", timestamp: ts });
    logEvent({ eventType: "page_view", source: "seo_landing" }).catch(() => {});
    return () => {
      document.title = "Book Now or Wait? — Hotel Decision";
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-start py-14 px-4">
      <div className="w-full max-w-md flex flex-col gap-8">

        <div className="flex flex-col gap-3">
          <h1 className="text-2xl font-bold text-gray-900 leading-snug">
            Should I Book My Hotel Now or Wait?
          </h1>
          <p className="text-sm text-gray-500">
            A simple second opinion before you reserve.
          </p>
        </div>

        <p className="text-sm text-gray-500 leading-relaxed">
          Hotel prices can change depending on timing, demand, cancellation
          flexibility, and destination seasonality.
        </p>

        <a
          href="/"
          className="block w-full text-center py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 transition-colors"
        >
          Try the Hotel Booking Decision Helper
        </a>

      </div>
    </div>
  );
}
