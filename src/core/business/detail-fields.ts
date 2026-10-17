/**
 * Invoice-level detail fields per business type: the small key-value facts a
 * trade expects on a document that the shared invoice columns cannot hold —
 * a bengkel's vehicle name and plate number, a laundry's weight, a caterer's
 * event name and date.
 *
 * Catalogue shape: every category carries a default set (hangs off its preset
 * in `presets.ts`), and a handful of subtypes whose needs diverge get an
 * override here. Pure data plus one resolver — no framework, no storage.
 *
 * Values are authored per invoice in the builder (see the "Detail bisnis"
 * card) and rendered under the customer block in the preview and print.
 * Keys are kebab-case ASCII and effectively permanent: they are persisted
 * inside each invoice's `details` record.
 */

import { getBusinessPreset } from './presets';
import type { BusinessSubtypeSlug } from './taxonomy';

export type BusinessDetailField = {
  /** Stable, persisted identifier. Kebab-case ASCII. */
  key: string;
  /** Indonesian display label, shown on the input and the printed invoice. */
  label: string;
  /**
   * Input hint: `text` is a plain box, `number` a numeric input (value still
   * stored as the raw string the user typed), `date` an ISO date picker.
   */
  type: 'text' | 'number' | 'date';
};

/**
 * Subtype overrides for the trades whose invoice facts differ from their
 * category's default. Only divergent sets live here — a bengkel inherits
 * Otomotif's fields untouched.
 */
export const DETAIL_FIELD_OVERRIDES: Partial<
  Record<BusinessSubtypeSlug, readonly BusinessDetailField[]>
> = {
  'rental-kendaraan': [
    { key: 'nama-kendaraan', label: 'Nama kendaraan', type: 'text' },
    { key: 'nomor-polisi', label: 'Nomor polisi', type: 'text' },
    { key: 'tanggal-sewa', label: 'Tanggal sewa', type: 'date' },
    { key: 'tanggal-kembali', label: 'Tanggal kembali', type: 'date' },
  ],
  katering: [
    { key: 'nama-acara', label: 'Nama acara', type: 'text' },
    { key: 'tanggal-acara', label: 'Tanggal acara', type: 'date' },
    { key: 'jumlah-porsi', label: 'Jumlah porsi', type: 'number' },
  ],
  'jasa-pengiriman': [
    { key: 'alamat-jemput', label: 'Alamat penjemputan', type: 'text' },
    { key: 'alamat-tujuan', label: 'Alamat tujuan', type: 'text' },
  ],
  laundry: [
    { key: 'berat-kg', label: 'Berat (kg)', type: 'number' },
    { key: 'nomor-tiket', label: 'Nomor tiket', type: 'text' },
  ],
  hotel: [
    { key: 'tanggal-check-in', label: 'Check-in', type: 'date' },
    { key: 'tanggal-check-out', label: 'Check-out', type: 'date' },
  ],
  'agen-properti': [{ key: 'alamat-properti', label: 'Alamat properti', type: 'text' }],
};

/**
 * Detail fields for a stored subtype slug.
 *
 * The subtype's override wins when it has one; otherwise the category
 * default from its preset. Unknown or absent slugs (legacy rows, a renamed
 * subtype) resolve to no fields — the invoice simply shows nothing extra.
 */
export function getDetailFields(
  subtypeSlug: string | null | undefined,
): readonly BusinessDetailField[] {
  if (subtypeSlug) {
    const override = DETAIL_FIELD_OVERRIDES[subtypeSlug as BusinessSubtypeSlug];
    if (override) return override;
  }
  return getBusinessPreset(subtypeSlug).detailFields;
}
