import type { ReactNode } from "react";
import { Link } from "react-router";
import { MessageCircle } from "lucide-react";

import { ThemeToggle } from "@/components/ThemeToggle";

type AuthLayoutProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
};

/**
 * Shared shell for the three authentication screens.
 *
 * Single column, centred, and deliberately narrow. A sign-in form is a single task;
 * anything wider or denser only slows it down.
 */
export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <div className="relative flex min-h-dvh flex-col bg-bg">
      <header className="flex items-center justify-between p-4">
        <Link
          to="/login"
          className="flex items-center gap-2 text-fg transition-opacity hover:opacity-80"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-fg">
            <MessageCircle className="size-4.5" />
          </span>
          <span className="text-sm font-semibold">الدردشة</span>
        </Link>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm animate-slide-up">
          <div className="mb-7 text-center">
            <h1 className="text-xl font-bold tracking-tight text-fg">{title}</h1>
            {subtitle ? <p className="mt-1.5 text-sm text-fg-muted">{subtitle}</p> : null}
          </div>

          <div className="rounded-xl border border-border bg-surface p-5 shadow-sm sm:p-6">
            {children}
          </div>

          {footer ? <div className="mt-5 text-center text-sm text-fg-muted">{footer}</div> : null}
        </div>
      </main>
    </div>
  );
}
