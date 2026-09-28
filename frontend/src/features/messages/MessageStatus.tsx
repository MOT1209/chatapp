import { AlertCircle, Check, CheckCheck, RotateCcw } from "lucide-react";

import { cn } from "@/lib/cn";
import type { MessageDelivery } from "@/lib/types";

type MessageStatusProps = {
  delivery: MessageDelivery;
  onRetry?: () => void;
};

const LABELS: Record<MessageDelivery, string> = {
  pending: "جارٍ الإرسال",
  sent: "تم الإرسال",
  read: "تمت القراءة",
  failed: "فشل الإرسال",
};

/**
 * The ticks beside an outgoing message.
 *
 * Four states, matching the contract's §5.4 table. The failed state is the important
 * one: it stays on screen with a retry button, so a message the user watched appear
 * is never lost without explanation.
 */
export function MessageStatus({ delivery, onRetry }: MessageStatusProps) {
  if (delivery === "failed") {
    return (
      <span className="flex items-center gap-1 text-danger">
        <AlertCircle className="size-3.5" aria-hidden />
        <span className="text-[10px] font-medium">{LABELS.failed}</span>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="rounded p-0.5 text-danger transition-colors hover:bg-danger/10"
            aria-label="إعادة إرسال الرسالة"
            title="إعادة الإرسال"
          >
            <RotateCcw className="size-3" />
          </button>
        ) : null}
        <span className="sr-only">{LABELS.failed}</span>
      </span>
    );
  }

  if (delivery === "pending") {
    return (
      <span className="text-fg-subtle" title={LABELS.pending}>
        <Check className="size-3.5" aria-hidden />
        <span className="sr-only">{LABELS.pending}</span>
      </span>
    );
  }

  return (
    <span
      className={cn(delivery === "read" ? "text-accent" : "text-fg-subtle")}
      title={LABELS[delivery]}
    >
      <CheckCheck className="size-3.5" aria-hidden />
      <span className="sr-only">{LABELS[delivery]}</span>
    </span>
  );
}
