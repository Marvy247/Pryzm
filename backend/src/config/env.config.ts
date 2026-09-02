import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Required — Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_KEY: z.string().min(1),

  // Required — LLM
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_BASE_URL: z.string().default('https://gpt1.shupremium.com/v1'),
  OPENAI_MODEL: z.string().default('openai/gpt-oss-120b'),

  // Somnia Testnet / DreamDEX Event Contracts
  SOMNIA_PRIVATE_KEY: z.string().optional(),
  SOMNIA_WALLET_ADDRESS: z.string().optional(),
  SOMNIA_RPC_URL: z.string().default('https://dream-rpc.somnia.network'),
  SOMNIA_WS_RPC_URL: z.string().default('wss://dream-rpc.somnia.network/ws'),
  SOMNIA_INDEXER_URL: z.string().default('https://indexer.dreamdex.io'),
  SOMNIA_VENUE_ID: z.string().transform(Number).default('1'),

  // EC Agent Settings
  EC_MIN_EDGE_PERCENT: z.string().transform(Number).default('10'),
  EC_MAX_POSITION_SIZE_USD: z.string().transform(Number).default('20'),
  EC_MAX_DRAWDOWN_PERCENT: z.string().transform(Number).default('30'),
  EC_MIN_EXPIRY_HEADROOM_SECONDS: z.string().transform(Number).default('120'),
  EC_RUN_INTERVAL_MINUTES: z.string().transform(Number).default('5'),

  // Optional — improves ec-sentiment agent (web search)
  TAVILY_API_KEY: z.string().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

const processEnv = {
  PORT: process.env.PORT,
  NODE_ENV: process.env.NODE_ENV,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
  OPENAI_MODEL: process.env.OPENAI_MODEL,
  SOMNIA_PRIVATE_KEY: process.env.SOMNIA_PRIVATE_KEY,
  SOMNIA_WALLET_ADDRESS: process.env.SOMNIA_WALLET_ADDRESS,
  SOMNIA_RPC_URL: process.env.SOMNIA_RPC_URL,
  SOMNIA_WS_RPC_URL: process.env.SOMNIA_WS_RPC_URL,
  SOMNIA_INDEXER_URL: process.env.SOMNIA_INDEXER_URL,
  SOMNIA_VENUE_ID: process.env.SOMNIA_VENUE_ID,
  EC_MIN_EDGE_PERCENT: process.env.EC_MIN_EDGE_PERCENT,
  EC_MAX_POSITION_SIZE_USD: process.env.EC_MAX_POSITION_SIZE_USD,
  EC_MAX_DRAWDOWN_PERCENT: process.env.EC_MAX_DRAWDOWN_PERCENT,
  EC_MIN_EXPIRY_HEADROOM_SECONDS: process.env.EC_MIN_EXPIRY_HEADROOM_SECONDS,
  EC_RUN_INTERVAL_MINUTES: process.env.EC_RUN_INTERVAL_MINUTES,
  TAVILY_API_KEY: process.env.TAVILY_API_KEY,
};

const parsed = envSchema.safeParse(processEnv);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.format());
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
}

export const config = parsed.success ? parsed.data : (processEnv as unknown as EnvConfig);
