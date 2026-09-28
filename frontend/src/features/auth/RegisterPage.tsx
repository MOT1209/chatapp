import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle } from "lucide-react";

import { AuthLayout } from "./AuthLayout";
import { useSession } from "./SessionProvider";
import { registerSchema, type RegisterValues } from "./schemas";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { applyApiFieldErrors } from "@/lib/form-errors";

export function RegisterPage() {
  const navigate = useNavigate();
  const { register: createAccount } = useSession();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { displayName: "", username: "", email: "", password: "", confirmPassword: "" },
  });

  async function onSubmit(values: RegisterValues) {
    setFormError(null);
    try {
      await createAccount({
        displayName: values.displayName,
        username: values.username.toLowerCase(),
        email: values.email,
        password: values.password,
      });
      void navigate("/chats", { replace: true });
    } catch (error) {
      setFormError(applyApiFieldErrors(error, setError) ?? "تعذّر إنشاء الحساب.");
    }
  }

  return (
    <AuthLayout
      title="حساب جديد"
      subtitle="أنشئ حسابك وابدأ الدردشة"
      footer={
        <>
          لديك حساب بالفعل؟{" "}
          <Link to="/login" className="font-medium text-accent hover:underline">
            سجّل الدخول
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
          {...register("displayName")}
          label="الاسم المعروض"
          type="text"
          autoComplete="name"
          placeholder="أحمد"
          error={errors.displayName?.message}
          disabled={isSubmitting}
        />

        <Input
          {...register("username")}
          label="اسم المستخدم"
          type="text"
          autoComplete="username"
          placeholder="ahmad"
          dir="ltr"
          className="text-start"
          hint="أحرف لاتينية وأرقام ونقطة وشرطة سفلية فقط"
          error={errors.username?.message}
          disabled={isSubmitting}
        />

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

        <Input
          {...register("password")}
          label="كلمة المرور"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          hint="8 أحرف على الأقل"
          error={errors.password?.message}
          disabled={isSubmitting}
        />

        <Input
          {...register("confirmPassword")}
          label="تأكيد كلمة المرور"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          error={errors.confirmPassword?.message}
          disabled={isSubmitting}
        />

        <Button type="submit" fullWidth size="lg" loading={isSubmitting}>
          إنشاء الحساب
        </Button>
      </form>
    </AuthLayout>
  );
}
