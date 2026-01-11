import { BadRequestException, Controller, Get, Inject, Param, Query, UseGuards } from '@nestjs/common';
import { AuthIdentity } from '@access/auth-identity.decorator';
import { AuthenticatedIdentity } from '@access/application/authenticated-identity';
import { KratosSessionGuard } from '@access/presentation/guards/kratos-session.guard';
import { GrantService } from '../../application/grant.service';
import { ScopeId } from '../../domain/value-objects/ScopeId';
import { SequenceNumber } from '../../domain/value-objects/SequenceNumber';
import { PullGrantsDto } from '../dto/PullGrantsDto';

@Controller('scopes')
@UseGuards(KratosSessionGuard)
export class GrantController {
  constructor(@Inject(GrantService) private readonly grantService: GrantService) {}

  @Get(':scopeId/grants')
  async getGrants(
    @Param('scopeId') scopeIdParam: string,
    @Query() dto: PullGrantsDto,
    @AuthIdentity() identity: AuthenticatedIdentity
  ) {
    if (!identity) {
      throw new BadRequestException('Authenticated identity missing');
    }

    const scopeId = ScopeId.from(scopeIdParam);
    const since = SequenceNumber.from(dto.since ?? 0);
    const limit = dto.limit ?? 100;

    const result = await this.grantService.getGrantStream(scopeId, since, limit);

    return {
      grants: result.grants.map((grant) => ({
        grantId: grant.grantId.unwrap(),
        scopeId: grant.scopeId.unwrap(),
        resourceId: grant.resourceId.unwrap(),
        grantSeq: grant.grantSeq.unwrap().toString(),
        prevHash: grant.prevHash?.toString('hex') ?? null,
        grantHash: grant.grantHash.toString('hex'),
        scopeStateRef: grant.scopeStateRef.toString('hex'),
        scopeEpoch: grant.scopeEpoch.toString(),
        resourceKeyId: grant.resourceKeyId,
        wrappedKey: grant.wrappedKey.toString('base64'),
        policy: grant.policy,
        status: grant.status,
        signedGrantCbor: grant.signedGrantCbor.toString('base64'),
        sigSuite: grant.sigSuite,
        signature: grant.signature.toString('base64'),
        createdAt: grant.createdAt.toISOString(),
      })),
      hasMore: result.hasMore,
      nextSince: result.nextSince?.unwrap().toString() ?? null,
    };
  }
}
