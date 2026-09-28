import { useState } from "react";
import { Link } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, MailCheck } from "lucide-react";

import { AuthLayout } from "./AuthLayout";
import { forgotPasswordSchema, type ForgotPasswordValues } from "./schemas";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { authApi } from "@/lib/api";
import { applyApiFieldErrors } from "@/lib/form-errors";

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: ForgotPasswordValues) {
    setFormError(null);
    try {
      await authApi.forgotPassword(values.email);
      setSent(true);
    } catch (error) {
      setFormError(applyApiFieldErrors(error, setError) ?? "تعذّر إرسال الطلب.");
    }
  }

  /* The contract returns 202 whether or not the address exists, so this screen must
     not reveal which case occurred. */
  if (sent) {
    return (
      <AuthLayout title="تحقق من بريدك" subtitle="أرسلنا رابط إعادة التعيين إن كان البريد مسجّلاً لدينا">
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent">
            <MailCheck className="size-6" />
          </span>
          <p className="text-sm text-fg-muted">
            إن كان البريد{" "}
            <span dir="ltr" className="font-medium text-fg">
              {getValues("email")}
            </span>{" "}
            مسجّلاً لدينا، فسيصلك رابط إعادة التعيين خلال دقائق.
          </p>
          <Button variant="secondary" fullWidth onClick={() => setSent(false)}>
            إرسال إلى بريد آخر
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="استعادة كلمة المرور"
      subtitle="أدخل بريدك الإلكتروني وسنرسل لك رابطاً"
      footer={
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 font-medium text-fg-muted transition-colors hover:text-accent"
        >
          <ArrowRight className="size-3.5" />
          العودة لتسجيل الدخول
        </Link>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {formError ? (
          <p role="alert" className="rounded-md bg-danger-soft px-3 py-2.5 text-xs font-medium text-danger">
            {formError}
          </p>
        ) : null}

        <Input
          {...register("email")}
          label="البريد الإلكتروني"
          type="email"
          autoComplete="email"
          placeholder="ahmad@example.com"
          dir="ltr"
          className="text-start"
          error={errors.email?.message}
          disabled={isSubmitting}
        />

        <Button type="submit" fullWidth size="lg" loading={isSubmitting}>
          إرسال الرابط
        </Button>
      </form>
    </AuthLayout>
  );
}
