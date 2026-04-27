/**
 * Integration abstraction layers — barrel export.
 *
 * Re-exports all category-specific types and functions so operators
 * can import from a single path:
 *
 *   import { cmsCreatePost, socialCreatePost } from "./lib/integrations";
 */

// Shared types
export type {
  IntegrationActionResult,
  ContentItem,
  PaginationParams,
  PaginatedResult,
} from "./types";

// CMS
export type { CmsPost, CreatePostInput, UpdatePostInput, CmsToolkit } from "./cms";
export {
  CMS_TOOLKITS,
  cmsCreatePost,
  cmsUpdatePost,
  cmsDeletePost,
  cmsGetPost,
  cmsListPosts,
} from "./cms";

// Social Media
export type {
  SocialPost,
  CreateSocialPostInput,
  ReplyToPostInput,
  EngagementData,
  SocialToolkit,
} from "./social";
export {
  SOCIAL_TOOLKITS,
  socialCreatePost,
  socialReplyToPost,
  socialDeletePost,
  socialGetEngagement,
} from "./social";

// Developer Platforms
export type {
  DevIssue,
  CreateIssueInput,
  DevPullRequest,
  DevRepository,
  DevPlatformToolkit,
} from "./devplatform";
export {
  DEV_PLATFORM_TOOLKITS,
  devCreateIssue,
  devListIssues,
  devCloseIssue,
  devListRepos,
} from "./devplatform";

// Analytics
export type {
  AnalyticsDateRange,
  MetricDataPoint,
  TrafficOverview,
  PageMetric,
  ReferrerMetric,
  ContentPerformance,
  AnalyticsToolkit,
} from "./analytics";
export {
  ANALYTICS_TOOLKITS,
  analyticsGetTraffic,
  analyticsGetTopPages,
  analyticsGetTopReferrers,
  analyticsGetContentPerformance,
} from "./analytics";
