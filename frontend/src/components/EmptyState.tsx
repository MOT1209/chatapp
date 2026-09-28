import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  /** One sentence explaining what the user can do here. */
  description?: string;
  action?: ReactNode;
  className?: string;
};

/**
 * Shown when a request succeeded but returned nothing. Distinct from `ErrorState`,
 * which means the request failed. Keeping the two apart stops an empty list from
 * looking like a bug.
 */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-12 text-center",
        className,
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-surface-2 text-fg-subtle">
        <Icon className="size-6" />
      </span>

      <div className="space-y-1.5">
        <p className="text-sm font-semibold text-fg">{title}</p>
        {description ? (
          <p className="max-w-[18rem] text-xs leading-relaxed text-fg-muted">{description}</p>
        ) : null}
      </div>

      {action}
    </div>
  );
}
