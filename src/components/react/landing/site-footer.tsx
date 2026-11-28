type Props = {
  /** Prefix for on-page anchors: `''` on the landing page, `'/'` anywhere else. */
  anchorPrefix?: string;
};

const LINK = 'text-muted transition-colors hover:text-ink';

/** Column label: sentence case, one step up in weight — not a tracked eyebrow. */
const GROUP = 'text-sm font-medium';

/** Shared marketing footer, used by the landing and pricing pages. */
export function SiteFooter({ anchorPrefix = '' }: Props) {
  return (
    <footer className="border-t border-rule">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-9 px-5 py-10 sm:px-8">
        <div className="flex flex-col gap-9 sm:flex-row sm:justify-between sm:gap-12">
          <div className="max-w-xs">
            <a href="/" className="flex items-center gap-2 font-semibold tracking-tight text-ink">
              <img
                src="/notain-remove-bg.png"
                alt=""
                width={26}
                height={26}
                className="size-7 rounded-control"
              />
              Notain
            </a>
            <p className="mt-2.5 text-sm leading-relaxed text-muted">
              Buat nota, simpan PDF, lalu buka WhatsApp untuk melampirkan dan mengirimnya.
            </p>
          </div>

          <nav className="grid grid-cols-2 gap-x-10 gap-y-7 text-sm sm:grid-cols-3 sm:gap-x-14">
            <div>
              <p className={GROUP}>Produk</p>
              <ul className="mt-2.5 space-y-2">
                <li>
                  <a href={`${anchorPrefix}#fitur`} className={LINK}>
                    Fitur
                  </a>
                </li>
                <li>
                  <a href="/pricing" className={LINK}>
                    Harga
                  </a>
                </li>
                <li>
                  <a href={`${anchorPrefix}#cara-kerja`} className={LINK}>
                    Cara kerja
                  </a>
                </li>
                <li>
                  <a href={`${anchorPrefix}#kirim`} className={LINK}>
                    Kirim ke WhatsApp
                  </a>
                </li>
                <li>
                  <a href={`${anchorPrefix}#kenapa`} className={LINK}>
                    Kenapa Notain
                  </a>
                </li>
                <li>
                  <a href={`${anchorPrefix}#untuk-siapa`} className={LINK}>
                    Untuk siapa
                  </a>
                </li>
                <li>
                  <a href={`${anchorPrefix}#faq`} className={LINK}>
                    FAQ
                  </a>
                </li>
                <li>
                  <a href="/developers" className={LINK}>
                    Untuk developer
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <p className={GROUP}>Akun</p>
              <ul className="mt-2.5 space-y-2">
                <li>
                  <a href="/login" className={LINK}>
                    Masuk
                  </a>
                </li>
                <li>
                  <a href="/register" className={LINK}>
                    Daftar gratis
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <p className={GROUP}>Perusahaan</p>
              <ul className="mt-2.5 space-y-2">
                <li>
                  <a href="/blog" className={LINK}>
                    Blog
                  </a>
                </li>
                <li>
                  <a href="/contact" className={LINK}>
                    Kontak dan bantuan
                  </a>
                </li>
                <li>
                  <a href="/terms" className={LINK}>
                    Syarat &amp; Ketentuan
                  </a>
                </li>
                <li>
                  <a href="/privacy" className={LINK}>
                    Kebijakan Privasi
                  </a>
                </li>
              </ul>
            </div>
          </nav>
        </div>

        <div className="flex flex-col gap-1 border-t border-rule pt-5 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 Notain. Dibuat untuk UMKM Indonesia.</p>
          <p>Nota dan data usahamu tersimpan di akun Notain.</p>
        </div>
      </div>
    </footer>
  );
}
