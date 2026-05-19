/**
 * Operator Framework — Registry
 *
 * Static registry of all available operator templates. Provides:
 * - Template registration and discovery
 * - Metadata lookup by type or ID
 * - Version management
 *
 * Phase 8.1.2 — Operator Registry
 */

import type { OperatorTemplate, OperatorType } from "./types";

// ---------------------------------------------------------------------------
// Registry class
// ---------------------------------------------------------------------------

class OperatorRegistry {
  private templates: Map<string, OperatorTemplate> = new Map();

  /** Registers an operator template. */
  register(template: OperatorTemplate): void {
    if (this.templates.has(template.id)) {
      throw new Error(`Operator template already registered: ${template.id}`);
    }
    this.templates.set(template.id, template);
  }

  /** Returns a template by ID. */
  getById(id: string): OperatorTemplate | undefined {
    return this.templates.get(id);
  }

  /** Returns all templates of a given type. */
  getByType(type: OperatorType): OperatorTemplate[] {
    return Array.from(this.templates.values()).filter((t) => t.type === type);
  }

  /** Returns all registered templates. */
  getAll(): OperatorTemplate[] {
    return Array.from(this.templates.values());
  }

  /** Returns all official templates. */
  getOfficial(): OperatorTemplate[] {
    return Array.from(this.templates.values()).filter((t) => t.isOfficial);
  }

  /** Checks if a template exists. */
  has(id: string): boolean {
    return this.templates.has(id);
  }

  /** Returns the count of registered templates. */
  get size(): number {
    return this.templates.size;
  }
}

/** Singleton operator registry instance. */
export const operatorRegistry = new OperatorRegistry();
