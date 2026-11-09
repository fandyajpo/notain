// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { AppError } from '../../../core/shared/errors';
import { getSelectionStore, resetSelection, type Scope } from '../../selection';
import {
  exportRows,
  resolveSelected,
  useSelectionScope,
  type SelectionLoaders,
} from './use-selection';

/**
 * The selection's query layer: how an all-scope becomes an exact count plus
 * membership, and how an action resolves the selection to live records with
 * user-visible feedback when something disappeared.
 *
 * The toast module is mocked (its output is a UI concern) but the resolution
 * logic and the caching are the real ones.
 */

const toast = vi.hoisted(() => vi.fn());
vi.mock('../../ui/toast', () => ({ toast }));

type Row = { id: string };
type Criteria = { query: string };

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

/** Last scope view rendered by the probe — the assertions read it directly. */
let view: { size: number | null; has: (id: string) => boolean } | null = null;

function Probe({
  scope,
  loaders,
  total,
}: {
  scope: Scope<Criteria> | null;
  loaders: SelectionLoaders<Row, Criteria>;
  total?: number | null;
}) {
  view = useSelectionScope<Criteria, Row>('scope-test', scope, loaders, total);
  return <div data-probe>{view.size === null ? 'pending' : String(view.size)}</div>;
}

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;

function render(ui: ReactNode): void {
  act(() => {
    root.render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  });
}

function probeText(): string {
  return container.querySelector('[data-probe]')?.textContent ?? '';
}

/** See `use-invoices.test.tsx` — a condition, not a duration (see that file). */
async function until(assertion: () => void, attempts = 100): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      assertion();
      return;
    } catch {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 2));
      });
    }
  }
  assertion();
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  view = null;
  toast.mockReset();
  resetSelection('scope-test');
  resetSelection('resolver-test');
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function loaders(overrides?: Partial<SelectionLoaders<Row, Criteria>>) {
  return {
    all: vi.fn(async (): Promise<Row[]> => [{ id: 'a' }, { id: 'b' }]),
    matching: vi.fn(async (): Promise<Row[]> => [{ id: 'a' }, { id: 'b' }]),
    ...overrides,
  };
}

describe('useSelectionScope', () => {
  it('answers a dataset scope from the server total without fetching', () => {
    const source = loaders();
    render(<Probe scope={{ kind: 'dataset' }} loaders={source} total={12} />);

    expect(probeText()).toBe('12');
    expect(view?.has('anything')).toBe(true);
    expect(source.all).not.toHaveBeenCalled();
    expect(source.matching).not.toHaveBeenCalled();
  });

  it('walks the dataset when no total is known', async () => {
    const source = loaders();
    render(<Probe scope={{ kind: 'dataset' }} loaders={source} />);

    await until(() => expect(probeText()).toBe('2'));
    expect(source.all).toHaveBeenCalledTimes(1);
    expect(view?.has('a')).toBe(true);
  });

  it('walks a filtered scope by its criteria and reports membership from the rows', async () => {
    const source = loaders({
      matching: vi.fn(async () => [{ id: 'a' }, { id: 'b' }, { id: 'c' }]),
    });
    render(<Probe scope={{ kind: 'filtered', criteria: { query: 'x' } }} loaders={source} />);

    await until(() => expect(probeText()).toBe('3'));
    expect(source.matching).toHaveBeenCalledWith({ query: 'x' });
    expect(source.all).not.toHaveBeenCalled();
    expect(view?.has('b')).toBe(true);
    expect(view?.has('z')).toBe(false);
  });

  it('does not guess membership while a filtered walk is pending and reconciles overlap', async () => {
    let resolveWalk!: (rows: Row[]) => void;
    const source = loaders({
      matching: vi.fn(
        () =>
          new Promise<Row[]>((resolve) => {
            resolveWalk = resolve;
          }),
      ),
    });
    const scope = { kind: 'filtered', criteria: { query: 'x' } } as const;
    const selection = getSelectionStore<Criteria>('scope-test');
    selection.toggle('a');
    selection.selectScope(scope);
    render(<Probe scope={scope} loaders={source} />);

    expect(probeText()).toBe('pending');
    expect(view?.has('anything')).toBe(false);

    await act(async () => resolveWalk([{ id: 'a' }]));
    await until(() => {
      expect(probeText()).toBe('1');
      expect(selection.getSnapshot().included.has('a')).toBe(false);
    });
    expect(selection.count(1)).toBe(1);
    expect(view?.has('a')).toBe(true);
    expect(view?.has('z')).toBe(false);
  });

  it('has no size and no membership without a scope', () => {
    const source = loaders();
    render(<Probe scope={null} loaders={source} total={5} />);

    expect(probeText()).toBe('pending');
    expect(view?.has('a')).toBe(false);
    expect(source.all).not.toHaveBeenCalled();
  });
});

describe('selection resolvers', () => {
  const store = () => getSelectionStore<Criteria>('resolver-test');

  it('resolveSelected returns live records and reports deleted ones', async () => {
    const selection = store();
    selection.toggle('a');
    selection.toggle('gone');

    const rows = await resolveSelected({
      snapshot: selection.getSnapshot(),
      loaders: loaders({ all: vi.fn(async () => [{ id: 'a' }]) }),
      noun: 'pelanggan',
    });

    expect(rows.map((row) => row.id)).toEqual(['a']);
    expect(toast).toHaveBeenCalledWith('1 pelanggan sudah dihapus dan dilewati.', {
      variant: 'info',
    });
  });

  it('exportRows throws displayable AppError copy when nothing survived', async () => {
    const selection = store();
    selection.toggle('gone');

    const failure = await exportRows({
      snapshot: selection.getSnapshot(),
      loaders: loaders({ all: vi.fn(async () => []) }),
      noun: 'nota',
    }).catch((error: unknown) => error);

    // An AppError (not a bare Error): `toAppError` passes its message through
    // instead of replacing it with the generic fallback.
    expect(failure).toBeInstanceOf(AppError);
    expect((failure as AppError).message).toBe('Data terpilih sudah tidak tersedia.');
  });

  it('exportRows passes the records through untouched when everything exists', async () => {
    const selection = store();
    selection.toggle('a');

    const rows = await exportRows({
      snapshot: selection.getSnapshot(),
      loaders: loaders(),
      noun: 'nota',
    });

    expect(rows.map((row) => row.id)).toEqual(['a']);
    expect(toast).not.toHaveBeenCalled();
  });
});
