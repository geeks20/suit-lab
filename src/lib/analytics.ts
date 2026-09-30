export type AnalyticsEvent =
  | "model_creation_started"
  | "model_creation_completed"
  | "garment_selected"
  | "look_generation_started"
  | "look_generation_completed"
  | "look_generation_failed"
  | "look_saved"
  | "look_exported"
  | "ai_stylist_opened"
  | "ai_stylist_recommendation_generated"
  | "ai_stylist_look_generated";

/** Props must be small scalars. Never pass images, photos or free text from users. */
export type AnalyticsProps = Record<string, string | number | boolean | null | undefined>;

export interface AnalyticsSink {
  track(event: AnalyticsEvent, props: AnalyticsProps): void;
}

const consoleSink: AnalyticsSink = {
  track(event, props) {
    if (process.env.NODE_ENV !== "production") console.debug("[analytics]", event, props);
  },
};

let sink: AnalyticsSink = consoleSink;
const listeners = new Set<(event: AnalyticsEvent, props: AnalyticsProps) => void>();

/** Swap in a real provider (PostHog, Segment, ...) at app start. */
export function setAnalyticsSink(next: AnalyticsSink) {
  sink = next;
}

/** Test hook. */
export function onAnalytics(fn: (event: AnalyticsEvent, props: AnalyticsProps) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function track(event: AnalyticsEvent, props: AnalyticsProps = {}) {
  try {
    sink.track(event, props);
    listeners.forEach((fn) => fn(event, props));
  } catch {
    // Analytics must never break the product.
  }
}
