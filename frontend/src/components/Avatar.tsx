import { avatarHue, initials } from "@/lib/format";
import { cn } from "@/lib/cn";

type AvatarProps = {
  name: string;
  /** Stable identifier used to derive the fallback colour. Usually the user id. */
  seed: string;
  src?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  /** Renders a small presence dot. `undefined` omits the dot entirely. */
  isOnline?: boolean;
  className?: string;
};

const SIZES = {
  xs: "size-6 text-[10px]",
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-12 text-base",
  xl: "size-24 text-2xl",
} as const;

const DOT_SIZES = {
  xs: "size-1.5",
  sm: "size-2",
  md: "size-2.5",
  lg: "size-3",
  xl: "size-4",
} as const;

export function Avatar({
  name,
  seed,
  src,
  size = "md",
  isOnline,
  className,
}: AvatarProps) {
  const hue = avatarHue(seed);

  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      {src ? (
        <img
          src={src}
          // The name is already rendered as text elsewhere, so this is decorative.
          alt=""
          className={cn(
            "rounded-full object-cover",
            SIZES[size],
            "bg-surface-2 ring-1 ring-border",
          )}
          loading="lazy"
          decoding="async"
        />
      ) : (
        // No avatar URL. Fall back to initial letters on a stable per-user colour,
        // so a user looks identical everywhere without storing anything.
        <span
          aria-hidden
          className={cn(
            "inline-flex items-center justify-center rounded-full font-semibold text-white",
            SIZES[size],
          )}
          style={{ backgroundColor: `oklch(55% 0.13 ${hue})` }}
        >
          {initials(name)}
        </span>
      )}

      {isOnline !== undefined ? (
        <span
          // Announced as text by the surrounding component, so the dot itself is hidden.
          aria-hidden
          className={cn(
            "absolute bottom-0 end-0 rounded-full ring-2 ring-surface",
            DOT_SIZES[size],
            isOnline ? "bg-success" : "bg-fg-subtle",
          )}
        />
      ) : null}
    </span>
  );
}
