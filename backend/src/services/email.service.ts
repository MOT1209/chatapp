import nodemailer, { type Transporter } from 'nodemailer';
import { env, envFlag } from '../config/env.js';

/**
 * Outbound transactional email.
 *
 * Until this existed, a production password reset could not be completed at all:
 * the token was stored as a hash and never delivered anywhere. `config/env.ts`
 * now refuses to boot a production instance without SMTP_HOST/SMTP_PORT/SMTP_FROM,
 * so a deployed service always has a working transport.
 */

let transporter: Transporter | null = null;

/** Built lazily so importing this module never opens a socket or throws. */
function getTransporter(): Transporter | null {
  // Read the live `env` fields, never a module-load snapshot: tests reconfigure
  // SMTP at runtime, and a frozen `smtpConfigured` would silently swallow mail.
  if (!env.SMTP_HOST || !env.SMTP_PORT || !env.SMTP_FROM) {
    return null;
  }
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    // Implicit TLS (465). Most providers use STARTTLS on 587 and leave this false.
    secure: envFlag(env.SMTP_SECURE ?? ''),
    auth: env.SMTP_USER && env.SMTP_PASS ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    // A hung SMTP server must not hold a request open past its own timeout.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return transporter;
}

export type PasswordResetMail = {
  to: string;
  displayName: string;
  resetToken: string;
  expiresInMinutes: number;
};

/**
 * The reset page is served by the Flutter web build, so the link points at the
 * frontend origin rather than the API. `APP_BASE_URL` is validated as https in
 * production, so the link cannot be downgraded in transit.
 */
function resetUrl(resetToken: string): string {
  return `${env.APP_BASE_URL.replace(/\/+$/, '')}/reset-password?token=${encodeURIComponent(resetToken)}`;
}

/**
 * Sends the password-reset link.
 *
 * Returns whether the mail was handed to the provider. It never throws: a bounced
 * email must not turn `POST /forgot-password` into a 500, which would both leak
 * whether the address is registered (the contract requires an identical 202 either
 * way, §3.1) and tell the user their account is broken when it is not.
 */
export async function sendPasswordResetEmail(mail: PasswordResetMail): Promise<boolean> {
  const smtp = getTransporter();
  if (!smtp) {
    // Only reachable outside production (production cannot boot unconfigured) or in
    // tests. Deliberately says nothing about the address or the token.
    console.warn('[mail] no SMTP transport configured; password reset email not sent');
    return false;
  }

  const link = resetUrl(mail.resetToken);
  try {
    await smtp.sendMail({
      from: { name: env.SMTP_FROM_NAME, address: env.SMTP_FROM! },
      to: mail.to,
      subject: 'Reset your ChatApp password',
      text: [
        `Hi ${mail.displayName},`,
        '',
        'Use the link below to choose a new ChatApp password:',
        link,
        '',
        `It expires in ${mail.expiresInMinutes} minutes and can only be used once.`,
        '',
        'If you did not ask for this, you can ignore this email — your password has not changed.',
      ].join('\n'),
      html: [
        `<p>Hi ${escapeHtml(mail.displayName)},</p>`,
        '<p>Use the link below to choose a new ChatApp password:</p>',
        `<p><a href="${escapeHtml(link)}">Reset my password</a></p>`,
        `<p>It expires in ${mail.expiresInMinutes} minutes and can only be used once.</p>`,
        '<p>If you did not ask for this, you can ignore this email &mdash; your password has not changed.</p>',
      ].join(''),
    });
    return true;
  } catch (err) {
    // Never the provider's message: SMTP errors routinely quote the recipient
    // address, the auth username and the whole DATA payload — which here contains
    // the reset token itself.
    console.warn('[mail] password reset email failed to send:', errName(err));
    return false;
  }
}

function errName(err: unknown): string {
  return err instanceof Error ? err.name : 'unknown';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Test seam: drops the cached transport so a reconfigured env takes effect. */
export function resetMailTransportForTests(): void {
  transporter = null;
}