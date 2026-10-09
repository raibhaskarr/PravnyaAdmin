import { resolve4 } from "dns/promises";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { env } from "../../config/env";

// Mirrors PranTrackingSystem's proven trusted-circle invitation email pattern (same
// log/smtp provider split, same token-in-URL convention). Started out therapist-invite-only
// (hence the module it lives in); now also sends tenant-setup invites -- the EmailProvider/
// transport plumbing below is genuinely generic, only the message-composing functions at the
// bottom are per-invite-type.

export type EmailSendInput = { to: string; subject: string; text: string; html?: string };
export type EmailSendResult = { sent: boolean; provider: "log" | "smtp" };

export interface EmailProvider {
  send(input: EmailSendInput): Promise<EmailSendResult>;
}

function appBaseUrl() {
  return env.APP_BASE_URL ?? env.CORS_ORIGIN.split(",")[0]?.trim() ?? "http://localhost:5176";
}

export function buildInviteUrl(token: string) {
  return `${appBaseUrl().replace(/\/$/, "")}/invite/${encodeURIComponent(token)}`;
}

export function buildTenantSignupUrl(token: string) {
  return `${appBaseUrl().replace(/\/$/, "")}/tenant-signup/${encodeURIComponent(token)}`;
}

class LoggingEmailProvider implements EmailProvider {
  async send(input: EmailSendInput): Promise<EmailSendResult> {
    // In production this means the invite email is NOT actually delivered -- logged as a warning,
    // without the recipient/body, so a real invite failing to send is visible without putting
    // someone's email address and invite link into plain server logs.
    if (env.NODE_ENV === "production") {
      console.warn(`[invitation email] no EMAIL_PROVIDER configured -- "${input.subject}" was not delivered`);
    } else {
      console.log(`[invitation email] to=${input.to} subject="${input.subject}"\n${input.text}`);
    }
    return { sent: true, provider: "log" };
  }
}

class SmtpEmailProvider implements EmailProvider {
  private readonly transporter: Promise<Transporter>;

  constructor() {
    const smtpHost = env.SMTP_HOST!;
    const makeTransport = (host: string): Transporter<SMTPTransport.SentMessageInfo> =>
      nodemailer.createTransport({
        host,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        tls: { servername: smtpHost },
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASS }
      });

    this.transporter = resolve4(smtpHost)
      .then((addrs) => makeTransport(addrs[0]))
      .catch(() => makeTransport(smtpHost));
  }

  async send(input: EmailSendInput): Promise<EmailSendResult> {
    const transport = await this.transporter;
    await transport.sendMail({
      from: `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM_ADDRESS}>`,
      to: input.to,
      subject: input.subject,
      text: input.text,
      ...(input.html ? { html: input.html } : {})
    });
    return { sent: true, provider: "smtp" };
  }
}

function createEmailProvider(): EmailProvider {
  if (env.EMAIL_PROVIDER === "smtp") {
    if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
      console.error("EMAIL_PROVIDER=smtp but SMTP_HOST/SMTP_USER/SMTP_PASS are not set -- falling back to logging.");
      return new LoggingEmailProvider();
    }
    return new SmtpEmailProvider();
  }
  return new LoggingEmailProvider();
}

const emailProvider = createEmailProvider();

export const invitationEmailService = {
  async sendTherapistInvitation(input: { to: string; tenantName: string; invitedByName: string; inviteUrl: string; kidName?: string }) {
    const subject = input.kidName
      ? `You've been invited to join ${input.kidName}'s care team on Pravnya`
      : `You've been invited to join ${input.tenantName} on Pravnya`;
    const body = input.kidName
      ? `${input.invitedByName} invited you to join ${input.kidName}'s care team at ${input.tenantName} as a therapist.\n\nSet up your account: ${input.inviteUrl}\n\nThis link expires in 14 days.`
      : `${input.invitedByName} invited you to join ${input.tenantName} on Pravnya as a therapist.\n\nSet up your account: ${input.inviteUrl}\n\nThis link expires in 14 days.`;
    return emailProvider.send({ to: input.to, subject, text: body });
  },

  async sendTenantInvitation(input: { to: string; tenantName: string; invitedByName: string; signupUrl: string }) {
    const subject = `You've been invited to set up ${input.tenantName} on Pravnya`;
    const body = `${input.invitedByName} invited you to set up ${input.tenantName} on Pravnya.\n\nSet up your account: ${input.signupUrl}\n\nThis link expires in 14 days.`;
    return emailProvider.send({ to: input.to, subject, text: body });
  }
};
