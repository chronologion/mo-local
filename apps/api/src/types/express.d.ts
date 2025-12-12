import { AuthenticatedUser } from '../auth/auth.types';

declare module 'express-serve-static-core' {
  interface Request {
    authUser?: AuthenticatedUser;
  }
}
