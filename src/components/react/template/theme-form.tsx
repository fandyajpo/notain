import type { TemplateTheme, TemplateWallpaper } from '../../../core/template/model';
import { DEFAULT_THEME } from '../../../core/template/model';
import { controlClass } from '../ui/field';

type Props = {
  theme: TemplateTheme;
  onChange: (theme: TemplateTheme) => void;
};

type ColorKey =
  | 'background'
  | 'surface'
  | 'text'
  | 'muted'
  | 'border'
  | 'accent'
  | 'accentForeground'
  | 'accentSoft';

const COLORS: { key: ColorKey; label: string; hint?: string }[] = [
  { key: 'background', label: 'Latar halaman' },
  { key: 'surface', label: 'Latar kartu', hint: 'Kotak customer, kotak catatan' },
  { key: 'text', label: 'Teks utama' },
  { key: 'muted', label: 'Teks sekunder' },
  { key: 'border', label: 'Garis' },
  { key: 'accent', label: 'Aksen' },
  { key: 'accentForeground', label: 'Teks di atas aksen' },
  { key: 'accentSoft', label: 'Aksen lembut', hint: 'Latar baris yang ditandai' },
];

const WALLPAPER_KINDS: { kind: TemplateWallpaper['kind']; label: string }[] = [
  { kind: 'none', label: 'Tanpa' },
  { kind: 'solid', label: 'Warna solid' },
  { kind: 'gradient', label: 'Gradasi' },
];

/** Colours, radius, accent rule and the wallpaper behind the card. */
export function ThemeForm({ theme, onChange }: Props) {
  function patch(part: Partial<TemplateTheme>) {
    onChange({ ...theme, ...part });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {COLORS.map(({ key, label, hint }) => (
          <div key={key} className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">{label}</span>
            <ColorField
              label={label}
              value={theme[key]}
              onChange={(color) => patch({ [key]: color } as Partial<TemplateTheme>)}
            />
            {hint && <p className="text-xs text-muted">{hint}</p>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="theme-radius" className="text-sm font-medium text-foreground">
            Sudut membulat
          </label>
          <div className="flex items-center gap-3">
            <input
              id="theme-radius"
              type="range"
              min={0}
              max={32}
              step={1}
              value={theme.radius}
              onChange={(event) => patch({ radius: Number(event.target.value) })}
              className="h-10 flex-1"
              style={{ accentColor: 'var(--color-accent)' }}
            />
            <output
              htmlFor="theme-radius"
              className="w-10 text-right text-sm tabular-nums text-muted"
            >
              {theme.radius}
            </output>
          </div>
        </div>

        <label className="flex items-center gap-3 self-end pb-2">
          <input
            type="checkbox"
            checked={theme.accentBar}
            onChange={(event) => patch({ accentBar: event.target.checked })}
            className="h-4 w-4 rounded-sm border-border focus-ring"
            style={{ accentColor: 'var(--color-accent)' }}
          />
          <span className="flex flex-col">
            <span className="text-sm font-medium text-foreground">Bar aksen</span>
            <span className="text-xs text-muted">Garis warna aksen di atas halaman</span>
          </span>
        </label>
      </div>

      <WallpaperForm wallpaper={theme.wallpaper} onChange={(wallpaper) => patch({ wallpaper })} />

      <button
        type="button"
        onClick={() => onChange({ ...DEFAULT_THEME })}
        className="self-start text-sm font-medium text-muted underline-offset-4 transition-colors hover:text-foreground hover:underline focus-ring"
      >
        Kembalikan ke tema bawaan
      </button>
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        aria-label={`Pilih warna ${label}`}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-10 shrink-0 cursor-pointer rounded-control border border-border bg-card p-1 focus-ring"
      />
      <input
        type="text"
        value={value}
        maxLength={7}
        spellCheck={false}
        aria-label={`Kode warna ${label}`}
        onChange={(event) => onChange(event.target.value)}
        className={controlClass({ className: 'h-10 font-mono uppercase' })}
      />
    </div>
  );
}

/**
 * Keeps whichever colours were already picked when the kind changes, so
 * flipping to `solid` and back to `gradient` does not reset the gradient.
 */
function switchWallpaperKind(
  current: TemplateWallpaper,
  kind: TemplateWallpaper['kind'],
  fallback: string,
): TemplateWallpaper {
  if (kind === 'none') return { kind: 'none' };
  if (kind === 'solid') {
    if (current.kind === 'solid') return current;
    return { kind: 'solid', color: current.kind === 'gradient' ? current.from : fallback };
  }
  if (current.kind === 'gradient') return current;
  return {
    kind: 'gradient',
    from: current.kind === 'solid' ? current.color : fallback,
    to: '#ffffff',
    angle: 135,
  };
}

function WallpaperForm({
  wallpaper,
  onChange,
}: {
  wallpaper: TemplateWallpaper;
  onChange: (wallpaper: TemplateWallpaper) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">Latar di balik kartu invoice</p>
        <p className="text-xs text-muted">
          Ikut tercetak asalkan kotak <em>Background graphics</em> dicentang saat mencetak.
        </p>
      </div>

      <div
        role="group"
        aria-label="Jenis latar"
        className="flex flex-wrap gap-2 rounded-control border border-border bg-background p-1"
      >
        {WALLPAPER_KINDS.map(({ kind, label }) => (
          <button
            key={kind}
            type="button"
            aria-pressed={wallpaper.kind === kind}
            onClick={() => onChange(switchWallpaperKind(wallpaper, kind, '#f8f8f6'))}
            className={[
              'rounded-md px-3 py-1.5 text-sm transition-colors focus-ring',
              wallpaper.kind === kind
                ? 'bg-card font-medium text-foreground shadow-card'
                : 'text-muted hover:text-foreground',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      {wallpaper.kind === 'solid' && (
        <ColorField
          label="Warna latar"
          value={wallpaper.color}
          onChange={(color) => onChange({ kind: 'solid', color })}
        />
      )}

      {wallpaper.kind === 'gradient' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Warna awal</span>
            <ColorField
              label="Warna awal gradasi"
              value={wallpaper.from}
              onChange={(from) => onChange({ ...wallpaper, from })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Warna akhir</span>
            <ColorField
              label="Warna akhir gradasi"
              value={wallpaper.to}
              onChange={(to) => onChange({ ...wallpaper, to })}
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label htmlFor="wallpaper-angle" className="text-sm font-medium text-foreground">
              Arah gradasi
            </label>
            <div className="flex items-center gap-3">
              <input
                id="wallpaper-angle"
                type="range"
                min={0}
                max={360}
                step={1}
                value={wallpaper.angle}
                onChange={(event) => onChange({ ...wallpaper, angle: Number(event.target.value) })}
                className="h-10 flex-1"
                style={{ accentColor: 'var(--color-accent)' }}
              />
              <output
                htmlFor="wallpaper-angle"
                className="w-12 text-right text-sm tabular-nums text-muted"
              >
                {wallpaper.angle}°
              </output>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
