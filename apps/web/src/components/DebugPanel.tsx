import React from 'react';

type DebugInfo = {
  vfsName: string;
  opfsAvailable: boolean;
  syncAccessHandle: boolean;
  tables?: string[];
  note?: string;
  storeId?: string;
  storage?: string;
  eventCount?: number;
  aggregateCount?: number;
};

export const DebugPanel = ({ info }: { info: DebugInfo }) => {
  const tables = info.tables && info.tables.length > 0 ? info.tables.join(', ') : 'none';
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 12,
        right: 12,
        padding: '10px 14px',
        background: 'rgba(20,20,20,0.85)',
        color: '#e5e7eb',
        borderRadius: 8,
        fontFamily: 'monospace',
        fontSize: 12,
        lineHeight: 1.4,
        zIndex: 9999,
        boxShadow: '0 8px 20px rgba(0,0,0,0.35)',
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 4 }}>LiveStore Debug</div>
      <div>VFS: {info.vfsName}</div>
      {info.storage ? <div>Storage: {info.storage}</div> : null}
      {info.storeId ? <div>StoreId: {info.storeId}</div> : null}
      <div>OPFS: {info.opfsAvailable ? 'yes' : 'no'}</div>
      <div>Sync Access Handle: {info.syncAccessHandle ? 'yes' : 'no'}</div>
      {typeof info.eventCount === 'number' ? (
        <div>Events: {info.eventCount}</div>
      ) : null}
      {typeof info.aggregateCount === 'number' ? (
        <div>Aggregates: {info.aggregateCount}</div>
      ) : null}
      <div>Tables: {tables}</div>
      {info.note ? <div>Note: {info.note}</div> : null}
    </div>
  );
};
