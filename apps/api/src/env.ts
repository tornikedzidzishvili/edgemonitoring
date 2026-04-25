import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  SSH_KEY_MASTER_SECRET: z.string().min(16),
  CHECK_INTERVAL_SECONDS: z.coerce.number().int().positive().default(60),
  CHECK_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  RP_ID: z.string().optional(),
  ORIGIN: z.string().optional(),
  /**
   * Public base URL of this API, used as --api-url when installing the agent
   * on a remote server. The agent must be able to reach this URL from the
   * internet (or from the server's network if you're on a private network).
   * Defaults to the production URL; set this in development so the installed
   * agent can reach your local instance.
   */
  PUBLIC_API_URL: z.string().url().default("https://monitoring.edge.ge/api")
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
