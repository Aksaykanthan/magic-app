/**
 * Transactional email — one `sendMail()` call regardless of provider.
 *
 * `bun run setup` / `npx create-magic-app` ask which provider to ship:
 *   - resend   — hosted API, no SMTP credentials to manage (recommended)
 *   - smtp     — any SMTP server, via nodemailer
 *   - console  — no real provider; logs the email via lib/logger.ts (local dev)
 *   - none     — this file is deleted entirely and lib/auth.ts's
 *                sendResetPassword/sendVerificationEmail hooks are stripped
 *
 * Whichever provider ISN'T selected has its implementation block (marked
 * `MAGIC:mailer-resend` / `MAGIC:mailer-smtp` below) removed by
 * scripts/setup.ts, along with the matching dependency (`resend` or
 * `nodemailer`) — so a project that only wants SMTP never ships the Resend
 * SDK in its bundle, and vice versa.
 */
import "server-only";
// MAGIC:mailer-resend:start
import { Resend } from "resend";
// MAGIC:mailer-resend:end
// MAGIC:mailer-smtp:start
import nodemailer from "nodemailer";
// MAGIC:mailer-smtp:end
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

const mailLog = logger.child("mailer");

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  /** Plain-text fallback. Providers that support auto-generating one from `html` will if omitted. */
  text?: string;
}

const FROM_ADDRESS = env.MAIL_FROM ?? "onboarding@resend.dev";

// MAGIC:mailer-resend:start
let resendClient: Resend | undefined;
function getResendClient(): Resend {
  if (!resendClient) {
    if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not set (required when MAIL_PROVIDER=resend).");
    resendClient = new Resend(env.RESEND_API_KEY);
  }
  return resendClient;
}

async function sendViaResend(input: SendMailInput): Promise<void> {
  const { error } = await getResendClient().emails.send({
    from: FROM_ADDRESS,
    to: [input.to],
    subject: input.subject,
    html: input.html,
    text: input.text,
  });
  if (error) throw new Error(`Resend failed to send email: ${error.message}`);
}
// MAGIC:mailer-resend:end

// MAGIC:mailer-smtp:start
let smtpTransport: ReturnType<typeof nodemailer.createTransport> | undefined;
function getSmtpTransport() {
  if (!smtpTransport) {
    if (!env.SMTP_HOST) throw new Error("SMTP_HOST is not set (required when MAIL_PROVIDER=smtp).");
    smtpTransport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT ?? 587,
      secure: env.SMTP_SECURE ?? false,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    });
  }
  return smtpTransport;
}

async function sendViaSmtp(input: SendMailInput): Promise<void> {
  await getSmtpTransport().sendMail({
    from: FROM_ADDRESS,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });
}
// MAGIC:mailer-smtp:end

/** Dev-only fallback — no real provider configured, just logs what would have been sent. */
async function sendViaConsole(input: SendMailInput): Promise<void> {
  mailLog.info(`(console provider — no email actually sent) to=${input.to} subject="${input.subject}"`);
  mailLog.debug(input.html);
}

/**
 * Sends an email through whichever provider `MAIL_PROVIDER` selects,
 * falling back to the console logger if it's unset (e.g. local dev before
 * you've configured real credentials).
 */
export async function sendMail(input: SendMailInput): Promise<void> {
  // MAGIC:mailer-resend:start
  if (env.MAIL_PROVIDER === "resend") return sendViaResend(input);
  // MAGIC:mailer-resend:end
  // MAGIC:mailer-smtp:start
  if (env.MAIL_PROVIDER === "smtp") return sendViaSmtp(input);
  // MAGIC:mailer-smtp:end
  return sendViaConsole(input);
}
