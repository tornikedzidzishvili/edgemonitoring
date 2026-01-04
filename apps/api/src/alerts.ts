import { request } from "undici";
import type { PrismaClient } from "@prisma/client";
import type { Env } from "./env.js";
import { decryptString } from "./cryptoBox.js";
import nodemailer from "nodemailer";

type AlertVars = {
  name: string;
  url: string;
  time: string;
  httpStatus: string;
  error: string;
};

function renderTemplate(template: string, vars: AlertVars): string {
  return template.replace(/\{\{\s*(name|url|time|httpStatus|error)\s*\}\}/g, (_m, key: keyof AlertVars) => {
    const v = vars[key];
    return typeof v === "string" ? v : "";
  });
}

async function getOrCreateAlertTemplate(prisma: PrismaClient) {
  const existing = await prisma.alertTemplate.findFirst();
  if (existing) return existing;

  return prisma.alertTemplate.create({
    data: {
      emailSubject: "Alert: {{name}} is DOWN",
      emailBody:
        "Service is DOWN\n\nName: {{name}}\nURL: {{url}}\nTime: {{time}}\nHTTP: {{httpStatus}}\nError: {{error}}\n",
      smsBody: "ALERT: {{name}} DOWN {{time}}"
    }
  });
}

async function sendEmail(prisma: PrismaClient, to: string, subject: string, body: string) {
  const smtp = await prisma.smtpSettings.findFirst();
  if (!smtp) return;

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth:
      smtp.username && smtp.password
        ? {
            user: smtp.username,
            pass: smtp.password
          }
        : undefined
  });

  await transporter.sendMail({
    from: smtp.fromName ? `${smtp.fromName} <${smtp.fromEmail}>` : smtp.fromEmail,
    to,
    subject,
    text: body
  });
}

async function sendSms(prisma: PrismaClient, env: Env, destination: string, content: string) {
  const settings = await prisma.smsSettings.findFirst();
  if (!settings || !settings.enabled || !settings.apiKeyEnc || !settings.apiKeyIv || !settings.apiKeyTag) return;

  const apiKey = decryptString(
    { enc: settings.apiKeyEnc, iv: settings.apiKeyIv, tag: settings.apiKeyTag },
    env.SSH_KEY_MASTER_SECRET
  );

  const form = new URLSearchParams({
    key: apiKey,
    destination,
    sender: "smsoffice",
    content,
    urgent: "true"
  });

  // Vendor note: for POST, endpoint must end with send/
  const res = await request("https://smsoffice.ge/api/v2/send/", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: form.toString()
  });

  const text = await res.body.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`sms-office-invalid-json (${res.statusCode})`);
  }

  if (!json || json.Success !== true) {
    const msg = typeof json?.Message === "string" ? json.Message : "sms-office-failed";
    const code = typeof json?.ErrorCode === "number" ? json.ErrorCode : undefined;
    throw new Error(code !== undefined ? `${msg} (code ${code})` : msg);
  }
}

export async function sendWebAppDownAlerts(
  prisma: PrismaClient,
  env: Env,
  params: { webAppId: string; httpStatus?: number | null; error?: string | null }
) {
  const webApp = await prisma.webApp.findUnique({ where: { id: params.webAppId } });
  if (!webApp) return;

  const recipients = await prisma.alertRecipient.findMany({
    where: { method: { not: "none" } },
    include: { user: true }
  });

  if (recipients.length === 0) return;

  const template = await getOrCreateAlertTemplate(prisma);

  const vars: AlertVars = {
    name: webApp.name,
    url: webApp.url,
    time: new Date().toISOString(),
    httpStatus: params.httpStatus != null ? String(params.httpStatus) : "-",
    error: params.error ?? "-"
  };

  const subject = renderTemplate(template.emailSubject, vars);
  const emailBody = renderTemplate(template.emailBody, vars);
  const smsBody = renderTemplate(template.smsBody, vars);

  await Promise.all(
    recipients.map(async (r) => {
      const method = r.method;

      if ((method === "email" || method === "both") && r.email) {
        try {
          await sendEmail(prisma, r.email, subject, emailBody);
        } catch {
          // Non-fatal for scheduler
        }
      }

      if ((method === "sms" || method === "both") && r.phone) {
        try {
          await sendSms(prisma, env, r.phone, smsBody);
        } catch {
          // Non-fatal for scheduler
        }
      }
    })
  );
}
