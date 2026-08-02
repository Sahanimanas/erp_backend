import nodemailer, { Transporter } from 'nodemailer';
import { config } from '@config/environment';

/**
 * SMTP mailer.
 *
 * The transport is created lazily and reused, so the server still boots when
 * mail is unconfigured — a send then fails with a clear reason instead of
 * taking down whatever business action triggered it.
 */

let transporter: Transporter | null = null;

/**
 * Whether SMTP looks usable. The shipped .env carries placeholder values
 * (`your-email@gmail.com`), and silently "sending" to those is worse than
 * saying up front that mail is off — an operator would think credentials went
 * out when nothing did.
 */
export function isMailConfigured(): boolean {
  const { smtpHost, smtpUser, smtpPassword } = config.email;
  if (!smtpHost || !smtpUser || !smtpPassword) return false;
  const placeholder = /your-email@|your-app-specific-password|changeme/i;
  return !placeholder.test(smtpUser) && !placeholder.test(smtpPassword);
}

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.email.smtpHost,
      port: config.email.smtpPort,
      // 465 is implicit TLS; 587 upgrades with STARTTLS.
      secure: config.email.smtpPort === 465,
      auth: { user: config.email.smtpUser, pass: config.email.smtpPassword },
    });
  }
  return transporter;
}

export interface MailInput {
  to: string;
  subject: string;
  html: string;
  /** Plain-text alternative; derived from the HTML when omitted. */
  text?: string;
}

export interface MailResult {
  sent: boolean;
  /** Why it didn't send — surfaced to the operator, never thrown. */
  error?: string;
  messageId?: string;
}

/** Strip tags for the plain-text part so the mail isn't HTML-only (spam signal). */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Send one email. NEVER throws: callers use this from inside business flows
 * (creating a school, resetting a password) where a mail outage must not roll
 * back or fail the action that triggered it. Check `sent` on the result.
 */
export async function sendMail(input: MailInput): Promise<MailResult> {
  if (!isMailConfigured()) {
    const error = 'Email is not configured — set SMTP_HOST, SMTP_USER and SMTP_PASSWORD.';
    console.warn(`[mail] skipped "${input.subject}" to ${input.to}: ${error}`);
    return { sent: false, error };
  }

  try {
    const info = await getTransporter().sendMail({
      from: config.email.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text || htmlToText(input.html),
    });
    console.log(`[mail] sent "${input.subject}" to ${input.to} id=${info.messageId}`);
    return { sent: true, messageId: info.messageId };
  } catch (err: any) {
    const error = err?.message || 'Unknown mail error';
    console.error(`[mail] FAILED "${input.subject}" to ${input.to}: ${error}`);
    return { sent: false, error };
  }
}

// ── Templates ──────────────────────────────────────────────────────────────

const esc = (v: unknown): string =>
  String(v ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)
  );

function layout(title: string, body: string): string {
  return `
  <div style="margin:0;padding:24px;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
      <div style="background:#4f46e5;padding:20px 24px;">
        <h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:700;">${esc(title)}</h1>
      </div>
      <div style="padding:24px;color:#334155;font-size:14px;line-height:1.6;">
        ${body}
      </div>
      <div style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:11.5px;">
        This is an automated message — please do not reply to it.
      </div>
    </div>
  </div>`;
}

export interface SchoolWelcomeMail {
  schoolName: string;
  /** Where the school signs in, e.g. https://dps.globalschoolmitra.com */
  loginUrl: string;
  /** The login username — the admin's email address. */
  username: string;
  password: string;
  adminName?: string;
}

/**
 * Welcome email handed to a newly created school: where to sign in, and the
 * credentials to do it with.
 */
export function schoolWelcomeEmail(data: SchoolWelcomeMail): { subject: string; html: string } {
  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:8px 12px;color:#64748b;font-size:12.5px;white-space:nowrap;">${esc(label)}</td>
      <td style="padding:8px 12px;color:#0f172a;font-size:13.5px;font-weight:600;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${esc(value)}</td>
    </tr>`;

  const html = layout(`Welcome to ${data.schoolName}`, `
    <p style="margin:0 0 14px;">Hello${data.adminName ? ` ${esc(data.adminName)}` : ''},</p>
    <p style="margin:0 0 18px;">
      The school account for <b>${esc(data.schoolName)}</b> is ready. Use the details below to sign in.
    </p>
    <table style="width:100%;border-collapse:collapse;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
      ${row('Login URL', data.loginUrl)}
      ${row('Username', data.username)}
      ${row('Password', data.password)}
    </table>
    <p style="margin:18px 0 18px;">
      <a href="${esc(data.loginUrl)}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:13.5px;">Sign in</a>
    </p>
    <p style="margin:0;padding:12px 14px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;color:#92400e;font-size:12.5px;">
      <b>Please change this password after your first sign-in.</b>
      Anyone with access to this email can use it to sign in until you do.
    </p>
  `);

  return { subject: `Your ${data.schoolName} login details`, html };
}
