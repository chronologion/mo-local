import { AuthenticatedUser } from '../../domain/authenticated-user';

declare module 'express-serve-static-core' {
  interface Request {
    authUser?: AuthenticatedUser;
  }
}
