import { Router } from 'express';
import { recommendDispatch, getDispatchHistory } from './dispatch.controller';

const router = Router();

router.post('/recommend', recommendDispatch);
router.get('/history', getDispatchHistory);

export { router as dispatchRouter };
