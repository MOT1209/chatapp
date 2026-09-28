/**
 * Form schemas.
 *
 * Client-side validation exists to give instant feedback, not to replace the
 * backend's. The rules below mirror docs/api-contract.md §3.1 so the two agree, and
 * the server's `fields` map is still applied on top of any client-side result, so a
 * divergence shows the server's message rather than being hidden.
 */

import { z } from "zod";

/** Arabic messages, kept together so the wording stays consistent. */
export const MESSAGES = {
  usernameRequired: "اسم المستخدم مطلوب",
  usernameShort: "اسم المستخدم يجب أن يكون 3 أحرف على الأقل",
  usernameLong: "اسم المستخدم يجب ألا يتجاوز 30 حرفاً",
  usernamePattern: "اسم المستخدم يقبل الأحرف اللاتينية والأرقام والنقطة والشرطة السفلية فقط",
  emailRequired: "البريد الإلكتروني مطلوب",
  emailInvalid: "أدخل بريداً إلكترونياً صحيحاً",
  passwordRequired: "كلمة المرور مطلوبة",
  passwordShort: "كلمة المرور يجب أن تكون 8 أحرف على الأقل",
  passwordLong: "كلمة المرور يجب ألا تتجاوز 72 حرفاً",
  displayNameRequired: "الاسم المعروض مطلوب",
  displayNameLong: "الاسم المعروض يجب ألا يتجاوز 50 حرفاً",
} as const;

/** Matches the server: 3-30 chars, `a-z0-9_.`, unique. */
export const usernameSchema = z
  .string()
  .trim()
  .min(3, MESSAGES.usernameShort)
  .max(30, MESSAGES.usernameLong)
  .regex(/^[a-z0-9_.]+$/, MESSAGES.usernamePattern);

export const emailSchema = z
  .string()
  .trim()
  .min(1, MESSAGES.emailRequired)
  .email(MESSAGES.emailInvalid)
  // Emails are stored and compared lowercase, so normalise on the way in.
  .transform((value) => value.toLowerCase());

export const passwordSchema = z
  .string()
  .min(8, MESSAGES.passwordShort)
  // bcrypt silently truncates past 72 bytes, which would make two different
  // passwords equivalent. Reject rather than accept a lie.
  .max(72, MESSAGES.passwordLong);

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, MESSAGES.displayNameRequired)
  .max(50, MESSAGES.displayNameLong);

export const loginSchema = z.object({
  /** Accepts a username or an email, per the contract. */
  identifier: z
    .string()
    .trim()
    .min(1, "أدخل اسم المستخدم أو البريد الإلكتروني"),
  password: z.string().min(1, MESSAGES.passwordRequired),
});

export const registerSchema = z
  .object({
    displayName: displayNameSchema,
    username: usernameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, "أعد إدخال كلمة المرور"),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "كلمتا المرور غير متطابقتين",
  });

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export type LoginValues = z.infer<typeof loginSchema>;
export type RegisterValues = z.infer<typeof registerSchema>;
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;
