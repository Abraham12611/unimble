import Image from "next/image";
import { cn } from "@/lib/cn";

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Image source URL */
  src?: string | null;
  /** Alt text for the image */
  alt?: string;
  /** Fallback initials (e.g., "JD") */
  fallback?: string;
  /** Size variant */
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "h-6 w-6 text-[10px]",
  md: "h-8 w-8 text-[12px]",
  lg: "h-10 w-10 text-[14px]",
} as const;

/**
 * Avatar — User/entity avatar with image or initials fallback.
 */
function Avatar({ src, alt, fallback, size = "md", className, ...props }: AvatarProps) {
  const initials = fallback || alt?.charAt(0)?.toUpperCase() || "?";

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full",
        "bg-[var(--bg-card-hover)] border border-[var(--border-subtle)]",
        sizeClasses[size],
        className
      )}
      role="img"
      aria-label={alt || "Avatar"}
      {...props}
    >
      {src ? (
        <Image
          src={src}
          alt=""
          fill
          className="object-cover"
          sizes={size === "sm" ? "24px" : size === "md" ? "32px" : "40px"}
        />
      ) : (
        <span className="font-medium text-[var(--text-secondary)]">{initials}</span>
      )}
    </div>
  );
}

export { Avatar };
