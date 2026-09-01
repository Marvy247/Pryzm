import { z } from 'zod';

export const TokenInfoSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  contract_address: z.string(),
});

export const TriggerEventSchema = z.object({
  type: z.enum(['kol_mention', 'whale_movement', 'volume_spike', 'sentiment_surge']),
  kol_handle: z.string().optional(),
  tweet_url: z.string().url().optional(),
  whale_wallets: z.array(z.string()).optional(),
  description: z.string().optional(),
});

export const SignalContentSchema = z.object({
  token: TokenInfoSchema,
  entry_price: z.number(),
  target_price: z.number(),
  stop_loss: z.number(),
  confidence: z.number().min(1).max(100),
  trigger_event: TriggerEventSchema,
  analysis: z.string(),
  formatted_tweet: z.string(),
});

export const IntelContentSchema = z.object({
  narrative: z.string(),
  insights: z.array(z.string()),
  data_points: z.record(z.union([z.string(), z.number()])),
  formatted_thread: z.string(),
});

export const RunTypeSchema = z.enum(['signal', 'intel', 'skip']);

export const RunSchema = z.object({
  id: z.string().uuid().optional(),
  type: RunTypeSchema,
  content: z.union([SignalContentSchema, IntelContentSchema, z.object({})]),
  public_posted_at: z.string().datetime().nullable().optional(),
  telegram_delivered_at: z.string().datetime().nullable().optional(),
  confidence_score: z.number().min(1).max(100).nullable().optional(),
  cycle_started_at: z.string().datetime().optional(),
  cycle_completed_at: z.string().datetime().nullable().optional(),
  execution_time_ms: z.number().nullable().optional(),
  error_message: z.string().nullable().optional(),
});

export const UserSchema = z.object({
  wallet_address: z.string(),
  telegram_user_id: z.number().nullable().optional(),
  telegram_username: z.string().nullable().optional(),
  tier: z.enum(['NONE', 'SILVER', 'GOLD', 'DIAMOND']),
  rge_balance_usd: z.number().nullable().optional(),
});
