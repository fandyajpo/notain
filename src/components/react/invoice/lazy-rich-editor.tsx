import { lazy, Suspense, useState, type ComponentType } from 'react';
import { toast } from '../../../lib/ui/toast';
import { Button } from '../ui/button';
import { ErrorBoundary } from '../ui/error-boundary';
import { Notice } from '../ui/notice';

type Props = {
  label: string;
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
};

/**
 * Defers the TipTap bundle out of `invoice-builder`. TipTap is the single
 * largest contributor to that chunk, and none of it is needed for the rest of
 * the form to become interactive.
 *
 * The lazy component is stored in state rather than created once, because
 * `React.lazy` caches a rejected import forever — without a fresh instance a
 * retry button could never recover from a failed chunk load.
 */
export function LazyRichEditor(props: Props) {
  const [RichEditor, setRichEditor] = useState<ComponentType<Props>>(createLazyRichEditor);

  return (
    <ErrorBoundary
      fallback={(error, reset) => (
        <EditorLoadError
          label={props.label}
          minHeight={props.minHeight}
          onRetry={() => {
            setRichEditor(() => createLazyRichEditor());
            reset();
          }}
          onGiveUp={() => {
            reset();
            toast('Editor teks tidak bisa dimuat. Periksa koneksi kamu.', { variant: 'error' });
          }}
          error={error}
        />
      )}
    >
      <Suspense fallback={<RichEditorFallback label={props.label} minHeight={props.minHeight} />}>
        <RichEditor {...props} />
      </Suspense>
    </ErrorBoundary>
  );
}

function createLazyRichEditor(): ComponentType<Props> {
  return lazy(async () => {
    const mod = await import('./rich-editor');
    return { default: mod.RichEditor };
  });
}

/** Holds the layout so the section does not jump when the editor arrives. */
function RichEditorFallback({ label, minHeight = 96 }: { label: string; minHeight?: number }) {
  return (
    <div className="flex flex-col gap-1.5" aria-busy="true">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <div
        className="rounded-control border border-border bg-card shadow-card"
        style={{ minHeight: minHeight + 36 }}
        aria-hidden="true"
      />
    </div>
  );
}

type EditorLoadErrorProps = {
  label: string;
  minHeight?: number;
  error: Error;
  onRetry: () => void;
  onGiveUp: () => void;
};

/**
 * Shown when the TipTap chunk fails to load (offline, 504, or a stale hash
 * after a deploy). Scoped to this one section so the rest of the invoice —
 * customer, line items, totals, save — stays usable.
 */
function EditorLoadError({
  label,
  minHeight = 96,
  error,
  onRetry,
  onGiveUp,
}: EditorLoadErrorProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <Notice style={{ minHeight: minHeight + 36 }}>
        <div className="flex flex-col items-start gap-3">
          <p>Editor teks gagal dimuat. Invoice kamu tidak hilang; bagian lain tetap bisa diisi.</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={onRetry}>
              Coba lagi
            </Button>
            <Button size="sm" variant="ghost" onClick={onGiveUp}>
              Lewati
            </Button>
          </div>
          {import.meta.env.DEV && (
            <p className="break-all text-xs text-muted" title={error.message}>
              {error.message}
            </p>
          )}
        </div>
      </Notice>
    </div>
  );
}
