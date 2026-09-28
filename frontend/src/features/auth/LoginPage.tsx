import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle } from "lucide-react";

import { AuthLayout } from "./AuthLayout";
import { useSession } from "./SessionProvider";
import { loginSchema, type LoginValues } from "./schemas";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { applyApiFieldErrors } from "@/lib/form-errors";

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useSession();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: "", password: "" },
  });

  async function onSubmit(values: LoginValues) {
    setFormError(null);
    try {
      await login(values);
      // `replace` so the back button does not return to the login form.
      navigate("/chats", { replace: true });
    } catch (error) {
      setFormError(applyApiFieldErrors(error, setError) ?? "تعذّر تسجيل الدخول.");
    }
  }

  return (
    <AuthLayout
      title="تسجيل الدخول"
      subtitle="أدخل بياناتك للمتابعة"
      footer={
        <>
          ليس لديك حساب؟{" "}
          <Link to="/register" className="font-medium text-accent hover:underline">
            أنشئ حساباً جديداً
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {formError ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2.5 text-xs font-medium text-danger"
          >
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>{formError}</span>
          </div>
        ) : null}

        <Input
          {...register("identifier")}
          label="اسم المستخدم أو البريد"
          type="text"
          autoComplete="username"
          placeholder="ahmad"
          error={errors.identifier?.message}
          disabled={isSubmitting}
        />

        <Input
          {...register("password")}
          label="كلمة المرور"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          error={errors.password?.message}
          disabled={isSubmitting}
        />

        <div className="flex justify-end">
          <Link
            to="/forgot-password"
            className="text-xs font-medium text-fg-muted transition-colors hover:text-accent"
          >
            نسيت كلمة المرور؟
          </Link>
        </div>

        <Button type="submit" fullWidth size="lg" loading={isSubmitting}>
          دخول
        </Button>
      </form>
    </AuthLayout>
  );
}
