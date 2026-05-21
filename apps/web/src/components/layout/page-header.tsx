import { cn } from "@/lib/cn";

export interface PageHeaderProps {
  /** Page title */
  title: string;
  /** Optional description below the title */
  description?: string;
  /** Actions slot (buttons, etc.) rendered on the right */
  actions?: React.ReactNode;
  /** Optional breadcrumb or back link above the title */
  breadcrumb?: React.ReactNode;
  className?: string;
}

/**
 * PageHeader — Consistent page title area with optional description and actions.
 * Follows the sectionHeader design system spec.
 */
function PageHeader({ title, description, actions, breadcrumb, className }: PageHeaderProps) {
  return (
    <div className={cn("mb-6", className)}>
      {breadcrumb && <div className="mb-2">{breadcrumb}</div>}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[18px] font-medium leading-[1.3] tracking-[-0.01em] text-[var(--text-primary)]">
            {title}
          </h1>
          {description && (
            <p className="mt-1 text-[13px] text-[var(--text-secondary)]">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export { PageHeader };
