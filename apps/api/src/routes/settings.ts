import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { encryptString } from "../cryptoBox.js";
import { getEnv } from "../env.js";
import { sendTestAlerts } from "../alerts.js";
import { requireAdmin } from "../middleware/sessionAuth.js";

export async function settingsRoutes(app: FastifyInstance) {
  const env = getEnv();

  // Get SMTP settings (admin only)
  app.get("/settings/smtp", { preHandler: requireAdmin }, async () => {
    const settings = await prisma.smtpSettings.findFirst();

    if (!settings) {
      return { configured: false, settings: null };
    }

    return {
      configured: true,
      settings: {
        id: settings.id,
        host: settings.host,
        port: settings.port,
        secure: settings.secure,
        username: settings.username,
        // Don't expose password
        hasPassword: !!settings.passwordEnc,
        fromEmail: settings.fromEmail,
        fromName: settings.fromName,
        updatedAt: settings.updatedAt
      }
    };
  });

  // Create or update SMTP settings (admin only)
  app.post("/settings/smtp", { preHandler: requireAdmin }, async (req) => {
    const body = z
      .object({
        host: z.string().min(1),
        port: z.coerce.number().int().min(1).max(65535),
        secure: z.boolean().default(true),
        username: z.string().nullable().optional(),
        password: z.string().nullable().optional(),
        fromEmail: z.string().email(),
        fromName: z.string().nullable().optional()
      })
      .parse(req.body);

    const existing = await prisma.smtpSettings.findFirst();

    const pwEnc = body.password ? encryptString(body.password, env.SSH_KEY_MASTER_SECRET) : null;

    const data: Record<string, unknown> = {
      host: body.host,
      port: body.port,
      secure: body.secure,
      username: body.username ?? null,
      fromEmail: body.fromEmail,
      fromName: body.fromName ?? null,
      ...(pwEnc
        ? { passwordEnc: pwEnc.enc, passwordIv: pwEnc.iv, passwordTag: pwEnc.tag }
        : body.password === null
          ? { passwordEnc: null, passwordIv: null, passwordTag: null }
          : {})
    };

    let settings;
    if (existing) {
      // If password is not provided (undefined), keep the existing one
      if (body.password === undefined) {
        delete data.passwordEnc;
        delete data.passwordIv;
        delete data.passwordTag;
      }
      settings = await prisma.smtpSettings.update({
        where: { id: existing.id },
        data
      });
    } else {
      settings = await prisma.smtpSettings.create({ data: data as any });
    }

    return {
      settings: {
        id: settings.id,
        host: settings.host,
        port: settings.port,
        secure: settings.secure,
        username: settings.username,
        hasPassword: !!settings.passwordEnc,
        fromEmail: settings.fromEmail,
        fromName: settings.fromName,
        updatedAt: settings.updatedAt
      }
    };
  });

  // Test SMTP settings (admin only)
  app.post("/settings/smtp/test", { preHandler: requireAdmin }, async (req, reply) => {
    const body = z
      .object({
        testEmail: z.string().email()
      })
      .parse(req.body);

    const settings = await prisma.smtpSettings.findFirst();
    if (!settings) {
      return reply.status(400).send({ error: "smtp-not-configured", message: "SMTP settings have not been configured" });
    }

    // For now, just return success - actual email sending would require nodemailer
    // This is a placeholder for future implementation
    return {
      ok: true,
      message: `Test email would be sent to ${body.testEmail}`,
      note: "Email sending not yet implemented - SMTP settings saved successfully"
    };
  });

  // Delete SMTP settings (admin only)
  app.delete("/settings/smtp", { preHandler: requireAdmin }, async () => {
    const existing = await prisma.smtpSettings.findFirst();
    if (existing) {
      await prisma.smtpSettings.delete({ where: { id: existing.id } });
    }
    return { ok: true };
  });

  // Get SMS settings (admin only)
  app.get("/settings/sms", { preHandler: requireAdmin }, async () => {
    const settings = await prisma.smsSettings.findFirst();

    if (!settings) {
      return { configured: false, settings: null };
    }

    return {
      configured: !!settings.apiKeyEnc,
      settings: {
        id: settings.id,
        enabled: settings.enabled,
        senderName: settings.senderName,
        hasApiKey: !!settings.apiKeyEnc,
        updatedAt: settings.updatedAt
      }
    };
  });

  // Create or update SMS settings (admin only)
  app.post("/settings/sms", { preHandler: requireAdmin }, async (req) => {
    const body = z
      .object({
        enabled: z.boolean().default(false),
        senderName: z.string().min(1).nullable().optional(),
        apiKey: z.string().min(1).nullable().optional()
      })
      .parse(req.body);

    const existing = await prisma.smsSettings.findFirst();

    const data: {
      enabled: boolean;
      senderName?: string | null;
      apiKeyEnc?: string | null;
      apiKeyIv?: string | null;
      apiKeyTag?: string | null;
    } = {
      enabled: body.enabled
    };

    if (body.senderName !== undefined) {
      data.senderName = body.senderName;
    }

    if (body.apiKey === null) {
      data.apiKeyEnc = null;
      data.apiKeyIv = null;
      data.apiKeyTag = null;
    } else if (typeof body.apiKey === "string") {
      const box = encryptString(body.apiKey, env.SSH_KEY_MASTER_SECRET);
      data.apiKeyEnc = box.enc;
      data.apiKeyIv = box.iv;
      data.apiKeyTag = box.tag;
    }

    let settings;
    if (existing) {
      // If apiKey is not provided, keep the existing one
      if (body.apiKey === undefined) {
        delete (data as any).apiKeyEnc;
        delete (data as any).apiKeyIv;
        delete (data as any).apiKeyTag;
      }

      settings = await prisma.smsSettings.update({
        where: { id: existing.id },
        data
      });
    } else {
      settings = await prisma.smsSettings.create({ data });
    }

    return {
      settings: {
        id: settings.id,
        enabled: settings.enabled,
        senderName: settings.senderName,
        hasApiKey: !!settings.apiKeyEnc,
        updatedAt: settings.updatedAt
      }
    };
  });

  // List alert recipients (admin only)
  app.get("/settings/alerts/recipients", { preHandler: requireAdmin }, async () => {
    const recipients = await prisma.alertRecipient.findMany({
      orderBy: { createdAt: "desc" },
      include: { user: { select: { id: true, fullName: true, email: true } } }
    });

    return {
      recipients: recipients.map((r) => ({
        id: r.id,
        user: r.user,
        email: r.email,
        phone: r.phone,
        method: r.method,
        updatedAt: r.updatedAt
      }))
    };
  });

  // Create or update alert recipient (admin only)
  app.post("/settings/alerts/recipients", { preHandler: requireAdmin }, async (req) => {
    const body = z
      .object({
        userId: z.string().min(1),
        email: z.string().email().nullable().optional(),
        phone: z.string().min(3).nullable().optional(),
        method: z.enum(["none", "email", "sms", "both"]).default("none")
      })
      .parse(req.body);

    // Validate required contact info based on method
    if ((body.method === "email" || body.method === "both") && !body.email) {
      throw app.httpErrors.badRequest("missing-email-for-alerts");
    }
    if ((body.method === "sms" || body.method === "both") && !body.phone) {
      throw app.httpErrors.badRequest("missing-phone-for-alerts");
    }

    const existing = await prisma.alertRecipient.findUnique({ where: { userId: body.userId } });

    const data = {
      userId: body.userId,
      email: body.email ?? null,
      phone: body.phone ?? null,
      method: body.method
    };

    const saved = existing
      ? await prisma.alertRecipient.update({ where: { id: existing.id }, data })
      : await prisma.alertRecipient.create({ data });

    const user = await prisma.user.findUnique({ where: { id: saved.userId }, select: { id: true, fullName: true, email: true } });

    return {
      recipient: {
        id: saved.id,
        user,
        email: saved.email,
        phone: saved.phone,
        method: saved.method,
        updatedAt: saved.updatedAt
      }
    };
  });

  // Get alert templates (admin only)
  app.get("/settings/templates/alerts", { preHandler: requireAdmin }, async () => {
    let tmpl = await prisma.alertTemplate.findFirst();
    if (!tmpl) {
      tmpl = await prisma.alertTemplate.create({
        data: {
          emailSubject: "Alert: {{name}} is DOWN",
          emailBody:
            "Service is DOWN\n\nName: {{name}}\nURL: {{url}}\nTime: {{time}}\nHTTP: {{httpStatus}}\nError: {{error}}\n",
          smsBody: "ALERT: {{name}} DOWN {{time}}"
        }
      });
    }

    return {
      templates: {
        id: tmpl.id,
        emailSubject: tmpl.emailSubject,
        emailBody: tmpl.emailBody,
        smsBody: tmpl.smsBody,
        updatedAt: tmpl.updatedAt
      }
    };
  });

  // Save alert templates (admin only)
  app.post("/settings/templates/alerts", { preHandler: requireAdmin }, async (req) => {
    const body = z
      .object({
        emailSubject: z.string().min(1),
        emailBody: z.string().min(1),
        smsBody: z.string().min(1)
      })
      .parse(req.body);

    const existing = await prisma.alertTemplate.findFirst();
    const saved = existing
      ? await prisma.alertTemplate.update({ where: { id: existing.id }, data: body })
      : await prisma.alertTemplate.create({ data: body });

    return {
      templates: {
        id: saved.id,
        emailSubject: saved.emailSubject,
        emailBody: saved.emailBody,
        smsBody: saved.smsBody,
        updatedAt: saved.updatedAt
      }
    };
  });

  // Send test alert notifications (admin only)
  app.post("/settings/alerts/test", { preHandler: requireAdmin }, async (req, reply) => {
    const body = z
      .object({
        email: z.string().email().nullable().optional(),
        phone: z.string().min(3).nullable().optional()
      })
      .parse(req.body);

    const email = body.email ?? null;
    const phone = body.phone ?? null;

    if (!email && !phone) {
      return reply.status(400).send({ error: "missing-destination", message: "Provide email and/or phone" });
    }

    const result = await sendTestAlerts(prisma, env, { email, phone });
    return { ok: true, result };
  });
}
