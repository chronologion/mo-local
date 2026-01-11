import { BadRequestException, Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuthIdentity } from '@access/auth-identity.decorator';
import { AuthenticatedIdentity } from '@access/application/authenticated-identity';
import { KratosSessionGuard } from '@access/presentation/guards/kratos-session.guard';
import { ScopeService } from '../../application/scope.service';
import { ScopeId } from '../../domain/value-objects/ScopeId';
import { EnvelopeId } from '../../domain/value-objects/EnvelopeId';
import { SequenceNumber } from '../../domain/value-objects/SequenceNumber';
import { UserId } from '../../domain/value-objects/UserId';
import { CreateInviteDto } from '../dto/CreateInviteDto';
import { GetScopeKeyDto } from '../dto/GetScopeKeyDto';
import { PullMembershipDto } from '../dto/PullMembershipDto';

@Controller('scopes')
@UseGuards(KratosSessionGuard)
export class ScopeController {
  constructor(@Inject(ScopeService) private readonly scopeService: ScopeService) {}

  @Post(':scopeId/invites')
  async createInvite(
    @Param('scopeId') scopeIdParam: string,
    @Body() dto: CreateInviteDto,
    @AuthIdentity() identity: AuthenticatedIdentity
  ) {
    if (!identity) {
      throw new BadRequestException('Authenticated identity missing');
    }

    const scopeId = ScopeId.from(scopeIdParam);
    const envelopeId = EnvelopeId.from(randomUUID());

    await this.scopeService.createEnvelope({
      envelopeId,
      scopeId,
      recipientUserId: UserId.from(dto.recipientUserId),
      scopeEpoch: BigInt(dto.scopeEpoch),
      recipientUkPubFingerprint: Buffer.from(dto.recipientUkPubFingerprint, 'hex'),
      ciphersuite: dto.ciphersuite,
      ciphertext: Buffer.from(dto.ciphertext, 'base64'),
      metadata: dto.metadata ? JSON.parse(dto.metadata) : null,
    });

    return { ok: true, envelopeId: envelopeId.unwrap() };
  }

  @Get(':scopeId/key')
  async getScopeKey(
    @Param('scopeId') scopeIdParam: string,
    @Query() dto: GetScopeKeyDto,
    @AuthIdentity() identity: AuthenticatedIdentity
  ) {
    if (!identity) {
      throw new BadRequestException('Authenticated identity missing');
    }

    const scopeId = ScopeId.from(scopeIdParam);
    const scopeEpoch = dto.scopeEpoch ? BigInt(dto.scopeEpoch) : undefined;

    const envelopes = await this.scopeService.getEnvelopes(scopeId, UserId.from(identity.id), scopeEpoch);

    return {
      envelopes: envelopes.map((envelope) => ({
        envelopeId: envelope.envelopeId.unwrap(),
        scopeId: envelope.scopeId.unwrap(),
        recipientUserId: envelope.recipientUserId.unwrap(),
        scopeEpoch: envelope.scopeEpoch.toString(),
        recipientUkPubFingerprint: envelope.recipientUkPubFingerprint.toString('hex'),
        ciphersuite: envelope.ciphersuite,
        ciphertext: envelope.ciphertext.toString('base64'),
        metadata: envelope.metadata,
        createdAt: envelope.createdAt.toISOString(),
      })),
    };
  }

  @Get(':scopeId/membership')
  async getMembership(
    @Param('scopeId') scopeIdParam: string,
    @Query() dto: PullMembershipDto,
    @AuthIdentity() identity: AuthenticatedIdentity
  ) {
    if (!identity) {
      throw new BadRequestException('Authenticated identity missing');
    }

    const scopeId = ScopeId.from(scopeIdParam);
    const since = SequenceNumber.from(dto.since ?? 0);
    const limit = dto.limit ?? 100;

    const result = await this.scopeService.getMembershipStream(scopeId, since, limit);

    return {
      states: result.states.map((state) => ({
        scopeId: state.scopeId.unwrap(),
        scopeStateSeq: state.scopeStateSeq.unwrap().toString(),
        prevHash: state.prevHash?.toString('hex') ?? null,
        scopeStateRef: state.scopeStateRef.toString('hex'),
        ownerUserId: state.ownerUserId.unwrap(),
        scopeEpoch: state.scopeEpoch.toString(),
        signedRecordCbor: state.signedRecordCbor.toString('base64'),
        members: state.members,
        signers: state.signers,
        sigSuite: state.sigSuite,
        signature: state.signature.toString('base64'),
        createdAt: state.createdAt.toISOString(),
      })),
      hasMore: result.hasMore,
      nextSince: result.nextSince?.unwrap().toString() ?? null,
    };
  }
}
