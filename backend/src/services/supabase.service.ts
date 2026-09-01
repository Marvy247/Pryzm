import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config/env.config';
import { RunSchema, UserSchema } from '../types/validation';
import { z } from 'zod';

// Database types based on our schema
export type DbRun = {
  id?: string;
  type: 'signal' | 'intel' | 'skip' | 'deep_dive';
  content: any;
  public_posted_at?: string | null;
  telegram_delivered_at?: string | null;
  confidence_score?: number | null;
  cycle_started_at?: string;
  cycle_completed_at?: string | null;
  execution_time_ms?: number | null;
  error_message?: string | null;
  created_at?: string;
};

export type DbIqAiLog = {
  id?: string;
  content: string;
  type: 'Agent' | 'Developer';
  tx_hash?: string | null;
  chain_id?: string | null;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  retry_count?: number;
  error_message?: string | null;
  created_at?: string;
  updated_at?: string;
};

export class SupabaseService {
  private client: SupabaseClient;

  constructor() {
    if (!config.SUPABASE_URL || !config.SUPABASE_SERVICE_KEY) {
      console.warn('⚠️ Supabase credentials missing. Database service will not function.');
    }

    this.client = createClient(
      config.SUPABASE_URL || '',
      config.SUPABASE_SERVICE_KEY || '',
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );
  }

  public getClient(): SupabaseClient {
    return this.client;
  }

  async createRun(runData: DbRun) {
    const { data, error } = await this.client
      .from('runs')
      .insert(runData)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async updateRun(id: string, updates: Partial<DbRun>) {
    const { data, error } = await this.client
      .from('runs')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async getLatestRun(cutoffTime?: string) {
    let query = this.client
      .from('runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1);

    if (cutoffTime) {
      query = query.lt('created_at', cutoffTime);
    }

    const { data, error } = await query.single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 is "no rows returned"
    return data;
  }

  async hasDeepDiveToday(): Promise<boolean> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();

    const { data, error } = await this.client
      .from('runs')
      .select('id')
      .eq('type', 'deep_dive')
      .gte('created_at', todayISO)
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error checking for deep dive today:', error);
      return false;
    }

    return !!data;
  }

  async getUser(walletAddress: string) {
    const { data, error } = await this.client
      .from('users')
      .select('*')
      .eq('wallet_address', walletAddress)
      .single();

    if (error) return null;
    return data;
  }

  async getUserByTelegramId(telegramId: number) {
    const { data, error } = await this.client
      .from('users')
      .select('*')
      .eq('telegram_user_id', telegramId)
      .single();

    if (error) return null;
    return data;
  }

  async getSubscribedUsers() {
    // Fetch users who have a telegram_user_id (meaning they verified/started bot)
    // and have a tier other than NONE (optional, but makes sense for "signals")
    const { data, error } = await this.client
      .from('users')
      .select('telegram_user_id, telegram_username, tier')
      .not('telegram_user_id', 'is', null);

    if (error) {
      console.error('Error fetching subscribed users:', error);
      return [];
    }
    return data;
  }

  async hasRecentSignal(symbol: string, days: number = 7): Promise<boolean> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const { data, error } = await this.client
      .from('runs')
      .select('content')
      .eq('type', 'signal')
      .gte('created_at', cutoffDate.toISOString())
      .filter('content->token->>symbol', 'eq', symbol);

    if (error) {
      console.error('Error checking recent signals:', error);
      return false;
    }

    if (!data || data.length === 0) return false;

    // Check if any of the found signals are still active
    // We consider a signal active if it's NOT in a closed state (tp_hit, sl_hit, closed)
    const hasActive = data.some((run: any) => {
      const status = run.content?.status;
      return !['tp_hit', 'sl_hit', 'closed'].includes(status);
    });

    return hasActive;
  }

  /**
   * Get all symbols that currently have active (non-closed) signals
   * Active means the signal is not in a closed state (tp_hit, sl_hit, closed)
   */
  async getActiveSignalSymbols(): Promise<string[]> {
    const { data, error } = await this.client
      .from('runs')
      .select('content')
      .eq('type', 'signal');

    if (error) {
      console.error('Error fetching active signal symbols:', error);
      return [];
    }

    if (!data || data.length === 0) return [];

    // Filter for active signals and extract unique symbols
    const activeSymbols = new Set<string>();
    for (const run of data) {
      const status = run.content?.status;
      const symbol = run.content?.token?.symbol;
      // Active if NOT in closed state
      if (symbol && !['tp_hit', 'sl_hit', 'closed'].includes(status)) {
        activeSymbols.add(symbol);
      }
    }

    return Array.from(activeSymbols);
  }

  async getRecentSignalCount(hours: number = 24): Promise<number> {
    const timeAgo = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    // Only count signals that were actually published (have telegram_delivered_at)
    // This excludes pending signals that haven't triggered yet
    const { count, error } = await this.client
      .from('runs')
      .select('*', { count: 'exact', head: true })
      .eq('type', 'signal')
      .not('telegram_delivered_at', 'is', null)
      .gte('created_at', timeAgo);

    if (error) {
      console.error('Error fetching recent signal count:', error);
      return 0;
    }

    return count || 0;
  }

  async getRecentIntelTopics(limit: number = 5): Promise<string[]> {
    const { data, error } = await this.client
      .from('runs')
      .select('content')
      .eq('type', 'intel')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching recent intel topics:', error);
      return [];
    }

    return data.map((row: any) => row.content?.topic).filter(Boolean);
  }

  async getLogs(limit: number = 10, offset: number = 0, cutoffTime?: string) {
    let query = this.client
      .from('runs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (cutoffTime) {
      query = query.lt('created_at', cutoffTime);
    }

    const { data, error, count } = await query;

    if (error) throw error;
    return { data, count };
  }

  async upsertUser(userData: {
    wallet_address: string;
    tier?: string;
    rge_balance_usd?: number;
    last_verified_at?: string;
    telegram_user_id?: number;
    telegram_username?: string;
  }) {
    const { data, error } = await this.client
      .from('users')
      .upsert(userData, { onConflict: 'wallet_address' })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Get the tier for a user
   */
  async getEffectiveTier(walletAddress: string): Promise<string> {
    const user = await this.getUser(walletAddress);
    if (!user) return 'NONE';
    return user.tier || 'NONE';
  }

  async getCustomRequestsCount(walletAddress: string, since: string) {
    const { count, error } = await this.client
      .from('custom_requests')
      .select('*', { count: 'exact', head: true })
      .eq('user_wallet_address', walletAddress)
      .gte('requested_at', since);

    if (error) throw error;
    return count || 0;
  }

  async createCustomRequest(requestData: {
    user_wallet_address: string;
    token_symbol: string;
    token_contract?: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
  }) {
    const { data, error } = await this.client
      .from('custom_requests')
      .insert(requestData)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async updateCustomRequest(id: string, updates: any) {
    const { data, error } = await this.client
      .from('custom_requests')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async getCustomRequest(id: string) {
    const { data, error } = await this.client
      .from('custom_requests')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  async getLatestSignal(cutoffTime?: string) {
    let query = this.client
      .from('runs')
      .select('*')
      .eq('type', 'signal')
      .order('created_at', { ascending: false })
      .limit(1);

    if (cutoffTime) {
      query = query.lt('created_at', cutoffTime);
    }

    const { data, error } = await query.single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  async getLatestIntel(cutoffTime?: string) {
    let query = this.client
      .from('runs')
      .select('*')
      .in('type', ['intel', 'deep_dive'])
      .order('created_at', { ascending: false })
      .limit(1);

    if (cutoffTime) {
      query = query.lt('created_at', cutoffTime);
    }

    const { data, error } = await query.single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  async getRecentPosts(limit: number = 10): Promise<string[]> {
    const { data, error } = await this.client
      .from('runs')
      .select('content')
      .in('type', ['signal', 'intel'])
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching recent posts:', error);
      return [];
    }

    return data.map((row: any) => {
      if (row.content?.formatted_tweet) return row.content.formatted_tweet;
      if (row.content?.insight) return row.content.insight;
      return null;
    }).filter(Boolean);
  }

  // Scheduled Posts Methods
  async createScheduledPost(postData: {
    run_id: string;
    tier: 'SILVER' | 'GOLD' | 'DIAMOND' | 'PUBLIC';
    content: string;
    scheduled_for: string;
  }) {
    const { data, error } = await this.client
      .from('scheduled_posts')
      .insert(postData)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async getPendingScheduledPosts() {
    const now = new Date().toISOString();

    const { data, error } = await this.client
      .from('scheduled_posts')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_for', now)
      .order('scheduled_for', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  async updateScheduledPost(id: string, updates: {
    status?: 'pending' | 'posted' | 'failed';
    posted_at?: string;
    error_message?: string;
    content?: string;
  }) {
    const { data, error } = await this.client
      .from('scheduled_posts')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async saveYieldOpportunities(opportunities: any[]) {
    const { data, error } = await this.client
      .from('yield_opportunities')
      .upsert(opportunities, { onConflict: 'pool_id' })
      .select();

    if (error) throw error;
    return data;
  }

  async getLatestYieldOpportunities(page = 1, limit = 10) {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await this.client
      .from('yield_opportunities')
      .select('*', { count: 'exact' })
      .order('apy', { ascending: false })
      .range(from, to);

    if (error) throw error;

    return {
      opportunities: data,
      pagination: {
        page,
        limit,
        total: count,
        pages: Math.ceil((count || 0) / limit)
      }
    };
  }

  async saveAirdrops(airdrops: any[]) {
    const { data, error } = await this.client
      .from('airdrops')
      .upsert(airdrops, { onConflict: 'link_dashboard' })
      .select();

    if (error) throw error;
    return data;
  }

  async getAirdrops(page = 1, limit = 10) {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await this.client
      .from('airdrops')
      .select('*', { count: 'exact' })
      .order('rogue_score', { ascending: false })
      .range(from, to);

    if (error) throw error;
    return { airdrops: data, total: count };
  }

  // ===== NEW METHODS FOR DATA VERIFICATION & REPLACEMENT =====

  /**
   * Get ALL airdrops from database (for agent verification)
   */
  async getAllAirdrops() {
    const { data, error } = await this.client
      .from('airdrops')
      .select('*')
      .order('rogue_score', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  /**
   * Replace ALL airdrops with new verified list
   * Clears existing data and inserts new data
   */
  async replaceAllAirdrops(airdrops: any[]) {
    // First, delete all existing airdrops
    const { error: deleteError } = await this.client
      .from('airdrops')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all (workaround for no .deleteAll())

    if (deleteError) throw deleteError;

    // If no new airdrops, just return empty
    if (!airdrops || airdrops.length === 0) {
      return [];
    }

    // Insert new airdrops
    const { data, error: insertError } = await this.client
      .from('airdrops')
      .insert(airdrops)
      .select();

    if (insertError) throw insertError;
    return data;
  }

  /**
   * Get ALL yield opportunities from database (for agent verification)
   */
  async getAllYieldOpportunities() {
    const { data, error } = await this.client
      .from('yield_opportunities')
      .select('*')
      .order('apy', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  /**
   * Replace ALL yield opportunities with new verified list
   */
  async replaceAllYieldOpportunities(opportunities: any[]) {
    // Delete all existing
    const { error: deleteError } = await this.client
      .from('yield_opportunities')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (deleteError) throw deleteError;

    if (!opportunities || opportunities.length === 0) {
      return [];
    }

    const { data, error: insertError } = await this.client
      .from('yield_opportunities')
      .insert(opportunities)
      .select();

    if (insertError) throw insertError;
    return data;
  }

  /**
   * Get ALL prediction markets from database (for agent verification)
   */
  async getAllPredictionMarkets() {
    const { data, error } = await this.client
      .from('prediction_markets_cache')
      .select('*')
      .eq('is_active', true)
      .order('confidence_score', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  /**
   * Replace ALL prediction markets with new verified list
   */
  async replaceAllPredictionMarkets(markets: any[]) {
    // Delete all existing
    const { error: deleteError } = await this.client
      .from('prediction_markets_cache')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (deleteError) throw deleteError;

    if (!markets || markets.length === 0) {
      return [];
    }

    const { data, error: insertError } = await this.client
      .from('prediction_markets_cache')
      .insert(markets)
      .select();

    if (insertError) throw insertError;
    return data;
  }

  async getRunById(id: string) {
    const { data, error } = await this.client
      .from('runs')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  async createIqAiLog(logData: DbIqAiLog) {
    const { data, error } = await this.client
      .from('iqai_logs')
      .insert(logData)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async getPendingIqAiLogs() {
    const { data, error } = await this.client
      .from('iqai_logs')
      .select('*')
      .in('status', ['pending', 'failed'])
      .lt('retry_count', 5) // Max retries
      .order('created_at', { ascending: true })
      .limit(10); // Process in batches

    if (error) throw error;
    return data;
  }

  async updateIqAiLog(id: string, updates: Partial<DbIqAiLog>) {
    const { data, error } = await this.client
      .from('iqai_logs')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async getRecentSignals(limit: number = 5) {
    const { data, error } = await this.client
      .from('runs')
      .select('content, created_at')
      .eq('type', 'signal')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data;
  }

  async getRecentIntels(limit: number = 5) {
    const { data, error } = await this.client
      .from('runs')
      .select('content, created_at')
      .in('type', ['intel', 'deep_dive'])
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data;
  }
}

export const supabaseService = new SupabaseService();
