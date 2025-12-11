import { makeWorker } from '@livestore/adapter-web/worker';
import { schema } from '../goals/schema';

makeWorker({ schema });
