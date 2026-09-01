import { createServer } from './server';
import { config } from './config/env.config';
import { logger } from './utils/logger.util';
import { dreamDexService } from './services/dreamdex.service';
import { ecOrchestrator } from './services/ec-orchestrator.service';

const app = createServer();
const port = config.PORT;

const server = app.listen(port, () => {
  logger.info(`Pryzm EC server running at http://localhost:${port}`);
  logger.info(`Environment: ${config.NODE_ENV}`);

  // Initialize DreamDEX SDK
  dreamDexService.initialize().catch(err =>
    logger.warn('DreamDEX SDK init failed (continuing without EC trading):', err)
  );

  // Start EC Settlement Timer (every 5 minutes)
  logger.info('Starting EC Settlement Timer');
  ecOrchestrator.startSettlementTimer();

  // Start EC Orchestrator cycle on interval
  const ecIntervalMs = config.EC_RUN_INTERVAL_MINUTES * 60 * 1000;
  logger.info(`Starting EC Orchestrator (Interval: ${config.EC_RUN_INTERVAL_MINUTES}m)`);
  setInterval(() => {
    ecOrchestrator.runCycle().catch(err =>
      logger.error('EC orchestrator cycle failed:', err)
    );
  }, ecIntervalMs);

  // Run once after 30 seconds to let everything initialize
  setTimeout(() => {
    ecOrchestrator.runCycle().catch(err =>
      logger.error('Initial EC cycle failed:', err)
    );
  }, 30_000);
});

// Graceful shutdown
const shutdown = async (signal: string) => {
  logger.info(`${signal} received. Shutting down gracefully...`);

  server.close(() => {
    logger.info('HTTP server closed.');
    process.exit(0);
  });

  // Force close after 10s
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10_000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
