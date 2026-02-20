import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '@common/utils/response.util';
import { ValidationError } from '@common/errors/validation.error';
import { hubParamsSchema } from './hubs.schema';
import { getHubModelAdvice, getHubProfitability } from './hubs.service';

export async function hubProfitability(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = hubParamsSchema.safeParse(req.params);
    if (!parsed.success) throw new ValidationError('Invalid hub ID', parsed.error.flatten());

    const result = await getHubProfitability(parsed.data.hubId);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function hubModelAdvice(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = hubParamsSchema.safeParse(req.params);
    if (!parsed.success) throw new ValidationError('Invalid hub ID', parsed.error.flatten());

    const result = await getHubModelAdvice(parsed.data.hubId);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}
