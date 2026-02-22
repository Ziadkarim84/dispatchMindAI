import { Response } from 'express';
import { randomUUID } from 'crypto';

interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta: {
    timestamp: string;
    requestId: string;
  };
}

interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta: {
    timestamp: string;
    requestId: string;
  };
}

function buildMeta() {
  return {
    timestamp: new Date().toISOString(),
    requestId: randomUUID(),
  };
}

export function sendSuccess<T>(res: Response, data: T, statusCode = 200): Response {
  const response: ApiSuccessResponse<T> = {
    success: true,
    data,
    meta: buildMeta(),
  };
  return res.status(statusCode).json(response);
}

export function sendCreated<T>(res: Response, data: T): Response {
  return sendSuccess(res, data, 201);
}

export function sendError(
  res: Response,
  code: string,
  message: string,
  statusCode = 500,
  details?: unknown
): Response {
  const response: ApiErrorResponse = {
    success: false,
    error: { code, message, ...(details !== undefined ? { details } : {}) },
    meta: buildMeta(),
  };
  return res.status(statusCode).json(response);
}
