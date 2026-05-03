/**
 * Phase 8 — Pre-built Operators: barrel export + registry bootstrap.
 *
 * Import this module to get the fully-populated singleton `operatorRegistry`.
 */

export * from "./types";
export * from "./base";
export { operatorRegistry } from "./registry";

export { ContentOperator, contentOperatorConfigSchema } from "./content";
export type { ContentOperatorConfig } from "./content";

export { GrowthOperator, growthOperatorConfigSchema } from "./growth";
export type { GrowthOperatorConfig } from "./growth";

export { CommunityOperator, communityOperatorConfigSchema } from "./community";
export type { CommunityOperatorConfig } from "./community";

export { FeedbackOperator, feedbackOperatorConfigSchema } from "./feedback";
export type { FeedbackOperatorConfig } from "./feedback";

export { DocumentationOperator, docsOperatorConfigSchema } from "./docs";
export type { DocsOperatorConfig } from "./docs";

// ---------------------------------------------------------------------------
// Bootstrap: register all built-in operators into the singleton registry
// ---------------------------------------------------------------------------

import { operatorRegistry } from "./registry";
import { ContentOperator } from "./content";
import { GrowthOperator } from "./growth";
import { CommunityOperator } from "./community";
import { FeedbackOperator } from "./feedback";
import { DocumentationOperator } from "./docs";

operatorRegistry.register(ContentOperator);
operatorRegistry.register(GrowthOperator);
operatorRegistry.register(CommunityOperator);
operatorRegistry.register(FeedbackOperator);
operatorRegistry.register(DocumentationOperator);
