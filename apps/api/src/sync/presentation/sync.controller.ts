import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthIdentity } from '@access/auth-identity.decorator';
import { AuthenticatedIdentity } from '@access/application/authenticated-identity';
import { KratosSessionGuard } from '@access/presentation/guards/kratos-session.guard';
import { SyncService } from '../application/sync.service';
import { GlobalSequenceNumber } from '../domain/value-objects/GlobalSequenceNumber';
import { SyncOwnerId } from '../domain/value-objects/SyncOwnerId';
import { SyncStoreId } from '../domain/value-objects/SyncStoreId';
import { PullEventsDto } from './dto/PullEventsDto';
import { PushEventsDto } from './dto/PushEventsDto';
import { SyncAccessDeniedError } from '../application/ports/sync-access-policy';

@Controller('sync')
@UseGuards(KratosSessionGuard)
export class SyncController {
  constructor(@Inject(SyncService) private readonly syncService: SyncService) {}

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
      const events = dto.events.map((event) => ({
        eventId: event.eventId,
        recordJson: event.recordJson,
      }));

      const result = await this.syncService.pushEvents({
        ownerId,
        storeId,
        expectedHead: GlobalSequenceNumber.from(dto.expectedHead),
        events,
      });

      if (!result.ok) {
        throw new ConflictException({
          ok: false,
          head: result.head.unwrap(),
          reason: result.reason,
          missing: result.missing?.map((event) => ({
            globalSequence: event.globalSequence.unwrap(),
            eventId: event.eventId,
            recordJson: event.recordJson,
          })),
        });
      }

      return {
        ok: true,
        head: result.head.unwrap(),
        assigned: result.assigned.map((assignment) => ({
          eventId: assignment.eventId,
          globalSequence: assignment.globalSequence.unwrap(),
        })),
      };
    } catch (error) {
      if (error instanceof SyncAccessDeniedError) {
        throw new ForbiddenException(error.message);
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
    const sinceValue = dto.since ?? 0;
    const limitValue = dto.limit ?? 100;
    const since = GlobalSequenceNumber.from(Number(sinceValue));
    const limit = Number(limitValue);

    const waitMs = dto.waitMs ?? 0;
    let { events, head } = await this.syncService.pullEvents({
      ownerId,
      storeId,
      since,
      limit,
    });

    if (events.length === 0 && waitMs > 0) {
      await delay(waitMs);
      const next = await this.syncService.pullEvents({
        ownerId,
        storeId,
        since,
        limit,
      });
      events = next.events;
      head = next.head;
    }

    const responseEvents = events.map((event) => ({
      globalSequence: event.globalSequence.unwrap(),
      eventId: event.eventId,
      recordJson: event.recordJson,
    }));
    const lastSequence =
      responseEvents.length > 0
        ? responseEvents[responseEvents.length - 1]?.globalSequence
        : null;

    return {
      events: responseEvents,
      hasMore:
        responseEvents.length > 0 &&
        responseEvents.length === limit &&
        head.unwrap() > (lastSequence ?? since.unwrap()),
      head: head.unwrap(),
      nextSince: lastSequence,
    };
  }
}

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
