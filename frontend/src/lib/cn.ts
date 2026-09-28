import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Joins class names and resolves Tailwind conflicts.
 *
 * `cn("px-2", "px-4")` returns `"px-4"` rather than both, so a component can accept a
 * `className` override without the caller having to know which utility it replaced.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
