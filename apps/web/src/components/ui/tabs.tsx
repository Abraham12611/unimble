"use client";

import { createContext, useContext, useState, useCallback } from "react";
import { cn } from "@/lib/cn";

/* ---------------------------------------------------------------------------
 * Tabs — Horizontal tab navigation following the tabBar design system spec.
 *
 * Active tab: card background, border, primary text, weight 500
 * Inactive tab: transparent, muted text, weight 400
 *
 * Inactive panels remain in the DOM (hidden) so aria-controls always resolves.
 * --------------------------------------------------------------------------- */

interface TabsContextValue {
  activeTab: string;
  setActiveTab: (id: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("Tabs components must be used within <Tabs>");
  return ctx;
}

export interface TabsProps {
  /** Default active tab ID */
  defaultValue: string;
  /** Controlled value */
  value?: string;
  /** Called when tab changes */
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}

function Tabs({ defaultValue, value, onValueChange, children, className }: TabsProps) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const activeTab = value ?? internalValue;

  const setActiveTab = useCallback(
    (id: string) => {
      if (!value) setInternalValue(id);
      onValueChange?.(id);
    },
    [value, onValueChange]
  );

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

/* ---------------------------------------------------------------------------
 * TabsList — Container for tab triggers
 * --------------------------------------------------------------------------- */

function TabsList({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      role="tablist"
      className={cn(
        "flex items-center gap-1 border-b border-[var(--border-subtle)] pb-px",
        className
      )}
    >
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * TabsTrigger — Individual tab button
 * --------------------------------------------------------------------------- */

export interface TabsTriggerProps {
  value: string;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

function TabsTrigger({ value, children, className, disabled }: TabsTriggerProps) {
  const { activeTab, setActiveTab } = useTabsContext();
  const isActive = activeTab === value;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      aria-controls={`tabpanel-${value}`}
      tabIndex={isActive ? 0 : -1}
      disabled={disabled}
      onClick={() => setActiveTab(value)}
      className={cn(
        "relative px-3.5 py-1.5 text-[13px] rounded-[10px] transition-colors duration-[120ms]",
        isActive
          ? "bg-[var(--bg-card)] border border-[var(--border-default)] font-medium text-[var(--text-primary)] shadow-[var(--shadow-card)]"
          : "border border-transparent font-normal text-[var(--text-muted)] hover:text-[var(--text-secondary)]",
        disabled && "pointer-events-none opacity-40",
        className
      )}
    >
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------------------
 * TabsContent — Panel content for a tab
 *
 * Panels stay in the DOM (hidden) so aria-controls always resolves to a
 * valid element. This follows WAI-ARIA Authoring Practices.
 * --------------------------------------------------------------------------- */

export interface TabsContentProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

function TabsContent({ value, children, className }: TabsContentProps) {
  const { activeTab } = useTabsContext();
  const isActive = activeTab === value;

  return (
    <div
      role="tabpanel"
      id={`tabpanel-${value}`}
      tabIndex={0}
      hidden={!isActive}
      className={cn("mt-4", !isActive && "hidden", className)}
    >
      {children}
    </div>
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
