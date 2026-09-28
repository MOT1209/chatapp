import { forwardRef, useId } from "react";

import { cn } from "@/lib/cn";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  /** A backend or Zod message. Rendered under the field and wired up for a11y. */
  error?: string;
  /** A short hint shown when there is no error. */
  hint?: string;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, className, id, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const describedById = error || hint ? `${inputId}-description` : undefined;

  return (
    <div className="flex w-full flex-col gap-1.5">
      {label ? (
        <label htmlFor={inputId} className="text-sm font-medium text-fg">
          {label}
        </label>
      ) : null}

      <input
        ref={ref}
        id={inputId}
        // `invalid` plus aria-invalid is what screen readers announce.
        aria-invalid={error ? true : undefined}
        aria-describedby={describedById}
        className={cn(
          "h-11 w-full rounded-md border bg-surface px-3 text-sm text-fg",
          "placeholder:text-fg-subtle",
          "transition-[border-color,box-shadow] duration-150",
          "focus:outline-none focus-visible:outline-none",
          "focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/25",
          "disabled:cursor-not-allowed disabled:opacity-60",
          error ? "border-danger" : "border-border hover:border-border-strong",
          className,
        )}
        {...props}
      />

      {error ? (
        <p id={describedById} className="text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={describedById} className="text-xs text-fg-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
