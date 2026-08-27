import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { Reveal } from '@/components/motion/Reveal';
import { ButtonLink } from '@/components/ui/Button';
import { DocsSearch } from '@/components/docs/DocsSearch';
import { DOC_AUDIENCES, POPULAR_FLOWS, SEARCH_INDEX } from '@/lib/docs';

export const metadata: Metadata = {
  title: 'Documentação',
  description:
    'Documentação completa do nexaGO: todas as funcionalidades para atletas, organizadores e arenas, com fluxos passo a passo e telas de cada recurso.',
  alternates: { canonical: '/docs' },
  openGraph: {
    title: 'Documentação · nexaGO',
    description: 'Todas as funcionalidades do nexaGO explicadas em detalhe — atletas, organizadores e arenas.',
    url: '/docs',
  },
};

export default function DocsPage() {
  return (
    <main className="mx-auto max-w-6xl px-5 pb-24 pt-28 sm:px-6 sm:pt-32">
      <Reveal className="mx-auto max-w-3xl text-center">
        <p className="mb-3 font-mono text-sm font-600 uppercase tracking-[0.2em] text-brand">Documentação</p>
        <h1 className="font-display text-[clamp(2.2rem,6vw,3.8rem)] font-800 leading-tight tracking-tight text-fg">
          Cada funcionalidade, explicada de ponta a ponta
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-balance text-base leading-relaxed text-text-mute sm:text-lg">
          O manual completo do nexaGO para atletas, organizadores e arenas — com as telas de cada recurso e os
          fluxos mais complexos passo a passo.
        </p>
      </Reveal>

      <Reveal delay={0.08} className="mt-9">
        <DocsSearch index={SEARCH_INDEX} hero />
      </Reveal>

      <div className="mt-16 grid gap-5 md:grid-cols-3">
        {DOC_AUDIENCES.map((audience, i) => {
          const total = audience.groups.reduce((n, g) => n + g.features.length, 0);
          const highlights = audience.groups.flatMap((g) => g.features).slice(0, 4);
          return (
            <Reveal key={audience.id} delay={i * 0.08}>
              <Link
                href={`/docs/${audience.id}`}
                className="group flex h-full flex-col overflow-hidden rounded-5 border border-line bg-surface-1 transition-colors duration-200 hover:border-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                {audience.hero && (
                  <div className="relative h-44 overflow-hidden border-b border-line bg-surface-0">
                    <Image
                      src={audience.hero.src}
                      alt={audience.hero.alt}
                      width={1179}
                      height={2556}
                      sizes="(max-width: 768px) 90vw, 30vw"
                      className="absolute left-1/2 top-6 w-[62%] -translate-x-1/2 rounded-t-2xl border border-line-strong transition-transform duration-300 ease-out group-hover:-translate-y-1.5 motion-reduce:transition-none"
                    />
                    <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-surface-1 to-transparent" aria-hidden="true" />
                  </div>
                )}
                <div className="flex flex-1 flex-col p-6">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-display text-xl font-bold tracking-tight text-fg">{audience.label}</h2>
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-dim">
                      {total} recursos
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-text-mute">{audience.tagline}</p>
                  <ul className="mt-4 space-y-1.5">
                    {highlights.map((f) => (
                      <li key={f.id} className="flex items-center gap-2 text-[13px] text-text-mute">
                        <span className="size-1 rounded-full bg-brand" aria-hidden="true" />
                        {f.title}
                      </li>
                    ))}
                  </ul>
                  <span className="mt-auto inline-flex items-center gap-1.5 pt-5 text-sm font-semibold text-brand">
                    Ver documentação
                    <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
                  </span>
                </div>
              </Link>
            </Reveal>
          );
        })}
      </div>

      <Reveal delay={0.1} className="mt-16">
        <h2 className="font-display text-xl font-bold tracking-tight text-fg sm:text-2xl">Fluxos mais buscados</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {POPULAR_FLOWS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group flex items-center justify-between gap-4 rounded-4 border border-line bg-surface-1 px-5 py-4 transition-colors duration-200 hover:border-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <span>
                <span className="block text-sm font-bold tracking-tight text-fg">{item.title}</span>
                <span className="mt-0.5 block text-xs text-text-mute">{item.audience}</span>
              </span>
              <ArrowUpRight className="size-4 shrink-0 text-text-dim transition-colors duration-200 group-hover:text-brand" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </Reveal>

      <Reveal delay={0.1}>
        <div className="mt-16 rounded-5 border border-brand/20 bg-surface-1 p-8 text-center">
          <h2 className="font-display text-xl font-700 tracking-tight text-fg">Não achou o que procurava?</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-text-mute">
            A <Link href="/ajuda" className="font-semibold text-brand hover:text-brand-light">central de ajuda</Link> responde
            as dúvidas rápidas — e nossa equipe responde o restante pelo formulário de contato.
          </p>
          <div className="mt-6 flex justify-center">
            <ButtonLink href="/contato">Falar com a gente</ButtonLink>
          </div>
        </div>
      </Reveal>
    </main>
  );
}
