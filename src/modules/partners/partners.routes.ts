import { Router } from 'express';
import { optimizePartner } from './partners.controller';

const router = Router();

router.get('/optimize', optimizePartner);

export { router as partnersRouter };
