import { forwardRef } from "react";
import { cn } from "@/lib/cn";

/* ---------------------------------------------------------------------------
 * Card — Base container with design system styling
 * --------------------------------------------------------------------------- */

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Add hover effect */
  hoverable?: boolean;
  /** Remove padding */
  noPadding?: boolean;
}

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, hoverable, noPadding, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-card)]",
          "shadow-[var(--shadow-card)]",
          !noPadding && "p-5",
          hoverable &&
            "transition-all duration-[200ms] hover:bg-[var(--bg-card-hover)] hover:shadow-[var(--shadow-card-hover)]",
          className
        )}
        {...props}
      />
    );
  }
);
Card.displayName = "Card";

/* ---------------------------------------------------------------------------
 * Card Header
 * --------------------------------------------------------------------------- */

const CardHeader = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex items-center justify-between gap-3", className)}
      {...props}
    />
  )
);
CardHeader.displayName = "CardHeader";

/* ---------------------------------------------------------------------------
 * Card Title
 * --------------------------------------------------------------------------- */

const CardTitle = forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn("text-[15px] font-medium text-[var(--text-primary)]", className)}
      {...props}
    />
  )
);
CardTitle.displayName = "CardTitle";

/* ---------------------------------------------------------------------------
 * Card Description
 * --------------------------------------------------------------------------- */

const CardDescription = forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("text-[12px] text-[var(--text-secondary)]", className)} {...props} />
));
CardDescription.displayName = "CardDescription";

/* ---------------------------------------------------------------------------
 * Card Content
 * --------------------------------------------------------------------------- */

const CardContent = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("mt-3", className)} {...props} />
);
CardContent.displayName = "CardContent";

/* ---------------------------------------------------------------------------
 * Card Footer
 * --------------------------------------------------------------------------- */

const CardFooter = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "mt-4 flex items-center gap-2 border-t border-[var(--border-subtle)] pt-4",
        className
      )}
      {...props}
    />
  )
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
