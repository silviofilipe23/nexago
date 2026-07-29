import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LinkInBioPage } from '@/components/bio/LinkInBioPage';
import { getLinkPageBySlug } from '@/lib/firestore/link-pages';

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = await getLinkPageBySlug(slug, 'organizer');
  if (!page) return { title: 'Página não encontrada' };

  const description = page.bio || `Torneios e links de ${page.title} no nexaGO.`;
  return {
    title: page.title,
    description,
    alternates: { canonical: `/o/${page.slug}` },
    openGraph: {
      title: page.title,
      description,
      url: `/o/${page.slug}`,
      ...(page.avatarUrl && { images: [page.avatarUrl] }),
    },
  };
}

/** Página pública de links de um organizador — `nexago.com.br/o/{slug}`. */
export default async function OrganizerLinksPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getLinkPageBySlug(slug, 'organizer');
  if (!page) notFound();

  return <LinkInBioPage page={page} />;
}
