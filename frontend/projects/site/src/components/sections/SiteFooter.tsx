import Image from 'next/image';
import Link from 'next/link';

function InstagramIcon() {
  return (
    <svg className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

const COLUMNS = [
  {
    title: 'Plataforma',
    links: [
      { label: 'Como funciona', href: '/#como-funciona' },
      { label: 'Ligas nexaGO', href: '/ligas' },
      { label: 'Rankings', href: '/rankings' },
      { label: 'Torneios', href: '/torneios' },
      { label: 'Blog', href: '/blog' },
      { label: 'Baixar o app', href: '/#download' },
    ],
  },
  {
    title: 'Para você',
    links: [
      { label: 'Atletas', href: '/#download' },
      { label: 'Organizadores', href: '/organizadores' },
      { label: 'Arenas', href: '/arenas' },
    ],
  },
  {
    title: 'nexaGO',
    links: [
      { label: 'Sobre', href: '/sobre' },
      { label: 'Ajuda', href: '/ajuda' },
      { label: 'Privacidade', href: '/privacidade' },
      { label: 'Termos de uso', href: '/termos' },
      { label: 'Contato', href: '/contato' },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface-0">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div>
            <Link href="/" className="flex items-center gap-2.5" aria-label="nexaGO — início">
              <Image src="/brand/logo.png" alt="" width={32} height={32} className="size-8" />
              <span className="font-display text-lg font-bold tracking-tight text-fg">
                nexa<span className="text-brand">GO</span>
              </span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-text-mute">
              A plataforma dos esportes de areia. Vôlei de praia, do amador ao
              profissional.
            </p>
            <a
              href="https://www.instagram.com/nexagobr"
              target="_blank"
              rel="me noopener noreferrer"
              aria-label="Instagram do nexaGO (@nexagobr)"
              className="mt-6 inline-flex size-10 items-center justify-center rounded-3 border border-line text-text-mute transition-colors hover:border-brand hover:text-brand"
            >
              <InstagramIcon />
            </a>
          </div>

          {COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <h3 className="font-mono text-xs font-600 uppercase tracking-wider text-text-dim">{col.title}</h3>
              <ul className="mt-4 space-y-3">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      className="text-sm text-text-mute transition-colors hover:text-fg"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-start justify-between gap-3 border-t border-line pt-8 sm:flex-row sm:items-center">
          <p className="text-sm text-text-dim">© {new Date().getFullYear()} nexaGO. Todos os direitos reservados.</p>
          <p className="text-sm text-text-dim">nexaGO · Vôlei de praia</p>
        </div>
      </div>
    </footer>
  );
}
