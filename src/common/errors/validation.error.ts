import { BaseError } from './base.error';

export class ValidationError extends BaseError {
  constructor(message: string, details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', true, details);
  }
}
