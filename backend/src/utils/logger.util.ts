import { supabaseService } from '../services/supabase.service';

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

class Logger {
  private async logToDb(level: LogLevel, message: string, meta?: any) {
    // In a real production app, we might want to batch these or use a dedicated logging service
    // For this MVP, we'll just console log and optionally store critical errors in runs table if associated with a run
    // Or we could have a separate logs table, but that wasn't in the spec.
    // We'll stick to console for now as per standard 12-factor app patterns, 
    // and rely on the 'runs' table 'error_message' column for run-specific errors.
  }

  info(message: string, meta?: any) {
    console.log(`[INFO] ${message}`, meta ? JSON.stringify(meta) : '');
  }

  warn(message: string, meta?: any) {
    console.warn(`[WARN] ${message}`, meta ? JSON.stringify(meta) : '');
  }

  error(message: string, error?: any) {
    console.error(`[ERROR] ${message}`, error);
  }

  debug(message: string, meta?: any) {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(`[DEBUG] ${message}`, meta ? JSON.stringify(meta) : '');
    }
  }
}

export const logger = new Logger();
