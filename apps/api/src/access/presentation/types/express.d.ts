import { AuthenticatedIdentity } from '../../application/authenticated-identity';

declare module 'express-serve-static-core' {
  interface Request {
    authIdentity?: AuthenticatedIdentity;
  }
}
