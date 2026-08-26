import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Reveal } from '@/components/motion/Reveal';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { getAllPosts } from '@/lib/blog/posts';
import { formatDate } from '@/lib/format';

const BASE = 'https://nexago.com.br';

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Novidades, guias e recaps do nexaGO — Liga, torneios e a comunidade dos esportes de areia.',
  alternates: { canonical: '/blog' },
  openGraph: {
    title: 'Blog · nexaGO',
    description: 'Novidades, guias e recaps dos esportes de areia.',
    url: '/blog',
  },
};

export default function BlogPage() {
  const posts = getAllPosts();

  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Blog nexaGO',
    itemListElement: posts.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${BASE}/blog/${p.slug}`,
      name: p.title,
    })),
  };

  return (
    <main className="mx-auto max-w-6xl px-5 pb-24 pt-28 sm:px-6 sm:pt-32">
      {posts.length > 0 && (
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
        />
      )}

      <Reveal className="max-w-2xl">
        <p className="mb-3 font-mono text-sm font-600 uppercase tracking-[0.2em] text-brand">Blog</p>
        <h1 className="font-display text-[clamp(2rem,6vw,3.5rem)] font-800 leading-tight tracking-tight text-fg">
          Histórias da areia
        </h1>
        <p className="mt-4 text-balance text-base text-text-mute sm:text-lg">
          Guias, novidades e recaps das etapas — tudo sobre o ecossistema nexaGO.
        </p>
      </Reveal>

      {posts.length === 0 ? (
        <div className="mt-16 rounded-5 border border-line bg-surface-1 p-12 text-center">
          <p className="font-display text-lg font-700 text-fg">Nada por aqui ainda</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-text-mute">
            Os primeiros conteúdos chegam em breve.
          </p>
        </div>
      ) : (
        <ul className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((p, i) => (
            <li key={p.slug}>
              <Reveal delay={i * 0.06} className="h-full">
                <SpotlightCard className="h-full">
                  <Link
                    href={`/blog/${p.slug}`}
                    className="flex h-full flex-col p-7 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                  >
                    {p.tags && p.tags.length > 0 && (
                      <span className="font-mono text-xs font-600 uppercase tracking-wider text-text-dim">
                        {p.tags[0]}
                      </span>
                    )}
                    <h2 className="mt-2 font-display text-lg font-700 leading-snug tracking-tight text-fg transition-colors group-hover/spot:text-brand">
                      {p.title}
                    </h2>
                    <p className="mt-2.5 flex-1 text-sm leading-relaxed text-text-mute">{p.excerpt}</p>
                    <div className="mt-6 flex items-center justify-between border-t border-line pt-4">
                      <time dateTime={p.date} className="text-xs text-text-dim">
                        {formatDate(new Date(p.date))}
                      </time>
                      <ArrowRight
                        className="size-4 text-brand transition-transform duration-200 ease-out group-hover/spot:translate-x-0.5 motion-reduce:transition-none"
                        aria-hidden="true"
                      />
                    </div>
                  </Link>
                </SpotlightCard>
              </Reveal>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
