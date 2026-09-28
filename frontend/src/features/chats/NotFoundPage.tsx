import { Link } from "react-router";
import { Compass } from "lucide-react";

import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/Button";
import { ThemeToggle } from "@/components/ThemeToggle";

/** Shown for a URL that matches no route. */
export function NotFoundPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="flex items-center justify-between p-4">
        <Link to="/chats" className="text-sm font-semibold text-fg">
          الدردشة
        </Link>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-center justify-center">
        <EmptyState
          icon={Compass}
          title="الصفحة غير موجودة"
          description="الرابط الذي فتحته لا يقود إلى أي صفحة في التطبيق."
          action={
            <Link to="/chats">
              <Button size="sm">العودة إلى المحادثات</Button>
            </Link>
          }
        />
      </main>
    </div>
  );
}
