import { Request, Response, NextFunction } from 'express';
import { BaseError } from '../errors/base.error';
import { logger } from '../utils/logger.util';
import { sendError } from '../utils/response.util';

export function errorHandlerMiddleware(
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): Response {
  if (error instanceof BaseError) {
    if (!error.isOperational) {
      logger.error('Non-operational error', { error, path: req.path });
    }
    return sendError(res, error.code, error.message, error.statusCode, error.details);
  }

  logger.error('Unhandled error', { error, path: req.path, method: req.method });
  return sendError(res, 'INTERNAL_SERVER_ERROR', 'An unexpected error occurred', 500);
}
