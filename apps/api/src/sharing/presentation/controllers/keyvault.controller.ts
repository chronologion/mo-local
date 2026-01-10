import { BadRequestException, Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { AuthIdentity } from '@access/auth-identity.decorator';
import { AuthenticatedIdentity } from '@access/application/authenticated-identity';
import { KratosSessionGuard } from '@access/presentation/guards/kratos-session.guard';
import { KeyVaultService } from '../../application/keyvault.service';
import { SequenceNumber } from '../../domain/value-objects/SequenceNumber';
import { PullKeyVaultDto } from '../dto/PullKeyVaultDto';

@Controller('keyvault')
@UseGuards(KratosSessionGuard)
export class KeyVaultController {
  constructor(@Inject(KeyVaultService) private readonly keyVaultService: KeyVaultService) {}

  @Get('updates')
  async getUpdates(@Query() dto: PullKeyVaultDto, @AuthIdentity() identity: AuthenticatedIdentity) {
    if (!identity) {
      throw new BadRequestException('Authenticated identity missing');
    }

    const since = SequenceNumber.from(dto.since ?? 0);
    const limit = dto.limit ?? 100;

    const result = await this.keyVaultService.getUpdateStream(identity.id, since, limit);

    return {
      records: result.records.map((record) => ({
        userId: record.userId,
        recordSeq: record.recordSeq.unwrap().toString(),
        prevHash: record.prevHash?.toString('hex') ?? null,
        recordHash: record.recordHash.toString('hex'),
        ciphertext: record.ciphertext.toString('base64'),
        metadata: record.metadata,
        createdAt: record.createdAt.toISOString(),
      })),
      hasMore: result.hasMore,
      head: result.head.unwrap().toString(),
      nextSince: result.nextSince?.unwrap().toString() ?? null,
    };
  }
}
