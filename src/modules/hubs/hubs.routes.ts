import { Router } from 'express';
import {
  hubModelAdvice,
  hubProfitability,
  getHubCostsHandler,
  upsertHubCostHandler,
  listHubs,
} from './hubs.controller';

const router = Router();

router.get('/', listHubs);
router.get('/:hubId/profitability', hubProfitability);
router.get('/:hubId/model-advice', hubModelAdvice);
router.get('/:hubId/costs', getHubCostsHandler);
router.post('/:hubId/costs', upsertHubCostHandler);

export { router as hubsRouter };
