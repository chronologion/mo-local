import { createAppServices } from '../../bootstrap/createAppServices';

export type Services = Awaited<ReturnType<typeof createAppServices>>;
