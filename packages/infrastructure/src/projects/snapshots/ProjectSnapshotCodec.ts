import {
  GoalId,
  LocalDate,
  Milestone,
  MilestoneId,
  MilestoneName,
  ProjectDescription,
  ProjectId,
  ProjectName,
  ProjectStatus,
  ProjectStatusValue,
  Timestamp,
  UserId,
  projectStatusValues,
  type ProjectSnapshot,
} from '@mo/domain';
import type {
  ProjectMilestoneState,
  ProjectSnapshotState,
} from '../projections/model/ProjectProjectionState';
import {
  decodeSnapshotEnvelope,
  encodeSnapshotEnvelope,
} from '../../snapshots/snapshotEnvelope';

const SNAPSHOT_VERSION = 1;

type ProjectSnapshotPayloadV1 = {
  id: string;
  name: string;
  status: ProjectStatusValue;
  startDate: string;
  targetDate: string;
  description: string;
  goalId: string | null;
  milestones?: Array<{ id: string; name: string; targetDate: string }>;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
  version?: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const requireString = (value: unknown, label: string): string => {
  if (typeof value === 'string') return value;
  throw new Error(`Project snapshot ${label} must be a string`);
};

const requireNonEmptyString = (value: unknown, label: string): string => {
  const raw = requireString(value, label).trim();
  if (raw.length === 0) {
    throw new Error(`Project snapshot ${label} must be a non-empty string`);
  }
  return raw;
};

const requireNumber = (value: unknown, label: string): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  throw new Error(`Project snapshot ${label} must be a number`);
};

const requireNullableNumber = (
  value: unknown,
  label: string
): number | null => {
  if (value === null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  throw new Error(`Project snapshot ${label} must be a number or null`);
};

const requireNullableString = (
  value: unknown,
  label: string
): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  throw new Error(`Project snapshot ${label} must be a string or null`);
};

const requireProjectStatus = (value: unknown): ProjectStatusValue => {
  if (typeof value !== 'string') {
    throw new Error('Project snapshot status must be a string');
  }
  const match = projectStatusValues.find((status) => status === value);
  if (!match) {
    throw new Error(
      `Project snapshot status must be one of ${projectStatusValues.join(', ')}`
    );
  }
  return match;
};

const parseMilestones = (value: unknown): ProjectMilestoneState[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item, idx) => {
    if (!isRecord(item)) {
      throw new Error(`Project snapshot milestones[${idx}] must be an object`);
    }
    return {
      id: requireString(item.id, `milestones[${idx}].id`),
      name: requireString(item.name, `milestones[${idx}].name`),
      targetDate: requireString(
        item.targetDate,
        `milestones[${idx}].targetDate`
      ),
    };
  });
};

const parsePayloadV1 = (data: unknown): ProjectSnapshotPayloadV1 => {
  if (!isRecord(data)) {
    throw new Error('Project snapshot payload must be an object');
  }
  return {
    id: requireString(data.id, 'id'),
    name: requireString(data.name, 'name'),
    status: requireProjectStatus(data.status),
    startDate: requireString(data.startDate, 'startDate'),
    targetDate: requireString(data.targetDate, 'targetDate'),
    description: requireString(data.description, 'description'),
    goalId: requireNullableString(data.goalId, 'goalId'),
    milestones: parseMilestones(data.milestones),
    createdBy: requireNonEmptyString(data.createdBy, 'createdBy'),
    createdAt: requireNumber(data.createdAt, 'createdAt'),
    updatedAt: requireNumber(data.updatedAt, 'updatedAt'),
    archivedAt: requireNullableNumber(data.archivedAt, 'archivedAt'),
    version:
      typeof data.version === 'number' && Number.isFinite(data.version)
        ? data.version
        : undefined,
  };
};

const upcastProjectSnapshot = (
  snapshotVersion: number,
  data: unknown
): ProjectSnapshotPayloadV1 => {
  if (snapshotVersion === 1) {
    return parsePayloadV1(data);
  }
  throw new Error(`Unsupported project snapshot version ${snapshotVersion}`);
};

const toPayloadV1 = (
  snapshot: ProjectSnapshotState
): ProjectSnapshotPayloadV1 => ({
  id: snapshot.id,
  name: snapshot.name,
  status: snapshot.status,
  startDate: snapshot.startDate,
  targetDate: snapshot.targetDate,
  description: snapshot.description,
  goalId: snapshot.goalId,
  milestones: snapshot.milestones,
  createdBy: snapshot.createdBy,
  createdAt: snapshot.createdAt,
  updatedAt: snapshot.updatedAt,
  archivedAt: snapshot.archivedAt,
  version: snapshot.version,
});

export const encodeProjectSnapshotPayload = (
  payload: ProjectSnapshotPayloadV1
): Uint8Array =>
  encodeSnapshotEnvelope({
    snapshotVersion: SNAPSHOT_VERSION,
    data: payload,
  });

export const encodeProjectSnapshotState = (
  snapshot: ProjectSnapshotState
): Uint8Array =>
  encodeSnapshotEnvelope({
    snapshotVersion: SNAPSHOT_VERSION,
    data: toPayloadV1(snapshot),
  });

export const decodeProjectSnapshotState = (
  payload: Uint8Array,
  aggregateVersion: number
): ProjectSnapshotState => {
  const { snapshotVersion, data } = decodeSnapshotEnvelope(payload);
  const parsed = upcastProjectSnapshot(snapshotVersion, data);
  return {
    id: parsed.id,
    name: parsed.name,
    status: parsed.status,
    startDate: parsed.startDate,
    targetDate: parsed.targetDate,
    description: parsed.description,
    goalId: parsed.goalId,
    milestones: parsed.milestones ?? [],
    createdBy: parsed.createdBy,
    createdAt: parsed.createdAt,
    updatedAt: parsed.updatedAt,
    archivedAt: parsed.archivedAt,
    version: aggregateVersion,
  };
};

export const decodeProjectSnapshotDomain = (
  payload: Uint8Array,
  aggregateVersion: number
): ProjectSnapshot => {
  const { snapshotVersion, data } = decodeSnapshotEnvelope(payload);
  const parsed = upcastProjectSnapshot(snapshotVersion, data);
  return {
    id: ProjectId.from(parsed.id),
    name: ProjectName.from(parsed.name),
    status: ProjectStatus.from(parsed.status),
    startDate: LocalDate.fromString(parsed.startDate),
    targetDate: LocalDate.fromString(parsed.targetDate),
    description: ProjectDescription.from(parsed.description),
    goalId: parsed.goalId ? GoalId.from(parsed.goalId) : null,
    milestones: (parsed.milestones ?? []).map((m) =>
      Milestone.create({
        id: MilestoneId.from(m.id),
        name: MilestoneName.from(m.name),
        targetDate: LocalDate.fromString(m.targetDate),
      })
    ),
    createdBy: UserId.from(parsed.createdBy),
    createdAt: Timestamp.fromMillis(parsed.createdAt),
    updatedAt: Timestamp.fromMillis(parsed.updatedAt),
    archivedAt:
      parsed.archivedAt === null
        ? null
        : Timestamp.fromMillis(parsed.archivedAt),
    version: aggregateVersion,
  };
};
