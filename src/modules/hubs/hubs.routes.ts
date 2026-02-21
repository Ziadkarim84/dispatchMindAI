import { Router } from 'express';
import {
  hubModelAdvice,
  hubProfitability,
  getHubCostsHandler,
  upsertHubCostHandler,
  listHubs,
  hubSummaryHandler,
  assignPartnersHandler,
} from './hubs.controller';

const router = Router();

// Summary routes — must be before /:hubId to avoid param conflicts
router.get('/summary', hubSummaryHandler);
router.post('/assign-partners', assignPartnersHandler);

router.get('/', listHubs);
router.get('/:hubId/profitability', hubProfitability);
router.get('/:hubId/model-advice', hubModelAdvice);
router.get('/:hubId/costs', getHubCostsHandler);
router.post('/:hubId/costs', upsertHubCostHandler);

export { router as hubsRouter };
