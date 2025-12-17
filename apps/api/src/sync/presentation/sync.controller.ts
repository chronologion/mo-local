import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { EventSequenceNumber, LiveStoreEvent } from '@livestore/common/schema';
import { AuthIdentity } from '@access/auth-identity.decorator';
import { AuthenticatedIdentity } from '@access/application/authenticated-identity';
import { KratosSessionGuard } from '@access/presentation/guards/kratos-session.guard';
import { SyncService, PushValidationError } from '../application/sync.service';
import { GlobalSequenceNumber } from '../domain/value-objects/GlobalSequenceNumber';
import { SyncOwnerId } from '../domain/value-objects/SyncOwnerId';
import { SyncStoreId } from '../domain/value-objects/SyncStoreId';
import { PullEventsDto } from './dto/PullEventsDto';
import { PushEventsDto } from './dto/PushEventsDto';

@Controller('sync')
@UseGuards(KratosSessionGuard)
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post('push')
  async push(
    @Body() dto: PushEventsDto,
    @AuthIdentity() identity: AuthenticatedIdentity
  ) {
    if (!identity) {
      throw new BadRequestException('Authenticated identity missing');
    }

    try {
      const ownerId = SyncOwnerId.from(identity.id);
      const storeId = SyncStoreId.from(dto.storeId);
      const events = dto.events.map<LiveStoreEvent.Global.Encoded>((event) => ({
        name: event.name,
        args: event.args,
        seqNum: EventSequenceNumber.Global.make(event.seqNum),
        parentSeqNum: EventSequenceNumber.Global.make(event.parentSeqNum),
        clientId: event.clientId,
        sessionId: event.sessionId,
      }));

      const result = await this.syncService.pushEvents({
        ownerId,
        storeId,
        events,
      });

      return { ok: true, lastSeqNum: result.lastSeqNum.unwrap() };
    } catch (error) {
      if (error instanceof PushValidationError) {
        const message =
          error.message ??
          'Sync push failed due to validation or sequence conflict';
        if (message.toLowerCase().includes('duplicate')) {
          throw new ConflictException(message);
        }
        throw new BadRequestException(message);
      }
      throw error;
    }
  }

  @Get('pull')
  async pull(
    @Query() dto: PullEventsDto,
    @AuthIdentity() identity: AuthenticatedIdentity
  ) {
    if (!identity) {
      throw new BadRequestException('Authenticated identity missing');
    }
    const ownerId = SyncOwnerId.from(identity.id);
    const storeId = SyncStoreId.from(dto.storeId);
    const since = GlobalSequenceNumber.from(dto.since ?? 0);
    const limit = dto.limit ?? 100;

    const { events, head } = await this.syncService.pullEvents({
      ownerId,
      storeId,
      since,
      limit,
    });

    const responseEvents = events.map((event) => ({
      name: event.name,
      args: event.args,
      seqNum: event.seqNum.unwrap(),
      parentSeqNum: event.parentSeqNum.unwrap(),
      clientId: event.clientId,
      sessionId: event.sessionId,
    }));

    return {
      events: responseEvents,
      hasMore:
        responseEvents.length > 0 &&
        responseEvents.length === limit &&
        head.unwrap() > since.unwrap(),
      headSeqNum: head.unwrap(),
    };
  }
}
