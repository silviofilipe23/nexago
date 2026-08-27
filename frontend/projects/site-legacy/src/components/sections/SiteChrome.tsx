'use client';

import { usePathname } from 'next/navigation';

/** Rotas que saem sem o chrome institucional (cabeçalho/rodapé do nexaGO). */
const BARE_PREFIXES = ['/a/', '/o/', '/s/'];

/**
 * Esconde o cabeçalho/rodapé do site nas páginas públicas de links e no
 * mini-site de arena (`/s/{slug}`), que tem nav própria.
 *
 * Essas páginas (`/a/{slug}`, `/o/{slug}`) são a marca da arena/do organizador, não do
 * nexaGO — a única assinatura é o "feito com nexaGO" do rodapé da própria página. Como o
 * App Router só admite um root layout por app, o recorte é feito aqui, pela rota, em vez de
 * fatiar o site inteiro em route groups.
 */
export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname && BARE_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null;
  return <>{children}</>;
}
