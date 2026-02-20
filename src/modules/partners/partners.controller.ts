import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '@common/utils/response.util';
import { ValidationError } from '@common/errors/validation.error';
import { partnerOptimizeSchema } from './partners.schema';
import { getOptimalPartner } from './partners.service';

export async function optimizePartner(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = partnerOptimizeSchema.safeParse(req.query);
    if (!parsed.success) throw new ValidationError('Invalid query params', parsed.error.flatten());

    const ranking = await getOptimalPartner(parsed.data);
    sendSuccess(res, ranking);
  } catch (err) {
    next(err);
  }
}
