import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/cn";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

/**
 * A dialog built on the native `<dialog>` element.
 *
 * Using the platform primitive means focus trapping, Escape-to-close, inertness of
 * the background and the correct ARIA semantics all come from the browser instead of
 * from hand-written key handlers.
 */
export function Modal({ open, onClose, title, description, children, className }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      // `cancel` fires on Escape, which we route through onClose like any other dismiss.
      onCancel={onClose}
      // Clicking the backdrop means clicking the <dialog> element itself, since the
      // panel below covers its content area.
      onClick={(event) => {
        if (event.target === dialogRef.current) {
          onClose();
        }
      }}
      className={cn(
        "w-[min(30rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-0",
        "text-fg shadow-lg backdrop:bg-black/45 backdrop:backdrop-blur-[2px]",
        "open:animate-fade-in",
        "m-auto",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4 border-b border-border p-4">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description ? <p className="text-xs text-fg-muted">{description}</p> : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق"
          className="-me-1 -mt-1 rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
        >
          <X className="size-4" />
        </button>
      </div>

      {children}
    </dialog>
  );
}
