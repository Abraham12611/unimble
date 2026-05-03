/**
 * Phase 8 — Pre-built Operators: OperatorRegistry.
 *
 * Central registry for operator types. Supports:
 *   - register(type, OperatorClass, version?)
 *   - discover(type) → constructor
 *   - list() → all registered types
 *   - instantiate(type, rawConfig) → Operator instance
 */

import type { Operator } from "./base";
import type { BaseOperatorConfig } from "./types";
import type { OperatorType } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OperatorConstructor = new (rawConfig?: unknown) => Operator<any>;

interface RegistryEntry {
  type: OperatorType;
  version: string;
  displayName: string;
  description: string;
  ctor: OperatorConstructor;
  registeredAt: number;
}

export class OperatorRegistry {
  private readonly entries = new Map<OperatorType, RegistryEntry>();

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  register(ctor: OperatorConstructor): void {
    const probe = new ctor({});
    const entry: RegistryEntry = {
      type: probe.operatorType,
      version: probe.version,
      displayName: probe.displayName,
      description: probe.description,
      ctor,
      registeredAt: Date.now(),
    };
    this.entries.set(entry.type, entry);
  }

  // ---------------------------------------------------------------------------
  // Discovery
  // ---------------------------------------------------------------------------

  discover(type: OperatorType): OperatorConstructor | undefined {
    return this.entries.get(type)?.ctor;
  }

  list(): RegistryEntry[] {
    return Array.from(this.entries.values());
  }

  listByType(types: OperatorType[]): RegistryEntry[] {
    return types
      .map((t) => this.entries.get(t))
      .filter((e): e is RegistryEntry => e !== undefined);
  }

  has(type: OperatorType): boolean {
    return this.entries.has(type);
  }

  // ---------------------------------------------------------------------------
  // Instantiation helpers
  // ---------------------------------------------------------------------------

  instantiate<TConfig extends BaseOperatorConfig>(
    type: OperatorType,
    rawConfig?: unknown
  ): Operator<TConfig> {
    const ctor = this.discover(type);
    if (!ctor) {
      throw new Error(`Unknown operator type: "${type}"`);
    }
    return new ctor(rawConfig ?? {}) as Operator<TConfig>;
  }

  /**
   * Validate raw config against the operator's schema without fully
   * instantiating. Calls getConfig() to trigger lazy Zod parse, so
   * invalid configs throw and are caught here.
   */
  validateConfig(
    type: OperatorType,
    rawConfig: unknown
  ): { success: true } | { success: false; error: string } {
    const ctor = this.discover(type);
    if (!ctor) {
      return { success: false, error: `Unknown operator type: "${type}"` };
    }
    try {
      const instance = new ctor(rawConfig);
      instance.getConfig(); // trigger lazy Zod parse
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Module-level singleton — populated in index.ts
// ---------------------------------------------------------------------------

export const operatorRegistry = new OperatorRegistry();
