import { AlertCircle, RefreshCw, WifiOff } from "lucide-react";

import { Button } from "./Button";
import { toErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/cn";

type ErrorStateProps = {
  /** The thrown value. Its message is shown verbatim, so backend errors are not hidden. */
  error?: unknown;
  title?: string;
  /** Omit to render no retry button, for failures a retry cannot fix. */
  onRetry?: () => void;
  isRetrying?: boolean;
  className?: string;
};

function isNetworkError(error: unknown): boolean {
  return error instanceof Error && error.name === "NetworkError";
}

/**
 * The one component for every failed request.
 *
 * It deliberately shows the backend's own message. Swallowing a server error and
 * replacing it with "something went wrong" hides real bugs from the user and from us.
 */
export function ErrorState({
  error,
  title,
  onRetry,
  isRetrying = false,
  className,
}: ErrorStateProps) {
  const offline = isNetworkError(error);
  const heading = title ?? (offline ? "لا يوجد اتصال" : "حدث خطأ");

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-10 text-center",
        className,
      )}
    >
      <span
        className={cn(
          "flex size-11 items-center justify-center rounded-full",
          offline ? "bg-warning/15 text-warning" : "bg-danger-soft text-danger",
        )}
      >
        {offline ? <WifiOff className="size-5" /> : <AlertCircle className="size-5" />}
      </span>

      <div className="space-y-1">
        <p className="text-sm font-semibold text-fg">{heading}</p>
        {error ? (
          <p className="max-w-xs text-xs leading-relaxed text-fg-muted">
            {toErrorMessage(error)}
          </p>
        ) : null}
      </div>

      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry} loading={isRetrying}>
          <RefreshCw className="size-3.5" />
          إعادة المحاولة
        </Button>
      ) : null}
    </div>
  );
}
