export class ApplicationError extends Error {
  constructor(message: string, readonly code: string = 'application_error') {
    super(message);
    this.name = 'ApplicationError';
  }
}
