export type TierLevel = 'NONE' | 'SILVER' | 'GOLD' | 'DIAMOND';

export interface User {
  wallet_address: string;
  telegram_user_id: number | null;
  telegram_username: string | null;
  tier: TierLevel;
  rge_balance_usd: number | null;
  last_verified_at: string | null;
  created_at: string;
}

export interface CustomRequest {
  id: string;
  user_wallet_address: string;
  request_text: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  response_text: string | null;
  created_at: string;
  completed_at: string | null;
}
