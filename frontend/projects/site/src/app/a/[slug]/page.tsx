import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LinkInBioPage } from '@/components/bio/LinkInBioPage';
import { getAllLinkPageSlugs, getLinkPageBySlug } from '@/lib/firestore/link-pages';
import { ensureNonEmptyParams } from '@/lib/slug';

export const revalidate = 300;

export async function generateStaticParams() {
  const slugs = await getAllLinkPageSlugs('arena');
  return ensureNonEmptyParams(slugs.map((slug) => ({ slug })), { slug: '_' });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = await getLinkPageBySlug(slug, 'arena');
  if (!page) return { title: 'Página não encontrada' };

  const description = page.bio || `Links da ${page.title} no nexaGO.`;
  return {
    title: page.title,
    description,
    alternates: { canonical: `/a/${page.slug}` },
    openGraph: {
      title: page.title,
      description,
      url: `/a/${page.slug}`,
      ...(page.avatarUrl && { images: [page.avatarUrl] }),
    },
  };
}

/** Página pública de links de uma arena — `nexago.com.br/a/{slug}`. */
export default async function ArenaLinksPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getLinkPageBySlug(slug, 'arena');
  if (!page) notFound();

  return <LinkInBioPage page={page} />;
}
