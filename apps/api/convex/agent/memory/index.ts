/**
 * Agent Runtime — Memory System (Phase 7.4)
 *
 * Barrel export for all memory-related modules.
 */

// Short-term memory (conversation context)
export { ShortTermMemory, estimateTokenCount, wouldExceedBudget } from "./shortTermMemory";
export type { ShortTermMemoryConfig, ContextWindowStatus, PruneResult } from "./shortTermMemory";

// Memory categories
export {
  MEMORY_CATEGORIES,
  getCategory,
  getAllCategories,
  getCategoriesForScope,
  isValidCategory,
  calculateDecayFactor,
  calculateEffectiveImportance,
} from "./memoryCategories";
export type { MemoryCategoryDef, MemoryCategoryId } from "./memoryCategories";

// Memory injection
export { injectMemories, DEFAULT_INJECTION_CONFIG } from "./memoryInjector";
export type { MemoryInjectionConfig, ScoredMemory, InjectionResult } from "./memoryInjector";
