import { LazyRichEditor } from '../invoice/lazy-rich-editor';
import type { TemplateDefaults } from '../../../core/template/model';

type Props = {
  defaults: TemplateDefaults;
  onChange: (defaults: TemplateDefaults) => void;
};

const ZONES: { key: 'header' | 'content' | 'footer' | 'notes'; label: string; hint: string }[] = [
  { key: 'header', label: 'Teks pembuka', hint: 'Muncul di bawah kop, di atas kotak customer' },
  { key: 'content', label: 'Teks di tengah', hint: 'Muncul setelah daftar barang' },
  { key: 'footer', label: 'Teks penutup', hint: 'Bagian paling bawah invoice' },
  { key: 'notes', label: 'Catatan', hint: 'Isi kotak catatan' },
];

/** The rich-text zones a template pre-fills when it is picked. */
export function DefaultsForm({ defaults, onChange }: Props) {
  return (
    <div className="flex flex-col gap-5">
      {ZONES.map(({ key, label, hint }) => (
        <div key={key} className="flex flex-col gap-1.5">
          <LazyRichEditor
            label={label}
            value={defaults[key] ?? ''}
            placeholder={hint}
            onChange={(html) => onChange({ ...defaults, [key]: html })}
          />
          <p className="text-xs text-muted">{hint}</p>
        </div>
      ))}
    </div>
  );
}
