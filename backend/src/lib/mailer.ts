import { logger } from './logger.js';

/**
 * Outbound email. The only message Alpha sends is the password-reset token,
 * so the interface is deliberately narrow — widen it when a second message
 * type appears rather than guessing one now.
 */
export interface Mailer {
  /** Delivers a reset token to `to`. Resolves on success, throws on failure. */
  sendPasswordReset(to: string, token: string): Promise<void>;
}

/** What `createMailer` reads. A subset of `env`, passed explicitly so the mailer stays testable. */
export interface MailerConfig {
  resendApiKey?: string;
  mailFrom?: string;
  /** Optional web client origin; when set the email also offers a clickable link. */
  appWebUrl?: string;
}

/** Shared copy so the log line and the real email say the same thing. */
export function resetEmailBody(token: string, appWebUrl?: string): { subject: string; text: string } {
  const link = appWebUrl ? `${appWebUrl.replace(/\/$/, '')}/reset?token=${token}` : undefined;
  const lines = [
    'We received a request to reset your ChatApp password.',
    '',
    'Enter this code in the app to choose a new password:',
    '',
    `    ${token}`,
    '',
    ...(link ? ['Or open this link:', '', `    ${link}`, ''] : []),
    'This code expires in 1 hour and can be used once. If you did not request',
    'a reset, you can ignore this email — your password stays unchanged.',
  ];
  return { subject: 'Reset your ChatApp password', text: lines.join('\n') };
}

/**
 * Default mailer: records that a reset was requested, never the token (it is
 * a credential). Used in dev/test and as the fallback when no provider is
 * configured, so a missing API key degrades to "no email sent" rather than a
 * crash — the endpoint still behaves per contract (§3.1).
 */
export class LogMailer implements Mailer {
  async sendPasswordReset(to: string): Promise<void> {
    logger.info('password reset email not sent (no mail provider configured)', { to });
  }
}

/**
 * Sends through Resend's HTTP API (https://resend.com) using the global fetch
 * in Node 18+. Chosen over SMTP to avoid a new dependency; swapping providers
 * is a single class here. The sender domain must be verified in Resend, and
 * `mailFrom` must use that domain.
 */
export class ResendMailer implements Mailer {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly appWebUrl?: string,
  ) {}

  async sendPasswordReset(to: string, token: string): Promise<void> {
    const { subject, text } = resetEmailBody(token, this.appWebUrl);
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ from: this.from, to, subject, text }),
    });
    if (!res.ok) {
      // Read the body for the server log only; never surface it to the caller,
      // which must not learn whether the address exists.
      const detail = await res.text().catch(() => '');
      throw new Error(`Resend responded ${res.status}: ${detail.slice(0, 500)}`);
    }
  }
}

/**
 * Picks a mailer from config: Resend when both a key and a from-address are
 * set, otherwise the logging no-op. Returning a working mailer either way
 * keeps the reset endpoint identical across environments.
 */
export function createMailer(config: MailerConfig): Mailer {
  if (config.resendApiKey && config.mailFrom) {
    return new ResendMailer(config.resendApiKey, config.mailFrom, config.appWebUrl);
  }
  return new LogMailer();
}
