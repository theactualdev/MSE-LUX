import { z } from 'zod'

const envSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_BRAND_NAME: z.string().min(1).default('MSE Lux'),
})

export type Env = z.infer<typeof envSchema>

export function parseEnv(raw: Record<string, string | undefined>): Env {
  return envSchema.parse(raw)
}

export const env: Env = parseEnv({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_BRAND_NAME: process.env.NEXT_PUBLIC_BRAND_NAME,
})
