import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DebugPanel } from '../../src/components/DebugPanel';

describe('DebugPanel', () => {
  it('renders debug info and actions', () => {
    const onRebuild = vi.fn();
    const onResetSyncHead = vi.fn(async () => {});
    render(
      <DebugPanel
        info={{
          vfsName: 'vfs-opfs',
          opfsAvailable: true,
          syncAccessHandle: false,
          tables: ['a', 'b', 'c'],
          eventCount: 5,
          aggregateCount: 2,
          note: 'note',
          onRebuild,
          onResetSyncHead,
        }}
      />
    );

    expect(screen.getByText('VFS: vfs-opfs')).not.toBeNull();
    expect(screen.getByText('Tables: 3')).not.toBeNull();

    fireEvent.click(screen.getByText('Rebuild Projections'));
    expect(onRebuild).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Reset Sync Head (reseed)'));
    expect(onResetSyncHead).toHaveBeenCalledTimes(1);
  });
});
