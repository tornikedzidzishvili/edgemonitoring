import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  SSH_KEY_MASTER_SECRET: z.string().min(16),
  CHECK_INTERVAL_SECONDS: z.coerce.number().int().positive().default(60),
  CHECK_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000)
});

export type Env = z.infer<typeof envSchema>;

export function getEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error(parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment variables for API");
  }
  return parsed.data;
}
