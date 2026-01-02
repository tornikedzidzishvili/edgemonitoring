import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAdmin } from "../middleware/sessionAuth.js";

export async function settingsRoutes(app: FastifyInstance) {
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
        hasPassword: !!settings.password,
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

    const data = {
      host: body.host,
      port: body.port,
      secure: body.secure,
      username: body.username ?? null,
      password: body.password ?? null,
      fromEmail: body.fromEmail,
      fromName: body.fromName ?? null
    };

    let settings;
    if (existing) {
      // If password is not provided, keep the existing one
      if (body.password === undefined) {
        delete (data as any).password;
      }
      settings = await prisma.smtpSettings.update({
        where: { id: existing.id },
        data
      });
    } else {
      settings = await prisma.smtpSettings.create({ data });
    }

    return {
      settings: {
        id: settings.id,
        host: settings.host,
        port: settings.port,
        secure: settings.secure,
        username: settings.username,
        hasPassword: !!settings.password,
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
}
