import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Reveal } from '@/components/motion/Reveal';
import { DocsSearch } from '@/components/docs/DocsSearch';
import { DocsSidebar } from '@/components/docs/DocsSidebar';
import { FeatureSection } from '@/components/docs/FeatureSection';
import { DOC_AUDIENCES, SEARCH_INDEX } from '@/lib/docs';

type Params = { audience: string };

export function generateStaticParams(): Params[] {
  return DOC_AUDIENCES.map((a) => ({ audience: a.id }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { audience: id } = await params;
  const audience = DOC_AUDIENCES.find((a) => a.id === id);
  if (!audience) return {};
  return {
    title: `Documentação para ${audience.label.toLowerCase()}`,
    description: `${audience.tagline} — todas as funcionalidades do nexaGO para ${audience.label.toLowerCase()}, com telas e fluxos passo a passo.`,
    alternates: { canonical: `/docs/${audience.id}` },
    openGraph: {
      title: `Documentação para ${audience.label.toLowerCase()} · nexaGO`,
      description: audience.tagline,
      url: `/docs/${audience.id}`,
    },
  };
}

export default async function DocsAudiencePage({ params }: { params: Promise<Params> }) {
  const { audience: id } = await params;
  const index = DOC_AUDIENCES.findIndex((a) => a.id === id);
  if (index === -1) notFound();

  const audience = DOC_AUDIENCES[index];
  const prev = DOC_AUDIENCES[index - 1];
  const next = DOC_AUDIENCES[index + 1];
  const sidebarGroups = audience.groups.map((g) => ({
    title: g.title,
    items: g.features.map((f) => ({ id: f.id, title: f.title })),
  }));

  return (
    <main className="mx-auto max-w-6xl px-5 pb-24 pt-28 sm:px-6 sm:pt-32">
      <Reveal>
        <nav aria-label="Trilha" className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-text-dim">
          <Link href="/docs" className="transition-colors hover:text-brand">
            Documentação
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-text-mute">{audience.label}</span>
        </nav>

        <div className="mt-6 max-w-3xl">
          <h1 className="font-display text-[clamp(2rem,5vw,3.2rem)] font-800 leading-tight tracking-tight text-fg">
            {audience.tagline}
          </h1>
          <p className="mt-4 text-base leading-relaxed text-text-mute sm:text-lg">{audience.description}</p>
          <p className="mt-4 inline-flex items-center rounded-pill border border-line bg-surface-1 px-3.5 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-text-mute">
            {audience.surface}
          </p>
        </div>
      </Reveal>

      <Reveal delay={0.06} className="mt-8 max-w-xl">
        <DocsSearch index={SEARCH_INDEX} />
      </Reveal>

      <div className="mt-12 gap-12 lg:grid lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-28 max-h-[calc(100dvh-8rem)] overflow-y-auto pb-8 pr-2">
            <DocsSidebar groups={sidebarGroups} />
          </div>
        </aside>

        <div className="min-w-0">
          {audience.groups.map((group) => (
            <section key={group.title} aria-label={group.title} className="mb-16 last:mb-0">
              <h2 className="mb-2 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-brand">
                {group.title}
              </h2>
              <div className="space-y-12">
                {group.features.map((feature) => (
                  <FeatureSection key={feature.id} feature={feature} />
                ))}
              </div>
            </section>
          ))}

          <nav aria-label="Outras documentações" className="mt-16 grid gap-3 border-t border-line pt-8 sm:grid-cols-2">
            {prev ? (
              <Link
                href={`/docs/${prev.id}`}
                className="group flex items-center gap-3 rounded-4 border border-line bg-surface-1 px-5 py-4 transition-colors duration-200 hover:border-brand/40"
              >
                <ArrowLeft className="size-4 shrink-0 text-text-dim transition-colors group-hover:text-brand" aria-hidden="true" />
                <span>
                  <span className="block font-mono text-[10px] uppercase tracking-wider text-text-dim">Anterior</span>
                  <span className="block text-sm font-bold text-fg">{prev.label}</span>
                </span>
              </Link>
            ) : (
              <span aria-hidden="true" />
            )}
            {next && (
              <Link
                href={`/docs/${next.id}`}
                className="group flex items-center justify-end gap-3 rounded-4 border border-line bg-surface-1 px-5 py-4 text-right transition-colors duration-200 hover:border-brand/40 sm:col-start-2"
              >
                <span>
                  <span className="block font-mono text-[10px] uppercase tracking-wider text-text-dim">Próxima</span>
                  <span className="block text-sm font-bold text-fg">{next.label}</span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-text-dim transition-colors group-hover:text-brand" aria-hidden="true" />
              </Link>
            )}
          </nav>
        </div>
      </div>
    </main>
  );
}
