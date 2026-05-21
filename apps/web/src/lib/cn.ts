import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind classes with clsx for conditional class composition.
 * Handles conflicts (e.g., `bg-red-500 bg-blue-500` → keeps last).
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
