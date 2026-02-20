import { Request, Response } from 'express';
import { sendError } from '../utils/response.util';

export function notFoundMiddleware(req: Request, res: Response): Response {
  return sendError(res, 'ROUTE_NOT_FOUND', `Route ${req.method} ${req.originalUrl} not found`, 404);
}
