import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound, permanentRedirect } from 'next/navigation';
import { Check } from 'lucide-react';
import { Reveal } from '@/components/motion/Reveal';
import { ButtonLink } from '@/components/ui/Button';
import { ArenaHero } from '@/components/hub/ArenaHero';
import { getArenaById } from '@/lib/firestore/arenas';
import { sportLabel } from '@/lib/format';
import { extractId, toSlugId } from '@/lib/slug';

const BASE = 'https://nexago.com.br';

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const arena = await getArenaById(extractId(id));
  if (!arena) return { title: 'Arena não encontrada' };
  const place = [arena.city, arena.state].filter(Boolean).join(', ');
  const desc = arena.description ?? `Conheça a ${arena.name}${place ? ` em ${place}` : ''} no nexaGO.`;
  const slug = toSlugId(arena.name, arena.id);
  return {
    title: arena.name,
    description: desc,
    alternates: { canonical: `/arena/${slug}` },
    openGraph: { title: `${arena.name} · nexaGO`, description: desc, url: `/arena/${slug}` },
  };
}

// O segmento `[id]` aceita "slug-id"; o id real é extraído do final e links antigos
// só com o id redirecionam para a URL canônica com slug.
export default async function ArenaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const arena = await getArenaById(extractId(id));
  if (!arena) notFound();

  const slug = toSlugId(arena.name, arena.id);
  if (id !== slug) permanentRedirect(`/arena/${slug}`);

  const place = [arena.city, arena.state].filter(Boolean).join(' · ');
  // A 1ª foto vira capa no ArenaHero; a galeria mostra as demais para não duplicar.
  const galleryPhotos = arena.photoUrls.slice(1, 7);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SportsActivityLocation',
    name: arena.name,
    url: `${BASE}/arena/${slug}`,
    ...(place && { address: place }),
    ...(arena.photoUrls[0] && { image: arena.photoUrls[0] }),
  };

  return (
    <main className="pb-24">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <ArenaHero arena={arena} />

      <div className="mx-auto max-w-5xl px-5 sm:px-6">
        {/* Galeria */}
        {galleryPhotos.length > 0 && (
          <Reveal delay={0.05}>
            <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {galleryPhotos.map((url, i) => (
                <div key={url} className="relative aspect-[4/3] overflow-hidden rounded-4 border border-line bg-surface-1">
                  <Image
                    src={url}
                    alt={`${arena.name} — foto ${i + 2}`}
                    fill
                    sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                    className="object-cover"
                  />
                </div>
              ))}
            </div>
          </Reveal>
        )}

        {/* Sobre */}
      {arena.description && (
        <Reveal delay={0.05}>
          <section className="mt-12">
            <h2 className="font-display text-xl font-700 tracking-tight text-fg">Sobre a arena</h2>
            <p className="mt-3 max-w-2xl text-balance text-base leading-relaxed text-text-mute">
              {arena.description}
            </p>
          </section>
        </Reveal>
      )}

      {/* Comodidades */}
      {arena.amenities.length > 0 && (
        <Reveal delay={0.05}>
          <section className="mt-12">
            <h2 className="font-display text-xl font-700 tracking-tight text-fg">Comodidades</h2>
            <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {arena.amenities.map((a) => (
                <li key={a} className="flex items-center gap-2.5 text-sm text-fg">
                  <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-tint text-brand">
                    <Check className="size-3.5" aria-hidden="true" />
                  </span>
                  {a}
                </li>
              ))}
            </ul>
          </section>
        </Reveal>
      )}

      {/* Quadras */}
      {arena.courts.length > 0 && (
        <Reveal delay={0.05}>
          <section className="mt-12">
            <h2 className="font-display text-xl font-700 tracking-tight text-fg">Quadras</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {arena.courts.map((c, i) => (
                <div key={c.id} className="rounded-4 border border-line bg-surface-1 p-5">
                  <p className="font-display text-base font-700 tracking-tight text-fg">
                    {c.name ?? `Quadra ${i + 1}`}
                  </p>
                  <p className="mt-1 text-sm text-text-mute">
                    {[c.sport && sportLabel(c.sport), c.surface].filter(Boolean).join(' · ') || 'Areia'}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </Reveal>
      )}

      {/* CTA */}
      <Reveal delay={0.1}>
        <div className="mt-16 rounded-5 border border-brand/20 bg-surface-1 p-8 text-center">
          <h2 className="font-display text-xl font-700 tracking-tight text-fg">Jogue nesta arena</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-text-mute">
            Baixe o nexaGO para encontrar torneios e etapas nesta e em outras arenas da areia.
          </p>
          <div className="mt-6 flex justify-center">
            <ButtonLink href="https://linktr.ee/nexago">Baixar o app</ButtonLink>
          </div>
        </div>
      </Reveal>
      </div>
    </main>
  );
}
