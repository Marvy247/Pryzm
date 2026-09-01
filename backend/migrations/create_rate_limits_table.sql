-- Create rate limit tracker table
-- This stores X API rate limit reset times to persist across app restarts

CREATE TABLE IF NOT EXISTS public.x_api_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service text NOT NULL DEFAULT 'twitter', -- Service identifier
  user_limit_reset timestamptz, -- When user 24h limit resets
  app_limit_reset timestamptz, -- When app 24h limit resets
  is_rate_limited boolean NOT NULL DEFAULT false, -- Current rate limit state
  last_updated timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT x_api_rate_limits_service_key UNIQUE (service)
);

-- Insert initial row for twitter service
INSERT INTO public.x_api_rate_limits (service, is_rate_limited)
VALUES ('twitter', false)
ON CONFLICT (service) DO NOTHING;

-- Add index for fast lookups
CREATE INDEX IF NOT EXISTS idx_x_api_rate_limits_service ON public.x_api_rate_limits(service);
