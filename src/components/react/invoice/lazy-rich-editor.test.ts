import { describe, expect, it, vi } from 'vitest';
import { withImportRetry } from './lazy-rich-editor';

describe('withImportRetry', () => {
  it('returns the first success without waiting', async () => {
    const load = vi.fn().mockResolvedValue('ok');

    await expect(withImportRetry(load, [])).resolves.toBe('ok');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('keeps trying through transient failures', async () => {
    const attempts = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue('ok');

    await expect(withImportRetry(attempts, [0, 0])).resolves.toBe('ok');
    expect(attempts).toHaveBeenCalledTimes(3);
  });

  it('rethrows the original error once the delays run out', async () => {
    const failure = new Error('still broken');
    const attempts = vi.fn().mockRejectedValue(failure);

    await expect(withImportRetry(attempts, [0, 0])).rejects.toBe(failure);
    expect(attempts).toHaveBeenCalledTimes(3);
  });

  it('treats an empty delay list as a single attempt', async () => {
    const failure = new Error('once');
    const attempts = vi.fn().mockRejectedValue(failure);

    await expect(withImportRetry(attempts, [])).rejects.toBe(failure);
    expect(attempts).toHaveBeenCalledTimes(1);
  });
});
