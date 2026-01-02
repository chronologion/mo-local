type DebugInfo = {
  opfsAvailable: boolean;
  tables?: string[];
  note?: string;
  storeId?: string;
  storage?: string;
  eventCount?: number;
  aggregateCount?: number;
  onRebuild?: () => void;
  onDownloadDb?: () => void;
};

export const DebugPanel = ({ info }: { info: DebugInfo }) => {
  const tableCount = info.tables && info.tables.length > 0 ? info.tables.length : 0;
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
        zIndex: 10,
        boxShadow: '0 8px 20px rgba(0,0,0,0.35)',
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 4 }}>EventStore Debug</div>
      {info.storage ? <div>Storage: {info.storage}</div> : null}
      {info.storeId ? <div>StoreId: {info.storeId}</div> : null}
      <div>OPFS: {info.opfsAvailable ? 'yes' : 'no'}</div>
      {typeof info.eventCount === 'number' ? <div>Events: {info.eventCount}</div> : null}
      {typeof info.aggregateCount === 'number' ? <div>Aggregates: {info.aggregateCount}</div> : null}
      <div>Tables: {tableCount}</div>
      {info.note ? <div>Note: {info.note}</div> : null}
      {info.onRebuild ? (
        <button
          style={{
            marginTop: 8,
            padding: '4px 8px',
            borderRadius: 4,
            border: '1px solid #6b7280',
            background: '#111827',
            color: '#e5e7eb',
            cursor: 'pointer',
          }}
          onClick={info.onRebuild}
        >
          Rebuild Projections
        </button>
      ) : null}
      {info.onDownloadDb ? (
        <button
          style={{
            marginTop: 8,
            marginLeft: 8,
            padding: '4px 8px',
            borderRadius: 4,
            border: '1px solid #6b7280',
            background: '#111827',
            color: '#e5e7eb',
            cursor: 'pointer',
          }}
          onClick={info.onDownloadDb}
        >
          Download DB
        </button>
      ) : null}
    </div>
  );
};
