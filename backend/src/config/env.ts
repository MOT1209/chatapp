import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_ACCESS_SECRET: z.string().min(1, 'JWT_ACCESS_SECRET is required'),
  JWT_REFRESH_SECRET: z.string().min(1, 'JWT_REFRESH_SECRET is required'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(10),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration');
}

export const env = parsed.data;
export type Env = z.infer<typeof EnvSchema>;
