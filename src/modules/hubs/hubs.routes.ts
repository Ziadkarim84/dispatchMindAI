import { Router } from 'express';
import { hubModelAdvice, hubProfitability } from './hubs.controller';

const router = Router();

router.get('/:hubId/profitability', hubProfitability);
router.get('/:hubId/model-advice', hubModelAdvice);

export { router as hubsRouter };
