import { z } from "zod";

const clientEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: z.string().optional(),
  NEXT_PUBLIC_PADDLE_PRICE_ID: z.string().optional(),
  NEXT_PUBLIC_PADDLE_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  NEXT_PUBLIC_PAYPAL_CLIENT_ID: z.string().optional(),
  NEXT_PUBLIC_PAYPAL_PRO_PLAN_ID: z.string().optional(),
  NEXT_PUBLIC_PAYPAL_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
});

const serverEnvSchema = clientEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  STRIPE_PRO_PRICE_ID: z.string().min(1).optional(),
  STRIPE_PRO_MONTHLY_PRICE_ID: z.string().min(1).optional(),
  STRIPE_PRO_ANNUAL_PRICE_ID: z.string().min(1).optional(),
  PADDLE_API_KEY: z.string().min(1).optional(),
  PADDLE_WEBHOOK_SECRET_KEY: z.string().min(1).optional(),
  PADDLE_PRO_MONTHLY_PRICE_ID: z.string().min(1).optional(),
  PADDLE_PRO_ANNUAL_PRICE_ID: z.string().min(1).optional(),
  PAYPAL_CLIENT_SECRET: z.string().min(1).optional(),
  PAYPAL_WEBHOOK_ID: z.string().min(1).optional(),
  PAYPAL_PRO_MONTHLY_PLAN_ID: z.string().min(1).optional(),
  PAYPAL_PRO_ANNUAL_PLAN_ID: z.string().min(1).optional(),
  ADMIN_EMAILS: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  DRIVE_TOKEN_ENCRYPTION_KEY: z.string().min(1).optional(),
  GOOGLE_CLOUD_API_KEY: z.string().min(1).optional(),
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

function parseClientEnv(): ClientEnv {
  const values = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN,
    NEXT_PUBLIC_PADDLE_PRICE_ID: process.env.NEXT_PUBLIC_PADDLE_PRICE_ID,
    NEXT_PUBLIC_PADDLE_ENV: process.env.NEXT_PUBLIC_PADDLE_ENV,
    NEXT_PUBLIC_PAYPAL_CLIENT_ID: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID,
    NEXT_PUBLIC_PAYPAL_PRO_PLAN_ID: process.env.NEXT_PUBLIC_PAYPAL_PRO_PLAN_ID,
    NEXT_PUBLIC_PAYPAL_ENV: process.env.NEXT_PUBLIC_PAYPAL_ENV,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  };

  const result = clientEnvSchema.safeParse(values);
  if (!result.success) {
    throw new Error(
      `Invalid environment variables: ${result.error.issues.map((i) => i.path.join(".")).join(", ")}`
    );
  }

  return result.data;
}

export function getServerEnv(): ServerEnv {
  const client = parseClientEnv();
  return serverEnvSchema.parse({
    ...client,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    STRIPE_PRO_PRICE_ID: process.env.STRIPE_PRO_PRICE_ID,
    STRIPE_PRO_MONTHLY_PRICE_ID: process.env.STRIPE_PRO_MONTHLY_PRICE_ID,
    STRIPE_PRO_ANNUAL_PRICE_ID: process.env.STRIPE_PRO_ANNUAL_PRICE_ID,
    PADDLE_API_KEY: process.env.PADDLE_API_KEY,
    PADDLE_WEBHOOK_SECRET_KEY: process.env.PADDLE_WEBHOOK_SECRET_KEY,
    PADDLE_PRO_MONTHLY_PRICE_ID: process.env.PADDLE_PRO_MONTHLY_PRICE_ID,
    PADDLE_PRO_ANNUAL_PRICE_ID: process.env.PADDLE_PRO_ANNUAL_PRICE_ID,
    PAYPAL_CLIENT_SECRET: process.env.PAYPAL_CLIENT_SECRET,
    PAYPAL_WEBHOOK_ID: process.env.PAYPAL_WEBHOOK_ID,
    PAYPAL_PRO_MONTHLY_PLAN_ID: process.env.PAYPAL_PRO_MONTHLY_PLAN_ID,
    PAYPAL_PRO_ANNUAL_PLAN_ID: process.env.PAYPAL_PRO_ANNUAL_PLAN_ID,
    ADMIN_EMAILS: process.env.ADMIN_EMAILS,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    DRIVE_TOKEN_ENCRYPTION_KEY: process.env.DRIVE_TOKEN_ENCRYPTION_KEY,
    GOOGLE_CLOUD_API_KEY: process.env.GOOGLE_CLOUD_API_KEY,
  });
}

export const env = parseClientEnv();

export function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS;
  if (!raw) return [];
  return raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

export function isAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  return getAdminEmails().includes(email.toLowerCase());
}
