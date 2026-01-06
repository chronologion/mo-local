import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DebugPanel } from '../../src/components/DebugPanel';

describe('DebugPanel', () => {
  it('renders debug info and actions', () => {
    const onRebuild = vi.fn();
    const onDownloadDb = vi.fn();
    const onResetSync = vi.fn();
    render(
      <DebugPanel
        info={{
          opfsAvailable: true,
          tables: ['a', 'b', 'c'],
          eventCount: 5,
          aggregateCount: 2,
          note: 'note',
          onRebuild,
          onDownloadDb,
          onResetSync,
        }}
      />
    );

    expect(screen.getByText('OPFS: yes')).not.toBeNull();
    expect(screen.getByText('Tables: 3')).not.toBeNull();

    fireEvent.click(screen.getByText('Rebuild Projections'));
    expect(onRebuild).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Download DB'));
    expect(onDownloadDb).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Reset Sync State'));
    expect(onResetSync).toHaveBeenCalledTimes(1);
  });
});
