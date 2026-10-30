// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { DetailFieldsCard } from './detail-fields-card';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

let container: HTMLDivElement;
let root: Root | undefined;

async function render(node: ReactNode) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(node);
  });
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

const BENGKEL_FIELDS = [
  { key: 'nama-kendaraan', label: 'Nama kendaraan', type: 'text' as const },
  { key: 'nomor-polisi', label: 'Nomor polisi', type: 'text' as const },
  { key: 'kilometer', label: 'Kilometer', type: 'number' as const },
];

describe('DetailFieldsCard', () => {
  it('renders nothing when the business type has no fields', async () => {
    await render(<DetailFieldsCard fields={[]} values={{}} onChange={() => {}} />);

    expect(container.textContent).not.toContain('Detail bisnis');
    expect(container.querySelector('input')).toBeNull();
  });

  it('renders one labelled input per catalogue field', async () => {
    await render(<DetailFieldsCard fields={BENGKEL_FIELDS} values={{}} onChange={() => {}} />);

    expect(container.textContent).toContain('Detail bisnis');
    const inputs = container.querySelectorAll('input');
    expect(inputs).toHaveLength(3);
    expect(container.querySelector('label[for]')?.textContent).toBe('Nama kendaraan');
    expect(inputs[2]?.getAttribute('type')).toBe('number');
  });

  it('hands a typed value back inside a fresh record', async () => {
    const onChange = vi.fn();
    await render(<DetailFieldsCard fields={BENGKEL_FIELDS} values={{}} onChange={onChange} />);

    const input = container.querySelector<HTMLInputElement>('input');
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(
        input,
        'Avanza',
      );
      input?.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledWith({ 'nama-kendaraan': 'Avanza' });
  });

  it('drops a key whose value was cleared instead of storing a blank', async () => {
    const onChange = vi.fn();
    await render(
      <DetailFieldsCard
        fields={BENGKEL_FIELDS}
        values={{ 'nama-kendaraan': 'Avanza', 'nomor-polisi': 'B 1' }}
        onChange={onChange}
      />,
    );

    const input = container.querySelectorAll<HTMLInputElement>('input')[1];
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(
        input,
        '',
      );
      input?.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledWith({ 'nama-kendaraan': 'Avanza' });
  });

  it('shows the stored value on the matching input', async () => {
    await render(
      <DetailFieldsCard
        fields={BENGKEL_FIELDS}
        values={{ 'nomor-polisi': 'B 1234 XY' }}
        onChange={() => {}}
      />,
    );

    const inputs = container.querySelectorAll<HTMLInputElement>('input');
    expect(inputs[0]?.value).toBe('');
    expect(inputs[1]?.value).toBe('B 1234 XY');
  });
});
