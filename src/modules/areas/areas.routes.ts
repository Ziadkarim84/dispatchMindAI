import { Router } from 'express';
import { listAreas } from './areas.controller';

const router = Router();

router.get('/', listAreas);

export { router as areasRouter };
