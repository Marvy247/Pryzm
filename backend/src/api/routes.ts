import { Router } from 'express';
import { eventContractsController } from './event-contracts.controller';
import * as healthController from './health.controller';

const router = Router();

// Health check
router.get('/health', healthController.healthCheck);

// Event Contracts (DreamDEX / Somnia)
router.use('/ec', eventContractsController);

export default router;
