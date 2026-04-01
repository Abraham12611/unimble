import posthog from "posthog-js";

export const initPostHog = () => {
  if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com",
      person_profiles: "identified_only",
      capture_pageview: false, // We'll capture manually for better control
      capture_pageleave: true,
      loaded: (posthog) => {
        if (process.env.NODE_ENV === "development") {
          // Disable in development
          posthog.opt_out_capturing();
        }
      },
    });
  }
};

export { posthog };
