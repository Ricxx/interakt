import nodemailer from "nodemailer";
import { env } from "../env.js";

// One sender for the whole app. SMTP if configured, otherwise print to console so the
// invite flow is testable in dev without an email account.
const transporter = env.smtp
  ? nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    })
  : null;

export async function sendEmail(args: { to: string; subject: string; html: string }) {
  if (!transporter) {
    console.log(
      `\n[email:dev] to=${args.to}\n[email:dev] subject=${args.subject}\n${args.html}\n`,
    );
    return;
  }
  await transporter.sendMail({ from: env.emailFrom, ...args });
}
