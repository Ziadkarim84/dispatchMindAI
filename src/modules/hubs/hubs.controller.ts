import { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendCreated } from '@common/utils/response.util';
import { ValidationError } from '@common/errors/validation.error';
import { hubParamsSchema, hubCostBodySchema, hubCostQuerySchema } from './hubs.schema';
import {
  getHubModelAdvice,
  getHubProfitability,
  getHubCosts,
  upsertHubCost,
  getAllHubs,
} from './hubs.service';

export async function listHubs(_req: Request, res: Response, next: NextFunction) {
  try {
    const hubs = await getAllHubs();
    sendSuccess(res, hubs);
  } catch (err) {
    next(err);
  }
}

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

export async function getHubCostsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const params = hubParamsSchema.safeParse(req.params);
    if (!params.success) throw new ValidationError('Invalid hub ID', params.error.flatten());

    const queryParams = hubCostQuerySchema.safeParse(req.query);
    if (!queryParams.success) throw new ValidationError('Invalid query params', queryParams.error.flatten());

    const costs = await getHubCosts(
      params.data.hubId,
      queryParams.data.year,
      queryParams.data.month
    );
    sendSuccess(res, costs);
  } catch (err) {
    next(err);
  }
}

export async function upsertHubCostHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const params = hubParamsSchema.safeParse(req.params);
    if (!params.success) throw new ValidationError('Invalid hub ID', params.error.flatten());

    const body = hubCostBodySchema.safeParse(req.body);
    if (!body.success) throw new ValidationError('Invalid request body', body.error.flatten());

    const cost = await upsertHubCost({ hub_id: params.data.hubId, ...body.data });
    sendCreated(res, cost);
  } catch (err) {
    next(err);
  }
}
