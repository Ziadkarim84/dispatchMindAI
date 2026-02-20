import { Router } from 'express';
import { recommendDispatch } from './dispatch.controller';

const router = Router();

router.post('/recommend', recommendDispatch);

export { router as dispatchRouter };
