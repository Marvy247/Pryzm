import { Request, Response } from 'express';
import { supabaseService } from '../services/supabase.service';
import { config } from '../config/env.config';

export const healthCheck = async (req: Request, res: Response) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: config.NODE_ENV,
    services: {
      database: 'unknown',
    }
  };

  try {
    // Check database connection
    const { error } = await supabaseService.getClient().from('ec_runs').select('id').limit(1);
    health.services.database = error ? 'down' : 'up';
    
    if (error) {
      res.status(503).json(health);
      return;
    }

    res.json(health);
  } catch (error) {
    health.status = 'error';
    health.services.database = 'down';
    res.status(503).json(health);
  }
};
