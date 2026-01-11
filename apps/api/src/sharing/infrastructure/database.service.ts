import { Injectable } from '@nestjs/common';
import { DatabaseService } from '@platform/infrastructure/database/database.service';
import { SharingDatabase } from './database.types';

@Injectable()
export class SharingDatabaseService extends DatabaseService<SharingDatabase> {}
