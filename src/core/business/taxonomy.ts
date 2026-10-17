/**
 * The business-type taxonomy: 19 categories, each with a handful of concrete
 * subtypes a user picks from. Pure data — no framework, no storage.
 *
 * Only the subtype is ever stored (`profiles.businessType`,
 * `templates.businessType`); the category exists purely to group the 175
 * choices in the picker so nobody has to scan one flat list.
 *
 * Slugs are kebab-case ASCII and effectively permanent: they are persisted,
 * so a rename means a data migration. Unknown values on read degrade to
 * "no business type" rather than throwing (see `getBusinessSubtype`).
 */

export type BusinessSubtype = {
  /** Stable, persisted identifier. Kebab-case ASCII. */
  slug: string;
  /** Indonesian display label. */
  label: string;
};

export type BusinessCategory = {
  slug: string;
  label: string;
  subtypes: readonly BusinessSubtype[];
};

/**
 * The literal data. Kept `as const` only so the slug unions below are exact;
 * consumers get the widened `BUSINESS_CATEGORIES`, because iterating a tuple
 * of19 distinct object types makes `flatMap`'s callback parameter unusable.
 */
const CATEGORY_DATA = [
  {
    slug: 'perdagangan',
    label: 'Perdagangan',
    subtypes: [
      { slug: 'perdagangan-umum', label: 'Perdagangan Umum' },
      { slug: 'retail', label: 'Retail' },
      { slug: 'grosir', label: 'Grosir' },
      { slug: 'distributor', label: 'Distributor' },
      { slug: 'supplier', label: 'Supplier' },
      { slug: 'reseller', label: 'Reseller' },
      { slug: 'dropshipper', label: 'Dropshipper' },
      { slug: 'e-commerce', label: 'E-commerce' },
      { slug: 'marketplace-seller', label: 'Marketplace Seller' },
      { slug: 'toko-online', label: 'Toko Online' },
    ],
  },
  {
    slug: 'otomotif',
    label: 'Otomotif',
    subtypes: [
      { slug: 'bengkel-mobil', label: 'Bengkel Mobil' },
      { slug: 'bengkel-motor', label: 'Bengkel Motor' },
      { slug: 'toko-variasi-mobil', label: 'Toko Variasi Mobil' },
      { slug: 'toko-variasi-motor', label: 'Toko Variasi Motor' },
      { slug: 'spare-part-kendaraan', label: 'Spare Part Kendaraan' },
      { slug: 'cuci-kendaraan', label: 'Cuci Kendaraan' },
      { slug: 'salon-detailing-kendaraan', label: 'Salon dan Detailing Kendaraan' },
      { slug: 'rental-kendaraan', label: 'Rental Kendaraan' },
      { slug: 'modifikasi-kendaraan', label: 'Modifikasi Kendaraan' },
      { slug: 'dealer-kendaraan', label: 'Dealer Kendaraan' },
    ],
  },
  {
    slug: 'makanan-minuman',
    label: 'Makanan dan Minuman',
    subtypes: [
      { slug: 'restoran', label: 'Restoran' },
      { slug: 'warung-makan', label: 'Warung Makan' },
      { slug: 'katering', label: 'Katering' },
      { slug: 'kafe', label: 'Kafe' },
      { slug: 'kedai-kopi', label: 'Kedai Kopi' },
      { slug: 'usaha-minuman', label: 'Usaha Minuman' },
      { slug: 'bakery-pastry', label: 'Bakery dan Pastry' },
      { slug: 'usaha-makanan-rumahan', label: 'Usaha Makanan Rumahan' },
      { slug: 'frozen-food', label: 'Frozen Food' },
      { slug: 'food-truck', label: 'Food Truck' },
    ],
  },
  {
    slug: 'fashion-tekstil',
    label: 'Fashion dan Tekstil',
    subtypes: [
      { slug: 'toko-pakaian', label: 'Toko Pakaian' },
      { slug: 'butik', label: 'Butik' },
      { slug: 'konveksi', label: 'Konveksi' },
      { slug: 'penjahit', label: 'Penjahit' },
      { slug: 'sablon-bordir', label: 'Sablon dan Bordir' },
      { slug: 'thrift-shop', label: 'Thrift Shop' },
      { slug: 'toko-sepatu-tas', label: 'Toko Sepatu dan Tas' },
      { slug: 'aksesori-fashion', label: 'Aksesori Fashion' },
      { slug: 'produsen-tekstil', label: 'Produsen Tekstil' },
      { slug: 'penyewaan-pakaian', label: 'Penyewaan Pakaian' },
    ],
  },
  {
    slug: 'jasa',
    label: 'Jasa',
    subtypes: [
      { slug: 'freelancer', label: 'Freelancer' },
      { slug: 'konsultan', label: 'Konsultan' },
      { slug: 'jasa-profesional', label: 'Jasa Profesional' },
      { slug: 'jasa-kebersihan', label: 'Jasa Kebersihan' },
      { slug: 'jasa-reparasi', label: 'Jasa Reparasi' },
      { slug: 'jasa-perawatan', label: 'Jasa Perawatan' },
      { slug: 'jasa-pengiriman', label: 'Jasa Pengiriman' },
      { slug: 'jasa-penyewaan', label: 'Jasa Penyewaan' },
      { slug: 'jasa-administrasi', label: 'Jasa Administrasi' },
      { slug: 'jasa-personal', label: 'Jasa Personal' },
      { slug: 'laundry', label: 'Laundry' },
    ],
  },
  {
    slug: 'teknologi-digital',
    label: 'Teknologi dan Digital',
    subtypes: [
      { slug: 'software-development', label: 'Software Development' },
      { slug: 'digital-agency', label: 'Digital Agency' },
      { slug: 'it-services', label: 'IT Services' },
      { slug: 'web-development', label: 'Web Development' },
      { slug: 'digital-marketing', label: 'Digital Marketing' },
      { slug: 'desain-grafis', label: 'Desain Grafis' },
      { slug: 'produk-digital', label: 'Produk Digital' },
      { slug: 'saas', label: 'SaaS' },
      { slug: 'hosting-domain', label: 'Hosting dan Domain' },
      { slug: 'servis-elektronik', label: 'Servis Elektronik' },
    ],
  },
  {
    slug: 'kecantikan-perawatan',
    label: 'Kecantikan dan Perawatan',
    subtypes: [
      { slug: 'salon', label: 'Salon' },
      { slug: 'barbershop', label: 'Barbershop' },
      { slug: 'klinik-kecantikan', label: 'Klinik Kecantikan' },
      { slug: 'makeup-artist', label: 'Makeup Artist' },
      { slug: 'spa-wellness', label: 'Spa dan Wellness' },
      { slug: 'nail-art', label: 'Nail Art' },
      { slug: 'perawatan-tubuh', label: 'Perawatan Tubuh' },
      { slug: 'toko-kosmetik', label: 'Toko Kosmetik' },
      { slug: 'skincare', label: 'Skincare' },
      { slug: 'perawatan-hewan', label: 'Perawatan Hewan' },
    ],
  },
  {
    slug: 'konstruksi-properti',
    label: 'Konstruksi dan Properti',
    subtypes: [
      { slug: 'kontraktor', label: 'Kontraktor' },
      { slug: 'konstruksi', label: 'Konstruksi' },
      { slug: 'renovasi', label: 'Renovasi' },
      { slug: 'arsitektur', label: 'Arsitektur' },
      { slug: 'desain-interior', label: 'Desain Interior' },
      { slug: 'real-estate', label: 'Real Estate' },
      { slug: 'agen-properti', label: 'Agen Properti' },
      { slug: 'property-management', label: 'Property Management' },
      { slug: 'material-bangunan', label: 'Material Bangunan' },
      { slug: 'instalasi-teknik', label: 'Instalasi dan Teknik' },
    ],
  },
  {
    slug: 'pendidikan',
    label: 'Pendidikan',
    subtypes: [
      { slug: 'pendidikan-formal', label: 'Pendidikan Formal' },
      { slug: 'bimbingan-belajar', label: 'Bimbingan Belajar' },
      { slug: 'kursus-pelatihan', label: 'Kursus dan Pelatihan' },
      { slug: 'les-privat', label: 'Les Privat' },
      { slug: 'pendidikan-online', label: 'Pendidikan Online' },
      { slug: 'pelatihan-profesional', label: 'Pelatihan Profesional' },
      { slug: 'penerbitan-edukasi', label: 'Penerbitan Edukasi' },
    ],
  },
  {
    slug: 'kesehatan',
    label: 'Kesehatan',
    subtypes: [
      { slug: 'klinik-kesehatan', label: 'Klinik Kesehatan' },
      { slug: 'praktik-dokter', label: 'Praktik Dokter' },
      { slug: 'apotek', label: 'Apotek' },
      { slug: 'laboratorium', label: 'Laboratorium' },
      { slug: 'alat-kesehatan', label: 'Alat Kesehatan' },
      { slug: 'fisioterapi', label: 'Fisioterapi' },
      { slug: 'kebugaran', label: 'Kebugaran' },
      { slug: 'layanan-kesehatan-hewan', label: 'Layanan Kesehatan Hewan' },
    ],
  },
  {
    slug: 'pariwisata-hospitality',
    label: 'Pariwisata dan Hospitality',
    subtypes: [
      { slug: 'hotel', label: 'Hotel' },
      { slug: 'villa-penginapan', label: 'Villa dan Penginapan' },
      { slug: 'travel-agent', label: 'Travel Agent' },
      { slug: 'tour-operator', label: 'Tour Operator' },
      { slug: 'pemandu-wisata', label: 'Pemandu Wisata' },
      { slug: 'penyewaan-akomodasi', label: 'Penyewaan Akomodasi' },
      { slug: 'aktivitas-wisata', label: 'Aktivitas Wisata' },
      { slug: 'restoran-hospitality', label: 'Restoran dan Hospitality' },
    ],
  },
  {
    slug: 'acara-hiburan',
    label: 'Acara dan Hiburan',
    subtypes: [
      { slug: 'event-organizer', label: 'Event Organizer' },
      { slug: 'wedding-organizer', label: 'Wedding Organizer' },
      { slug: 'fotografi', label: 'Fotografi' },
      { slug: 'videografi', label: 'Videografi' },
      { slug: 'production-house', label: 'Production House' },
      { slug: 'musik-entertainment', label: 'Musik dan Entertainment' },
      { slug: 'dekorasi-acara', label: 'Dekorasi Acara' },
      { slug: 'photobooth', label: 'Photobooth' },
      { slug: 'penyewaan-peralatan-acara', label: 'Penyewaan Peralatan Acara' },
      { slug: 'undangan-souvenir', label: 'Undangan dan Souvenir' },
    ],
  },
  {
    slug: 'manufaktur-produksi',
    label: 'Manufaktur dan Produksi',
    subtypes: [
      { slug: 'manufaktur', label: 'Manufaktur' },
      { slug: 'produksi-makanan', label: 'Produksi Makanan' },
      { slug: 'produksi-minuman', label: 'Produksi Minuman' },
      { slug: 'produksi-pakaian', label: 'Produksi Pakaian' },
      { slug: 'furnitur', label: 'Furnitur' },
      { slug: 'kerajinan', label: 'Kerajinan' },
      { slug: 'percetakan', label: 'Percetakan' },
      { slug: 'pengemasan', label: 'Pengemasan' },
      { slug: 'maklon', label: 'Maklon' },
      { slug: 'industri-komponen', label: 'Industri Komponen' },
    ],
  },
  {
    slug: 'pertanian-peternakan',
    label: 'Pertanian dan Peternakan',
    subtypes: [
      { slug: 'pertanian', label: 'Pertanian' },
      { slug: 'perkebunan', label: 'Perkebunan' },
      { slug: 'peternakan', label: 'Peternakan' },
      { slug: 'perikanan', label: 'Perikanan' },
      { slug: 'akuakultur', label: 'Akuakultur' },
      { slug: 'kehutanan', label: 'Kehutanan' },
      { slug: 'agrobisnis', label: 'Agrobisnis' },
      { slug: 'distribusi-hasil-pertanian', label: 'Distribusi Hasil Pertanian' },
      { slug: 'pengolahan-hasil-panen', label: 'Pengolahan Hasil Panen' },
    ],
  },
  {
    slug: 'logistik-transportasi',
    label: 'Logistik dan Transportasi',
    subtypes: [
      { slug: 'logistik', label: 'Logistik' },
      { slug: 'ekspedisi', label: 'Ekspedisi' },
      { slug: 'kurir', label: 'Kurir' },
      { slug: 'transportasi-darat', label: 'Transportasi Darat' },
      { slug: 'transportasi-laut', label: 'Transportasi Laut' },
      { slug: 'transportasi-udara', label: 'Transportasi Udara' },
      { slug: 'pergudangan', label: 'Pergudangan' },
      { slug: 'freight-forwarding', label: 'Freight Forwarding' },
      { slug: 'jasa-pindahan', label: 'Jasa Pindahan' },
    ],
  },
  {
    slug: 'keuangan-administrasi',
    label: 'Keuangan dan Administrasi',
    subtypes: [
      { slug: 'akuntansi', label: 'Akuntansi' },
      { slug: 'pembukuan', label: 'Pembukuan' },
      { slug: 'konsultan-pajak', label: 'Konsultan Pajak' },
      { slug: 'konsultan-keuangan', label: 'Konsultan Keuangan' },
      { slug: 'asuransi', label: 'Asuransi' },
      { slug: 'administrasi-bisnis', label: 'Administrasi Bisnis' },
      { slug: 'penggajian', label: 'Penggajian' },
      { slug: 'jasa-penagihan', label: 'Jasa Penagihan' },
    ],
  },
  {
    slug: 'media-kreatif',
    label: 'Media dan Kreatif',
    subtypes: [
      { slug: 'content-creator', label: 'Content Creator' },
      { slug: 'media-digital', label: 'Media Digital' },
      { slug: 'periklanan', label: 'Periklanan' },
      { slug: 'penerbitan', label: 'Penerbitan' },
      { slug: 'penulisan', label: 'Penulisan' },
      { slug: 'penerjemahan', label: 'Penerjemahan' },
      { slug: 'ilustrasi-seni', label: 'Ilustrasi dan Seni' },
      { slug: 'musik-audio', label: 'Musik dan Audio' },
      { slug: 'manajemen-influencer', label: 'Manajemen Influencer' },
    ],
  },
  {
    slug: 'energi-lingkungan',
    label: 'Energi dan Lingkungan',
    subtypes: [
      { slug: 'energi', label: 'Energi' },
      { slug: 'energi-terbarukan', label: 'Energi Terbarukan' },
      { slug: 'kelistrikan', label: 'Kelistrikan' },
      { slug: 'pengelolaan-limbah', label: 'Pengelolaan Limbah' },
      { slug: 'daur-ulang', label: 'Daur Ulang' },
      { slug: 'pengolahan-air', label: 'Pengolahan Air' },
      { slug: 'jasa-lingkungan', label: 'Jasa Lingkungan' },
    ],
  },
  {
    slug: 'organisasi-lainnya',
    label: 'Organisasi dan Lainnya',
    subtypes: [
      { slug: 'koperasi', label: 'Koperasi' },
      { slug: 'yayasan', label: 'Yayasan' },
      { slug: 'organisasi-nirlaba', label: 'Organisasi Nirlaba' },
      { slug: 'usaha-sosial', label: 'Usaha Sosial' },
      { slug: 'penyewaan-ruang', label: 'Penyewaan Ruang' },
      { slug: 'pengelolaan-fasilitas', label: 'Pengelolaan Fasilitas' },
      { slug: 'pertambangan', label: 'Pertambangan' },
      { slug: 'jasa-keamanan', label: 'Jasa Keamanan' },
      { slug: 'usaha-lainnya', label: 'Usaha Lainnya' },
    ],
  },
] as const satisfies readonly BusinessCategory[];

/** The taxonomy as a plain readonly array, for lookups and iteration. */
export const BUSINESS_CATEGORIES: readonly BusinessCategory[] = CATEGORY_DATA;

export type BusinessCategorySlug = (typeof CATEGORY_DATA)[number]['slug'];
export type BusinessSubtypeSlug = (typeof CATEGORY_DATA)[number]['subtypes'][number]['slug'];

/** Every subtype slug, in category order. Backs exhaustive runtime loops. */
export const BUSINESS_SUBTYPE_SLUGS: readonly BusinessSubtypeSlug[] = CATEGORY_DATA.flatMap(
  (category) => category.subtypes.map((subtype) => subtype.slug),
);

/** A subtype plus the category it hangs off, for labels and grouping. */
export type BusinessSubtypeInfo = BusinessSubtype & {
  categorySlug: BusinessCategorySlug;
  categoryLabel: string;
};

export function getBusinessCategory(slug: string): BusinessCategory | undefined {
  return BUSINESS_CATEGORIES.find((category) => category.slug === slug);
}

/**
 * Resolves a stored subtype slug to its full record.
 *
 * Returns `null` — never throws — for `null`, `undefined` or a slug the
 * taxonomy no longer knows (a future rename), so a stale value degrades to
 * "no business type" everywhere it is displayed.
 */
export function getBusinessSubtype(slug: string | null | undefined): BusinessSubtypeInfo | null {
  if (!slug) return null;
  for (const category of CATEGORY_DATA) {
    const subtype = category.subtypes.find((candidate) => candidate.slug === slug);
    if (subtype) {
      return { ...subtype, categorySlug: category.slug, categoryLabel: category.label };
    }
  }
  return null;
}

/** Display label for a stored slug, or `null` when it resolves to nothing. */
export function businessSubtypeLabel(slug: string | null | undefined): string | null {
  return getBusinessSubtype(slug)?.label ?? null;
}

/** True when the slug is one the taxonomy actually defines. */
export function isBusinessSubtypeSlug(slug: string): slug is BusinessSubtypeSlug {
  return getBusinessSubtype(slug) !== null;
}

/**
 * Categories with the subtypes whose label (or the category's own label)
 * contains `query`, case-insensitively. Categories whose label matches keep
 * all their subtypes — searching "Otomotif" should show all ten choices.
 * An empty query returns the taxonomy untouched.
 */
export function searchBusinessSubtypes(query: string): BusinessCategory[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return [...BUSINESS_CATEGORIES];

  return BUSINESS_CATEGORIES.flatMap((category) => {
    const categoryMatches = category.label.toLowerCase().includes(needle);
    if (categoryMatches) return [category];
    const subtypes = category.subtypes.filter((subtype) =>
      subtype.label.toLowerCase().includes(needle),
    );
    return subtypes.length > 0 ? [{ ...category, subtypes }] : [];
  });
}
