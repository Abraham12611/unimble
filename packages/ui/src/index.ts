/**
 * @unimble/ui - Shared UI components
 * This package contains reusable UI components built with shadcn/ui
 * for use across the Unimble monorepo.
 * @packageDocumentation
 */

/**
 * Button variant types
 */
export type ButtonVariant = "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";

/**
 * Button size types
 */
export type ButtonSize = "default" | "sm" | "lg" | "icon";

/**
 * Common component props for styling
 */
export interface StyleProps {
  /** Additional CSS class names */
  className?: string;
  /** Inline styles */
  style?: Record<string, string | number>;
}

/**
 * Props for components that can be disabled
 */
export interface DisableableProps {
  /** Whether the component is disabled */
  disabled?: boolean;
}

/**
 * Props for components with loading state
 */
export interface LoadingProps {
  /** Whether the component is in loading state */
  loading?: boolean;
}
