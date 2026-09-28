import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { SendHorizontal } from "lucide-react";

import { useSendMessage, useTypingSignal } from "./useSendMessage";
import { Button } from "@/components/Button";
import { cn } from "@/lib/cn";

/** Beyond this the composer would eat the thread, so it scrolls internally instead. */
const MAX_TEXTAREA_HEIGHT = 160;

type MessageInputProps = {
  conversationId: string;
  /** False while the thread is still loading, to keep the composer out of the way. */
  disabled?: boolean;
};

export function MessageInput({ conversationId, disabled = false }: MessageInputProps) {
  const { send } = useSendMessage(conversationId);
  const signalTyping = useTypingSignal(conversationId);

  const [value, setValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canSend = value.trim().length > 0 && !isSending;

  /**
   * Reset when the conversation changes, during render rather than in an effect.
   *
   * Setting state in an effect here would render the composer's previous draft against
   * the new conversation for one frame. React documents adjusting state during render
   * as the correct way to react to a changed prop, and it avoids the extra pass.
   */
  const [lastConversationId, setLastConversationId] = useState(conversationId);
  if (lastConversationId !== conversationId) {
    setLastConversationId(conversationId);
    setValue("");
    setIsSending(false);
  }

  /* Grow with the content, then scroll. Writing to the DOM is a legitimate effect. */
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, [value]);

  async function handleSubmit(event?: FormEvent) {
    event?.preventDefault();
    const body = value.trim();
    if (!body || isSending) {
      return;
    }

    setIsSending(true);
    // Clear first so the composer is instantly ready for the next message.
    setValue("");
    try {
      await send(body);
    } finally {
      setIsSending(false);
      textareaRef.current?.focus();
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      // Enter sends; Shift+Enter inserts a newline. `!shiftKey` also covers IME
      // composition, where Enter confirms a candidate rather than submitting.
      if (event.nativeEvent.isComposing) {
        return;
      }
      event.preventDefault();
      void handleSubmit();
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="safe-bottom border-t border-border bg-surface p-2.5 sm:p-3"
    >
      <div
        className={cn(
          "flex items-end gap-2 rounded-xl border border-border bg-surface-2 p-1.5",
          "transition-colors focus-within:border-accent",
        )}
      >
        <label htmlFor={`composer-${conversationId}`} className="sr-only">
          اكتب رسالة
        </label>
        <textarea
          id={`composer-${conversationId}`}
          ref={textareaRef}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            if (event.target.value.trim()) {
              signalTyping();
            }
          }}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={disabled}
          placeholder={disabled ? "جارٍ تحميل المحادثة…" : "اكتب رسالة…"}
          // Enter sends and Shift+Enter adds a line, so hide the hint from mobile
          // keyboards where a physical Enter key does not exist.
          className={cn(
            "max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm leading-relaxed",
            "text-fg placeholder:text-fg-subtle focus:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-60",
          )}
        />

        <Button
          type="submit"
          size="sm"
          // Square icon button; the label is only for screen readers.
          className="size-9 shrink-0 px-0"
          disabled={!canSend}
          loading={false}
          aria-label="إرسال"
        >
          <SendHorizontal className="size-4" />
        </Button>
      </div>

      <p className="mt-1.5 hidden px-1 text-[10px] text-fg-subtle sm:block">
        Enter للإرسال · Shift + Enter لسطر جديد
      </p>
    </form>
  );
}
