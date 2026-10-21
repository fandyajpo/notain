import { describe, expect, it } from 'vite-plus/test';
import { canChangeStatus, nextStatuses, statusFlowMessage } from './status';

describe('nextStatuses', () => {
  it('opens a fresh invoice at Terkirim only', () => {
    expect(nextStatuses(null)).toEqual(['sent']);
  });

  it('offers Lunas and Batal after Terkirim', () => {
    expect(nextStatuses('sent')).toEqual(['paid', 'void']);
  });

  it('locks terminal states', () => {
    expect(nextStatuses('paid')).toEqual([]);
    expect(nextStatuses('void')).toEqual([]);
  });
});

describe('canChangeStatus', () => {
  it('walks the chain forwards', () => {
    expect(canChangeStatus(null, 'sent')).toBe(true);
    expect(canChangeStatus('sent', 'paid')).toBe(true);
    expect(canChangeStatus('sent', 'void')).toBe(true);
  });

  it('never steps backwards or clears', () => {
    expect(canChangeStatus('paid', 'sent')).toBe(false);
    expect(canChangeStatus('void', 'sent')).toBe(false);
    expect(canChangeStatus('paid', 'void')).toBe(false);
    expect(canChangeStatus('sent', null)).toBe(false);
    expect(canChangeStatus('paid', null)).toBe(false);
  });

  it('never jumps from unset straight to a terminal state', () => {
    expect(canChangeStatus(null, 'paid')).toBe(false);
    expect(canChangeStatus(null, 'void')).toBe(false);
  });

  it('treats a re-pick of the same status as an idempotent no-op', () => {
    expect(canChangeStatus(null, null)).toBe(true);
    expect(canChangeStatus('sent', 'sent')).toBe(true);
    expect(canChangeStatus('paid', 'paid')).toBe(true);
    expect(canChangeStatus('void', 'void')).toBe(true);
  });
});

describe('statusFlowMessage', () => {
  it('explains a terminal refusal by name', () => {
    expect(statusFlowMessage('paid', 'sent')).toContain('Lunas');
    expect(statusFlowMessage('paid', 'sent')).toContain('status akhir');
  });

  it('lists the forward options from a live status', () => {
    expect(statusFlowMessage('sent', 'paid')).toContain('Lunas atau Batal');
    expect(statusFlowMessage(null, 'paid')).toContain('Terkirim');
  });

  it('refuses clearing with its own sentence', () => {
    expect(statusFlowMessage('sent', null)).toContain('tidak bisa dikosongkan');
  });
});
