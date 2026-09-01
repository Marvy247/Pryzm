-- EC positions: open positions the agent holds
CREATE TABLE IF NOT EXISTS public.ec_positions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  market_id text NOT NULL,          -- Keyed by marketId (gotcha #12)
  asset text NOT NULL,              -- 'BTC' | 'ETH'
  label text NOT NULL,              -- 'BTC-15m' etc.
  side text NOT NULL,               -- 'UP' | 'DOWN'
  size_usd numeric NOT NULL,
  entry_price numeric NOT NULL,     -- probability (0-1)
  implied_prob_at_entry numeric,
  fair_prob_at_entry numeric,
  edge_at_entry numeric,
  up_symbol text NOT NULL,
  down_symbol text NOT NULL,
  expiry bigint NOT NULL,           -- unix seconds
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'expired', 'won', 'lost', 'voided')),
  pnl_usd numeric,
  tx_hash text,
  reasoning jsonb,                  -- full probability scorecard
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz,
  CONSTRAINT ec_positions_pkey PRIMARY KEY (id)
);

-- EC runs: log every orchestrator cycle
CREATE TABLE IF NOT EXISTS public.ec_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  markets_scanned integer DEFAULT 0,
  edges_found integer DEFAULT 0,
  orders_placed integer DEFAULT 0,
  redemptions integer DEFAULT 0,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed')),
  error_message text,
  logs jsonb,
  CONSTRAINT ec_runs_pkey PRIMARY KEY (id)
);

-- EC agent config: per-wallet settings (mirrors futures_agents pattern)
CREATE TABLE IF NOT EXISTS public.ec_agent_config (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_wallet_address text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT false,
  mode text NOT NULL DEFAULT 'directional'
    CHECK (mode IN ('directional', 'liquidity', 'both')),
  min_edge_percent numeric NOT NULL DEFAULT 10,
  max_position_size_usd numeric NOT NULL DEFAULT 20,
  max_drawdown_percent numeric NOT NULL DEFAULT 30,
  assets_enabled text[] NOT NULL DEFAULT ARRAY['BTC', 'ETH'],
  cadences_enabled integer[] NOT NULL DEFAULT ARRAY[900, 3600],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ec_agent_config_pkey PRIMARY KEY (id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS ec_positions_market_id_idx ON public.ec_positions(market_id);
CREATE INDEX IF NOT EXISTS ec_positions_status_idx ON public.ec_positions(status);
CREATE INDEX IF NOT EXISTS ec_runs_started_at_idx ON public.ec_runs(started_at DESC);
