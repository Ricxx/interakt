import { config } from "dotenv";

// One .env at the repo root. Scripts run from apps/server, so load it from there.
config({ path: "../../.env" });

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

const smtpHost = process.env.SMTP_HOST;

export const env = {
  port: Number(process.env.PORT ?? 8080),
  // Owner role — runs migrations, seed, and role provisioning (full DDL rights).
  databaseUrl: required("DATABASE_URL"),
  // Restricted role the running server connects as (no UPDATE/DELETE on append-only
  // tables). Falls back to the owner URL when unset, so dev works without provisioning.
  appDatabaseUrl: process.env.APP_DATABASE_URL ?? required("DATABASE_URL"),
  sessionSecret: required("SESSION_SECRET"),
  isProd: process.env.NODE_ENV === "production",
  // Used to build invite links in emails.
  appUrl: process.env.APP_URL ?? "http://localhost:5173",
  emailFrom: process.env.EMAIL_FROM ?? "CES <no-reply@ces.local>",
  // Object storage (MinIO/S3) for uploaded files (avatars, gallery photos). Defaults to the dev compose.
  storage: {
    endPoint: process.env.MINIO_ENDPOINT ?? "127.0.0.1",
    port: Number(process.env.MINIO_PORT ?? 9000),
    useSSL: process.env.MINIO_SSL === "true",
    accessKey: process.env.MINIO_ACCESS_KEY ?? "ces",
    secretKey: process.env.MINIO_SECRET_KEY ?? "ces-secret",
    bucket: process.env.MINIO_BUCKET ?? "ces-uploads",
  },
  // Optional. If unset, emails are printed to the console (dev). Works with Mailgun,
  // Postmark, SES, etc. — any SMTP host.
  smtp: smtpHost
    ? {
        host: smtpHost,
        port: Number(process.env.SMTP_PORT ?? 587),
        user: process.env.SMTP_USER ?? "",
        pass: process.env.SMTP_PASS ?? "",
      }
    : null,
};
