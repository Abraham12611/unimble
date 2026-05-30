import posthog from "posthog-js";

posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
  api_host: "/ingest",
  ui_host: "https://us.posthog.com",
  defaults: "2026-01-30",
  person_profiles: "identified_only",
  capture_pageview: false,
  capture_pageleave: true,
  loaded: (ph) => {
    if (process.env.NODE_ENV === "development") {
      ph.opt_out_capturing();
    }
  },
});
