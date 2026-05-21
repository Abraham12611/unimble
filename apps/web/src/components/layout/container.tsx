import { cn } from "@/lib/cn";

export interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Max width variant */
  size?: "sm" | "md" | "lg" | "xl" | "full";
}

const sizeClasses = {
  sm: "max-w-2xl",
  md: "max-w-4xl",
  lg: "max-w-6xl",
  xl: "max-w-7xl",
  full: "max-w-full",
} as const;

/**
 * Container — Centered content wrapper with responsive padding.
 * Default max-width is 6xl (1152px) matching the design system's 1200px page grid.
 */
function Container({ size = "lg", className, children, ...props }: ContainerProps) {
  return (
    <div className={cn("mx-auto w-full px-6", sizeClasses[size], className)} {...props}>
      {children}
    </div>
  );
}

export { Container };
