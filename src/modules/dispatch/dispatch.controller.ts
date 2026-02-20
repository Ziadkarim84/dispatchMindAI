import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '@common/utils/response.util';
import { ValidationError } from '@common/errors/validation.error';
import { dispatchRecommendSchema } from './dispatch.schema';
import { getDispatchRecommendation, dispatchHistory } from './dispatch.service';

export async function recommendDispatch(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = dispatchRecommendSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid request body', parsed.error.flatten());

    const decision = await getDispatchRecommendation(parsed.data);
    sendSuccess(res, decision);
  } catch (err) {
    next(err);
  }
}

export async function getDispatchHistory(_req: Request, res: Response, next: NextFunction) {
  try {
    sendSuccess(res, dispatchHistory.slice(-50).reverse());
  } catch (err) {
    next(err);
  }
}
