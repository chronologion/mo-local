import { Injectable } from '@nestjs/common';
import { DatabaseService } from '@platform/infrastructure/database/database.service';
import { SyncDatabase } from './database.types';

@Injectable()
export class SyncDatabaseService extends DatabaseService<SyncDatabase> {}
