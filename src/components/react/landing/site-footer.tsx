type Props = {
  /** Prefix for on-page anchors: `''` on the landing page, `'/'` anywhere else. */
  anchorPrefix?: string;
};

/** Shared marketing footer, used by the landing and pricing pages. */
export function SiteFooter({ anchorPrefix = '' }: Props) {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-12 sm:px-8">
        <div className="flex flex-col gap-10 sm:flex-row sm:justify-between">
          <div className="max-w-xs">
            <a href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <img
                src="/notain-remove-bg.png"
                alt=""
                width={28}
                height={28}
                className="size-7 rounded-lg"
              />
              Notain
            </a>
            <p className="mt-3 text-sm text-muted">
              Bikin invoice profesional, download PDF-nya, kirim lewat WhatsApp. Selesai.
            </p>
          </div>

          <nav className="grid grid-cols-2 gap-x-12 gap-y-6 text-sm sm:gap-x-16">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Produk</p>
              <ul className="mt-3 space-y-2.5">
                <li>
                  <a href="/pricing" className="text-muted hover:text-foreground">
                    Harga
                  </a>
                </li>
                <li>
                  <a
                    href={`${anchorPrefix}#cara-kerja`}
                    className="text-muted hover:text-foreground"
                  >
                    Cara kerja
                  </a>
                </li>
                <li>
                  <a href={`${anchorPrefix}#whatsapp`} className="text-muted hover:text-foreground">
                    Kirim ke WhatsApp
                  </a>
                </li>
                <li>
                  <a href={`${anchorPrefix}#kenapa`} className="text-muted hover:text-foreground">
                    Kenapa Notain
                  </a>
                </li>
                <li>
                  <a href={`${anchorPrefix}#faq`} className="text-muted hover:text-foreground">
                    FAQ
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Akun</p>
              <ul className="mt-3 space-y-2.5">
                <li>
                  <a href="/login" className="text-muted hover:text-foreground">
                    Masuk
                  </a>
                </li>
                <li>
                  <a href="/register" className="text-muted hover:text-foreground">
                    Daftar gratis
                  </a>
                </li>
              </ul>
            </div>
          </nav>
        </div>

        <div className="flex flex-col gap-2 border-t border-border pt-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 Notain. Dibuat untuk UMKM Indonesia.</p>
          <p>Invoice kamu tersimpan aman di akun Notain.</p>
        </div>
      </div>
    </footer>
  );
}
