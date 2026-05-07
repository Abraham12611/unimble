"use node";

/**
 * Analytics Abstraction Layer
 *
 * Provides a unified interface for reading analytics data across
 * Google Analytics, Plausible, Mixpanel, and PostHog via Composio.
 *
 * Operators use these functions to fetch traffic data, event metrics,
 * and content performance insights with a consistent API.
 *
 * All analytics operations are read-only — no data is written to
 * external analytics platforms.
 */

import type { IntegrationActionResult } from "./types";
import { createComposioSession } from "../composio";

// ---------------------------------------------------------------------------
// Analytics-specific types
// ---------------------------------------------------------------------------

/** Time range for analytics queries. */
export interface AnalyticsDateRange {
  /** ISO date string (YYYY-MM-DD) */
  startDate: string;
  /** ISO date string (YYYY-MM-DD) */
  endDate: string;
}

/** A single metric data point. */
export interface MetricDataPoint {
  /** Date or period label */
  date: string;
  /** Metric value */
  value: number;
}

/** Traffic overview for a site/property. */
export interface TrafficOverview {
  /** Total page views in the period */
  pageViews: number;
  /** Unique visitors */
  uniqueVisitors: number;
  /** Average session duration in seconds */
  avgSessionDuration?: number;
  /** Bounce rate (0-1) */
  bounceRate?: number;
  /** Top pages by views */
  topPages?: PageMetric[];
  /** Top referrers */
  topReferrers?: ReferrerMetric[];
  /** Daily breakdown */
  daily?: MetricDataPoint[];
}

/** Page-level metric. */
export interface PageMetric {
  /** Page path or URL */
  path: string;
  /** Page title */
  title?: string;
  /** View count */
  views: number;
  /** Unique visitor count */
  uniqueVisitors?: number;
  /** Average time on page in seconds */
  avgTimeOnPage?: number;
}

/** Referrer-level metric. */
export interface ReferrerMetric {
  /** Referrer source */
  source: string;
  /** Visit count from this referrer */
  visits: number;
  /** Percentage of total traffic */
  percentage?: number;
}

/** Content performance data for a specific URL. */
export interface ContentPerformance {
  /** The content URL or path */
  url: string;
  /** Page views */
  pageViews: number;
  /** Unique visitors */
  uniqueVisitors: number;
  /** Average time on page in seconds */
  avgTimeOnPage?: number;
  /** Bounce rate (0-1) */
  bounceRate?: number;
  /** Scroll depth percentage */
  scrollDepth?: number;
  /** Social shares (if tracked) */
  socialShares?: number;
}

// ---------------------------------------------------------------------------
// Supported analytics toolkits
// ---------------------------------------------------------------------------

export const ANALYTICS_TOOLKITS = ["google_analytics", "plausible", "mixpanel", "posthog"] as const;

export type AnalyticsToolkit = (typeof ANALYTICS_TOOLKITS)[number];

/** Composio action names mapped per analytics toolkit. */
const ANALYTICS_ACTIONS: Record<
  AnalyticsToolkit,
  {
    getTraffic: string;
    getTopPages: string;
    getTopReferrers: string;
    getPageMetrics?: string;
  }
> = {
  google_analytics: {
    getTraffic: "GOOGLE_ANALYTICS_GET_REPORT",
    getTopPages: "GOOGLE_ANALYTICS_GET_REPORT",
    getTopReferrers: "GOOGLE_ANALYTICS_GET_REPORT",
    getPageMetrics: "GOOGLE_ANALYTICS_GET_REPORT",
  },
  plausible: {
    getTraffic: "PLAUSIBLE_GET_STATS",
    getTopPages: "PLAUSIBLE_GET_BREAKDOWN",
    getTopReferrers: "PLAUSIBLE_GET_BREAKDOWN",
  },
  mixpanel: {
    getTraffic: "MIXPANEL_QUERY_EVENTS",
    getTopPages: "MIXPANEL_QUERY_EVENTS",
    getTopReferrers: "MIXPANEL_QUERY_EVENTS",
  },
  posthog: {
    getTraffic: "POSTHOG_GET_INSIGHTS",
    getTopPages: "POSTHOG_GET_INSIGHTS",
    getTopReferrers: "POSTHOG_GET_INSIGHTS",
  },
};

// ---------------------------------------------------------------------------
// Analytics abstraction functions
// ---------------------------------------------------------------------------

/**
 * Gets a traffic overview for the specified date range.
 */
export async function analyticsGetTraffic(
  workspaceId: string,
  toolkit: AnalyticsToolkit,
  dateRange: AnalyticsDateRange,
  siteId?: string
): Promise<IntegrationActionResult<TrafficOverview>> {
  try {
    const session = await createComposioSession(workspaceId, [toolkit]);
    const actionName = ANALYTICS_ACTIONS[toolkit].getTraffic;

    const result = await session.execute(actionName, {
      start_date: dateRange.startDate,
      end_date: dateRange.endDate,
      ...(siteId ? { site_id: siteId, property_id: siteId } : {}),
      metrics: "pageviews,visitors,visit_duration,bounce_rate",
    });

    return {
      ok: true,
      data: normalizeTrafficResponse(toolkit, result),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Gets top pages by views for the specified date range.
 */
export async function analyticsGetTopPages(
  workspaceId: string,
  toolkit: AnalyticsToolkit,
  dateRange: AnalyticsDateRange,
  limit?: number,
  siteId?: string
): Promise<IntegrationActionResult<PageMetric[]>> {
  try {
    const session = await createComposioSession(workspaceId, [toolkit]);
    const actionName = ANALYTICS_ACTIONS[toolkit].getTopPages;

    const result = await session.execute(actionName, {
      start_date: dateRange.startDate,
      end_date: dateRange.endDate,
      ...(siteId ? { site_id: siteId, property_id: siteId } : {}),
      property: "event:page",
      dimension: "page",
      metrics: "pageviews,visitors",
      limit: limit ?? 10,
    });

    return {
      ok: true,
      data: normalizeTopPagesResponse(toolkit, result),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Gets top referrers for the specified date range.
 */
export async function analyticsGetTopReferrers(
  workspaceId: string,
  toolkit: AnalyticsToolkit,
  dateRange: AnalyticsDateRange,
  limit?: number,
  siteId?: string
): Promise<IntegrationActionResult<ReferrerMetric[]>> {
  try {
    const session = await createComposioSession(workspaceId, [toolkit]);
    const actionName = ANALYTICS_ACTIONS[toolkit].getTopReferrers;

    const result = await session.execute(actionName, {
      start_date: dateRange.startDate,
      end_date: dateRange.endDate,
      ...(siteId ? { site_id: siteId, property_id: siteId } : {}),
      property: "visit:source",
      dimension: "source",
      metrics: "visitors",
      limit: limit ?? 10,
    });

    return {
      ok: true,
      data: normalizeReferrersResponse(toolkit, result),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Gets performance metrics for a specific content URL.
 */
export async function analyticsGetContentPerformance(
  workspaceId: string,
  toolkit: AnalyticsToolkit,
  contentUrl: string,
  dateRange: AnalyticsDateRange,
  siteId?: string
): Promise<IntegrationActionResult<ContentPerformance>> {
  try {
    const actionName = ANALYTICS_ACTIONS[toolkit].getPageMetrics;
    if (!actionName) {
      return {
        ok: false,
        error: `Page-level metrics not supported for ${toolkit}`,
      };
    }

    const session = await createComposioSession(workspaceId, [toolkit]);

    const result = await session.execute(actionName, {
      start_date: dateRange.startDate,
      end_date: dateRange.endDate,
      ...(siteId ? { site_id: siteId, property_id: siteId } : {}),
      page: contentUrl,
      filters: `page==${contentUrl}`,
      metrics: "pageviews,visitors,avg_time_on_page,bounce_rate",
    });

    return {
      ok: true,
      data: normalizeContentPerformanceResponse(toolkit, result, contentUrl),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ---------------------------------------------------------------------------
// Response normalization
// ---------------------------------------------------------------------------

function normalizeTrafficResponse(
  _toolkit: AnalyticsToolkit,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw: any
): TrafficOverview {
  const data = raw?.data ?? raw?.results ?? raw ?? {};

  // Handle array responses (some providers return arrays)
  const summary = Array.isArray(data) ? (data[0] ?? {}) : data;

  return {
    pageViews: Number(summary.pageviews ?? summary.screenPageViews ?? summary.page_views ?? 0),
    uniqueVisitors: Number(summary.visitors ?? summary.totalUsers ?? summary.unique_visitors ?? 0),
    avgSessionDuration: summary.visit_duration
      ? Number(summary.visit_duration)
      : summary.averageSessionDuration
        ? Number(summary.averageSessionDuration)
        : undefined,
    bounceRate: summary.bounce_rate
      ? Number(summary.bounce_rate) / 100
      : summary.bounceRate
        ? Number(summary.bounceRate)
        : undefined,
  };
}

function normalizeTopPagesResponse(
  _toolkit: AnalyticsToolkit,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw: any
): PageMetric[] {
  const items = raw?.results ?? raw?.data ?? raw ?? [];
  if (!Array.isArray(items)) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return items.map((item: any) => ({
    path: String(item.page ?? item.pagePath ?? item.url ?? ""),
    title: item.pageTitle ?? item.title ?? undefined,
    views: Number(item.pageviews ?? item.views ?? item.count ?? 0),
    uniqueVisitors: item.visitors ? Number(item.visitors) : undefined,
    avgTimeOnPage: item.time_on_page ? Number(item.time_on_page) : undefined,
  }));
}

function normalizeReferrersResponse(
  _toolkit: AnalyticsToolkit,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw: any
): ReferrerMetric[] {
  const items = raw?.results ?? raw?.data ?? raw ?? [];
  if (!Array.isArray(items)) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return items.map((item: any) => ({
    source: String(item.source ?? item.referrer ?? item.channel ?? ""),
    visits: Number(item.visitors ?? item.visits ?? item.count ?? 0),
    percentage: item.percentage ? Number(item.percentage) : undefined,
  }));
}

function normalizeContentPerformanceResponse(
  _toolkit: AnalyticsToolkit,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw: any,
  contentUrl: string
): ContentPerformance {
  const data = raw?.data ?? raw?.results ?? raw ?? {};
  const summary = Array.isArray(data) ? (data[0] ?? {}) : data;

  return {
    url: contentUrl,
    pageViews: Number(summary.pageviews ?? summary.page_views ?? summary.views ?? 0),
    uniqueVisitors: Number(summary.visitors ?? summary.unique_visitors ?? 0),
    avgTimeOnPage: summary.time_on_page
      ? Number(summary.time_on_page)
      : summary.avg_time_on_page
        ? Number(summary.avg_time_on_page)
        : undefined,
    bounceRate: summary.bounce_rate ? Number(summary.bounce_rate) / 100 : undefined,
  };
}
