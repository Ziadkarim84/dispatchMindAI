import { BaseError } from './base.error';

export class InternalServerError extends BaseError {
  constructor(message = 'An unexpected error occurred') {
    super(message, 500, 'INTERNAL_SERVER_ERROR', false);
  }
}
