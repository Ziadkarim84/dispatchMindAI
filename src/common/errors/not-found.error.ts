import { BaseError } from './base.error';

export class NotFoundError extends BaseError {
  constructor(resource: string, identifier: string) {
    super(`${resource} with ID ${identifier} not found`, 404, 'NOT_FOUND');
  }
}
