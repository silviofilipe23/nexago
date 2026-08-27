import type { LinkGlyphName } from '@/lib/firestore/link-pages';

const PATHS: Record<LinkGlyphName, React.ReactNode> = {
  link: (
    <>
      <path d="M10 14a5 5 0 0 0 7.5.5l2.5-2.5a5 5 0 0 0-7-7L11.5 6.5" />
      <path d="M14 10a5 5 0 0 0-7.5-.5L4 12a5 5 0 0 0 7 7l1.5-1.5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="16" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  whatsapp: (
    <>
      <path d="M21 11.5a8.5 8.5 0 0 1-12.4 7.6L3 21l1.9-5.6A8.5 8.5 0 1 1 21 11.5z" />
      <path d="M9 9.5c.5 2.5 3 5 5.5 5.5l1-1.5-2-1-1 .5c-.8-.5-1.5-1.2-2-2l.5-1-1-2-1 1.5z" />
    </>
  ),
  instagram: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17" cy="7" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  trophy: (
    <>
      <path d="M8 4h8v6a4 4 0 0 1-8 0V4z" />
      <path d="M8 5H4.5v2A3.5 3.5 0 0 0 8 10.5M16 5h3.5v2A3.5 3.5 0 0 1 16 10.5" />
      <path d="M12 14v4M8.5 21h7M10 18h4" />
    </>
  ),
  ticket: (
    <>
      <path d="M3 8.5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2V10a2 2 0 0 0 0 4v1.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V14a2 2 0 0 0 0-4z" />
      <path d="M14 6.5v11" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.6" />
    </>
  ),
  shirt: <path d="M8 4 3.5 7l1.8 3.5L8 9.5V20h8V9.5l2.7 1L20.5 7 16 4a4 4 0 0 1-8 0z" />,
  menu: <path d="M4 6h16M4 12h16M4 18h10" />,
  cash: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.6" />
    </>
  ),
  star: <path d="m12 2.5 3.1 6.5 7.1 1-5.1 5 1.2 7.1L12 18.7l-6.3 3.4 1.2-7.1-5.1-5 7.1-1z" />,
  users: (
    <>
      <circle cx="8.5" cy="8" r="3.3" />
      <path d="M2 20c0-3.6 2.9-6.3 6.5-6.3s6.5 2.7 6.5 6.3" />
      <path d="M15.8 8a3.3 3.3 0 1 1 0 6.6M17.5 13.9c2.6.6 4.5 2.9 4.5 6.1" />
    </>
  ),
  video: (
    <>
      <rect x="2.5" y="5" width="14" height="14" rx="3" />
      <path d="m16.5 10 5-3v10l-5-3z" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18z" />
    </>
  ),
};

/** Ícone de um link — mesmo traçado do catálogo `LinkIconName` usado nos painéis. */
export function LinkGlyph({ name, size = 20 }: { name: LinkGlyphName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
