import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Reveal } from '@/components/motion/Reveal';
import { getAllPosts, getPostBySlug } from '@/lib/blog/posts';
import { formatDate } from '@/lib/format';

const BASE = 'https://nexago.com.br';

const prose =
  'space-y-5 text-[15px] leading-relaxed text-text-mute sm:text-base ' +
  '[&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-700 [&_h2]:tracking-tight [&_h2]:text-fg ' +
  '[&_strong]:font-600 [&_strong]:text-fg ' +
  '[&_ul]:ml-5 [&_ul]:list-disc [&_ul]:space-y-2 [&_li]:marker:text-brand [&_a]:text-brand [&_a]:underline-offset-2 hover:[&_a]:underline';

export function generateStaticParams() {
  return getAllPosts().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return { title: 'Post não encontrado' };
  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: 'article',
      title: post.title,
      description: post.excerpt,
      url: `/blog/${post.slug}`,
      publishedTime: post.date,
    },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.excerpt,
    datePublished: post.date,
    url: `${BASE}/blog/${post.slug}`,
    author: { '@type': 'Organization', name: 'nexaGO' },
    publisher: { '@type': 'Organization', name: 'nexaGO' },
  };

  const { Body } = post;

  return (
    <main className="mx-auto max-w-3xl px-5 pb-24 pt-28 sm:px-6 sm:pt-32">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />

      <Reveal>
        <Link
          href="/blog"
          className="inline-flex items-center gap-1.5 text-sm font-500 text-text-mute transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:rounded-2"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Voltar ao blog
        </Link>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          {post.tags?.map((t) => (
            <span key={t} className="font-mono text-xs font-600 uppercase tracking-wider text-brand">
              {t}
            </span>
          ))}
          <time dateTime={post.date} className="text-xs text-text-dim">
            {formatDate(new Date(post.date))}
          </time>
        </div>

        <h1 className="mt-4 font-display text-[clamp(2rem,5.5vw,3.25rem)] font-800 leading-tight tracking-tight text-fg">
          {post.title}
        </h1>
      </Reveal>

      <article className={`mt-10 ${prose}`}>
        <Body />
      </article>
    </main>
  );
}
