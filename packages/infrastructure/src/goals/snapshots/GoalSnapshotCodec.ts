import {
  GoalId,
  Summary,
  Slice,
  SliceValue,
  ALL_SLICES,
  Priority,
  PriorityLevel,
  Month,
  UserId,
  Timestamp,
  type GoalSnapshot,
} from '@mo/domain';
import type { GoalSnapshotState } from '../projections/model/GoalProjectionState';
import { decodeSnapshotEnvelope, encodeSnapshotEnvelope } from '../../snapshots/snapshotEnvelope';

const SNAPSHOT_VERSION = 2;

type GoalSnapshotPayloadV1 = {
  id: string;
  summary: string;
  slice: SliceValue;
  priority: PriorityLevel;
  targetMonth: string;
  createdBy: string;
  createdAt: number;
  archivedAt: number | null;
  version: number;
};

type GoalSnapshotPayloadV2 = GoalSnapshotPayloadV1 & {
  achievedAt: number | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const requireString = (value: unknown, label: string): string => {
  if (typeof value === 'string') return value;
  throw new Error(`Goal snapshot ${label} must be a string`);
};

const requireNumber = (value: unknown, label: string): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  throw new Error(`Goal snapshot ${label} must be a number`);
};

const requireNullableNumber = (value: unknown, label: string): number | null => {
  if (value === null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  throw new Error(`Goal snapshot ${label} must be a number or null`);
};

const requireSlice = (value: unknown): SliceValue => {
  if (typeof value !== 'string') {
    throw new Error('Goal snapshot slice must be a string');
  }
  const match = ALL_SLICES.find((slice) => slice === value);
  if (!match) {
    throw new Error(`Goal snapshot slice must be one of ${ALL_SLICES.join(', ')}`);
  }
  return match;
};

const requirePriority = (value: unknown): PriorityLevel => {
  if (typeof value !== 'string') {
    throw new Error('Goal snapshot priority must be a string');
  }
  const levels: PriorityLevel[] = ['must', 'should', 'maybe'];
  const match = levels.find((level) => level === value);
  if (!match) {
    throw new Error(`Goal snapshot priority must be one of ${levels.join(', ')}`);
  }
  return match;
};

const parsePayloadV1 = (data: unknown): GoalSnapshotPayloadV1 => {
  if (!isRecord(data)) {
    throw new Error('Goal snapshot payload must be an object');
  }

  return {
    id: requireString(data.id, 'id'),
    summary: requireString(data.summary, 'summary'),
    slice: requireSlice(data.slice),
    priority: requirePriority(data.priority),
    targetMonth: requireString(data.targetMonth, 'targetMonth'),
    createdBy: requireString(data.createdBy, 'createdBy'),
    createdAt: requireNumber(data.createdAt, 'createdAt'),
    archivedAt: requireNullableNumber(data.archivedAt, 'archivedAt'),
    version: requireNumber(data.version, 'version'),
  };
};

const parsePayloadV2 = (data: unknown): GoalSnapshotPayloadV2 => {
  if (!isRecord(data)) {
    throw new Error('Goal snapshot payload must be an object');
  }
  return {
    ...parsePayloadV1(data),
    achievedAt: requireNullableNumber(data.achievedAt, 'achievedAt'),
  };
};

const upcastGoalSnapshot = (snapshotVersion: number, data: unknown): GoalSnapshotPayloadV2 => {
  if (snapshotVersion === 1) {
    const v1 = parsePayloadV1(data);
    return {
      ...v1,
      achievedAt: null,
    };
  }
  if (snapshotVersion === 2) {
    return parsePayloadV2(data);
  }
  throw new Error(`Unsupported goal snapshot version ${snapshotVersion}`);
};

const toPayloadV1 = (snapshot: GoalSnapshotState): GoalSnapshotPayloadV2 => ({
  id: snapshot.id,
  summary: snapshot.summary,
  slice: snapshot.slice,
  priority: snapshot.priority,
  targetMonth: snapshot.targetMonth,
  createdBy: snapshot.createdBy,
  createdAt: snapshot.createdAt,
  achievedAt: snapshot.achievedAt,
  archivedAt: snapshot.archivedAt,
  version: snapshot.version,
});

export const encodeGoalSnapshotState = (snapshot: GoalSnapshotState): Uint8Array =>
  encodeSnapshotEnvelope({
    snapshotVersion: SNAPSHOT_VERSION,
    data: toPayloadV1(snapshot),
  });

export const decodeGoalSnapshotState = (payload: Uint8Array, aggregateVersion: number): GoalSnapshotState => {
  const { snapshotVersion, data } = decodeSnapshotEnvelope(payload);
  const parsed = upcastGoalSnapshot(snapshotVersion, data);
  return {
    id: parsed.id,
    summary: parsed.summary,
    slice: parsed.slice,
    priority: parsed.priority,
    targetMonth: parsed.targetMonth,
    createdBy: parsed.createdBy,
    createdAt: parsed.createdAt,
    achievedAt: parsed.achievedAt,
    archivedAt: parsed.archivedAt,
    version: aggregateVersion,
  };
};

export const decodeGoalSnapshotDomain = (payload: Uint8Array, aggregateVersion: number): GoalSnapshot => {
  const snapshot = decodeGoalSnapshotState(payload, aggregateVersion);
  return {
    id: GoalId.from(snapshot.id),
    summary: Summary.from(snapshot.summary),
    slice: Slice.from(snapshot.slice),
    priority: Priority.from(snapshot.priority),
    targetMonth: Month.from(snapshot.targetMonth),
    createdBy: UserId.from(snapshot.createdBy),
    createdAt: Timestamp.fromMillis(snapshot.createdAt),
    achievedAt: snapshot.achievedAt === null ? null : Timestamp.fromMillis(snapshot.achievedAt),
    archivedAt: snapshot.archivedAt === null ? null : Timestamp.fromMillis(snapshot.archivedAt),
    version: snapshot.version,
  };
};
