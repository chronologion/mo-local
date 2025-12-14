import { Injectable } from '@nestjs/common';
import { DatabaseService } from '@platform/infrastructure/database/database.service';
import { AccessDatabase } from './database.types';

@Injectable()
export class AccessDatabaseService extends DatabaseService<AccessDatabase> {}
