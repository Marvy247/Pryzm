export interface IntelDataPoints {
  mindshare_surge?: string;
  whale_activity?: string;
  sentiment_score?: number;
  [key: string]: string | number | undefined;
}

export interface IntelContent {
  narrative?: string;
  topic?: string;
  insights?: string[];
  data_points?: IntelDataPoints;
  formatted_thread?: string; 
  tweet_text?: string;
  blog_post?: string;
  long_form_content?: string;
  headline?: string;
  tldr?: string;
  image_prompt?: string;
  image_url?: string;
}

export interface IntelRun {
  id: string;
  type: 'intel';
  content: IntelContent;
  public_posted_at: string | null;
  telegram_delivered_at: string | null;
  confidence_score: null;
  cycle_started_at: string;
  cycle_completed_at: string | null;
  execution_time_ms: number | null;
  error_message: string | null;
  created_at: string;
}
