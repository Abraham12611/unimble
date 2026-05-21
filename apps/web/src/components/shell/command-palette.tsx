"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  MagnifyingGlass,
  House,
  Robot,
  GitBranch,
  Play,
  Plugs,
  ChartBar,
  Gear,
  Brain,
  Plus,
  ArrowRight,
} from "@phosphor-icons/react";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { useWorkspaceContext } from "@/lib/workspace-context";
import { overlay } from "@/lib/motion";

/* ---------------------------------------------------------------------------
 * Types
 * --------------------------------------------------------------------------- */

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: PhosphorIcon;
  category: "navigation" | "actions" | "recent";
  action: () => void;
  shortcut?: string;
}

/* ---------------------------------------------------------------------------
 * Command Palette — Cmd+K search dialog
 *
 * Features:
 * - Fuzzy search across navigation, actions, and recent items
 * - Keyboard navigation (ArrowUp/Down, Enter, Escape)
 * - Categories with section headers
 * - Animated entrance/exit
 * --------------------------------------------------------------------------- */

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { slug } = useWorkspaceContext();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Build command items
  const commands: CommandItem[] = useMemo(() => {
    const nav = (href: string) => () => {
      router.push(`/w/${slug}/${href}`);
      onCloseRef.current();
    };

    return [
      // Navigation
      {
        id: "nav-home",
        label: "Go to Home",
        icon: House,
        category: "navigation",
        action: nav("dashboard"),
        shortcut: "G H",
      },
      {
        id: "nav-operators",
        label: "Go to Operators",
        icon: Robot,
        category: "navigation",
        action: nav("operators"),
        shortcut: "G O",
      },
      {
        id: "nav-workflows",
        label: "Go to Workflows",
        icon: GitBranch,
        category: "navigation",
        action: nav("workflows"),
        shortcut: "G W",
      },
      {
        id: "nav-executions",
        label: "Go to Executions",
        icon: Play,
        category: "navigation",
        action: nav("executions"),
        shortcut: "G E",
      },
      {
        id: "nav-integrations",
        label: "Go to Integrations",
        icon: Plugs,
        category: "navigation",
        action: nav("integrations"),
        shortcut: "G I",
      },
      {
        id: "nav-analytics",
        label: "Go to Analytics",
        icon: ChartBar,
        category: "navigation",
        action: nav("analytics"),
        shortcut: "G A",
      },
      {
        id: "nav-settings",
        label: "Go to Settings",
        icon: Gear,
        category: "navigation",
        action: nav("settings"),
        shortcut: "G S",
      },
      {
        id: "nav-learning",
        label: "Go to Learning",
        icon: Brain,
        category: "navigation",
        action: nav("learning"),
        shortcut: "G L",
      },
      // Actions
      {
        id: "act-deploy",
        label: "Deploy new operator",
        description: "Choose a template and configure",
        icon: Plus,
        category: "actions",
        action: nav("operators/deploy"),
      },
      {
        id: "act-run",
        label: "Run operator now",
        description: "Trigger an immediate execution",
        icon: Play,
        category: "actions",
        action: nav("operators"),
      },
    ];
  }, [slug, router]);

  // Filter commands by query
  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(q) ||
        cmd.description?.toLowerCase().includes(q) ||
        cmd.category.includes(q)
    );
  }, [commands, query]);

  // Group by category
  const grouped = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {};
    for (const item of filtered) {
      if (!groups[item.category]) groups[item.category] = [];
      groups[item.category].push(item);
    }
    return groups;
  }, [filtered]);

  // Flat list for keyboard navigation (alias for readability)
  const flatItems = filtered;

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      // Focus input after animation
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll("[data-cmd-item]");
    items[selectedIndex]?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, flatItems.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (flatItems[selectedIndex]) {
            flatItems[selectedIndex].action();
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [flatItems, selectedIndex, onClose]
  );

  const categoryLabels: Record<string, string> = {
    navigation: "Navigation",
    actions: "Actions",
    recent: "Recent",
  };

  let itemIndex = -1;

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
          {/* Overlay */}
          <motion.div
            className="absolute inset-0 bg-[var(--bg-overlay)]"
            variants={overlay}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Palette */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            className="relative w-full max-w-lg rounded-[14px] border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-[var(--shadow-popup)] overflow-hidden"
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{
              opacity: 1,
              scale: 1,
              y: 0,
              transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] },
            }}
            exit={{ opacity: 0, scale: 0.96, y: -8, transition: { duration: 0.12 } }}
            onKeyDown={handleKeyDown}
          >
            {/* Search input */}
            <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-4 py-3">
              <MagnifyingGlass size={18} className="shrink-0 text-[var(--text-muted)]" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type a command or search…"
                className="flex-1 bg-transparent text-[14px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                aria-label="Search commands"
              />
              <kbd className="rounded border border-[var(--border-subtle)] bg-[var(--bg-card)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
                ESC
              </kbd>
            </div>

            {/* Results */}
            <div ref={listRef} className="max-h-[320px] overflow-y-auto p-2">
              {flatItems.length === 0 ? (
                <div className="px-3 py-8 text-center text-[13px] text-[var(--text-muted)]">
                  No results found for &ldquo;{query}&rdquo;
                </div>
              ) : (
                Object.entries(grouped).map(([category, items]) => (
                  <div key={category} className="mb-2 last:mb-0">
                    <div className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.04em] text-[var(--text-muted)]">
                      {categoryLabels[category] || category}
                    </div>
                    {items.map((item) => {
                      itemIndex++;
                      const isSelected = itemIndex === selectedIndex;
                      const currentIndex = itemIndex;
                      const Icon = item.icon;

                      return (
                        <button
                          key={item.id}
                          type="button"
                          data-cmd-item
                          onClick={() => item.action()}
                          onMouseEnter={() => setSelectedIndex(currentIndex)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-[6px] px-3 py-2 text-left transition-colors",
                            isSelected
                              ? "bg-[var(--bg-card-hover)] text-[var(--text-primary)]"
                              : "text-[var(--text-secondary)]"
                          )}
                        >
                          <Icon size={16} className="shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] truncate">{item.label}</div>
                            {item.description && (
                              <div className="text-[11px] text-[var(--text-muted)] truncate">
                                {item.description}
                              </div>
                            )}
                          </div>
                          {item.shortcut && (
                            <kbd className="shrink-0 rounded border border-[var(--border-subtle)] bg-[var(--bg-card)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
                              {item.shortcut}
                            </kbd>
                          )}
                          {isSelected && (
                            <ArrowRight size={12} className="shrink-0 text-[var(--text-muted)]" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-[var(--border-subtle)] px-4 py-2 text-[11px] text-[var(--text-muted)]">
              <div className="flex items-center gap-3">
                <span>↑↓ Navigate</span>
                <span>↵ Select</span>
                <span>Esc Close</span>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
