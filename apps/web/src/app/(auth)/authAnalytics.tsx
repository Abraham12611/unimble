"use client";

import { useEffect } from "react";
import { posthog } from "@/lib/posthog";

export function AuthAnalytics({ event }: { event: string }) {
  useEffect(() => {
    posthog?.capture(event);
  }, [event]);

  return null;
}
