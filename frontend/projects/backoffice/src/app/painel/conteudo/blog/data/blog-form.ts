import { resolveSport } from '@nexago/sports';
import {
  BLOG_AUTHOR_FIELD_MAX,
  BLOG_BLOCKS_MAX,
  BLOG_CAPTION_MAX,
  BLOG_CTA_DESTINATIONS,
  BLOG_CTA_LABEL_MAX,
  BLOG_HEADING_MAX,
  BLOG_LIST_ITEMS_MAX,
  BLOG_LIST_ITEM_MAX,
  BLOG_PARAGRAPH_MAX,
  BLOG_QUOTE_MAX,
  BLOG_SEO_DESCRIPTION_MAX,
  BLOG_SLUG_MAX,
  BLOG_SUBTITLE_MAX,
  BLOG_TAGS_MAX,
  BLOG_TAG_MAX,
  BLOG_TITLE_MAX,
  saoPauloIso,
  saoPauloParts,
  slugify,
  type BlogBlock,
  type BlogCategory,
  type BlogCtaDestination,
  type BlogPost,
  type BlogPostInput,
  type BlogStatus,
} from './blog-post';

/** Bloco no editor: o do post + uma chave estável para o `@for` (mover não recria o campo). */
export type BlockDraft = BlogBlock & { key: string };

export interface BlogDraft {
  title: string;
  subtitle: string;
  slug: string;
  /** `false` = o endereço acompanha o título. */
  slugTouched: boolean;
  seoDescription: string;
  coverUrl: string | null;
  category: BlogCategory;
  sport: string;
  tags: string[];
  authorName: string;
  authorRole: string;
  body: BlockDraft[];
  ctaEnabled: boolean;
  ctaLabel: string;
  ctaDestination: BlogCtaDestination;
  ctaUrl: string;
  app: boolean;
  site: boolean;
  featured: boolean;
  /** Para onde o save leva o post. */
  status: BlogStatus;
  /** Parede de São Paulo; obrigatória para agendar, opcional (data planejada) em rascunho/revisão. */
  date: string;
  time: string;
}

export const DEFAULT_TIME = '09:00';
export const DEFAULT_AUTHOR_ROLE = 'Equipe nexaGO';

let keySeq = 0;
function nextKey(): string {
  keySeq += 1;
  return `b${keySeq}`;
}

export function emptyBlock(type: BlogBlock['type']): BlockDraft {
  switch (type) {
    case 'list':
      return { key: nextKey(), type, items: [''] };
    case 'image':
      return { key: nextKey(), type, url: '', caption: '' };
    default:
      return { key: nextKey(), type, text: '' };
  }
}

export function newBlogDraft(authorName: string): BlogDraft {
  return {
    title: '',
    subtitle: '',
    slug: '',
    slugTouched: false,
    seoDescription: '',
    coverUrl: null,
    category: 'torneios',
    sport: 'all',
    tags: [],
    authorName: authorName.slice(0, BLOG_AUTHOR_FIELD_MAX),
    authorRole: DEFAULT_AUTHOR_ROLE,
    body: [emptyBlock('paragraph')],
    ctaEnabled: false,
    ctaLabel: '',
    ctaDestination: 'torneios',
    ctaUrl: '',
    app: true,
    site: true,
    featured: false,
    status: 'draft',
    date: '',
    time: DEFAULT_TIME,
  };
}

export function draftFromPost(post: BlogPost): BlogDraft {
  const at = post.publishAt ? saoPauloParts(post.publishAt) : null;
  // Rascunho com o endereço ainda igual ao do título continua acompanhando; publicado/agendado
  // fica preso: trocar o endereço de quem já tem link quebra o link.
  const following = (post.status === 'draft' || post.status === 'review') && post.slug === slugify(post.title);
  return {
    title: post.title,
    subtitle: post.subtitle,
    slug: post.slug,
    slugTouched: !following,
    seoDescription: post.seoDescription,
    coverUrl: post.coverUrl,
    category: post.category,
    sport: post.sport,
    tags: [...post.tags],
    authorName: post.author.name,
    authorRole: post.author.role,
    body: post.body.map((b) => ({ ...b, ...(b.type === 'list' ? { items: [...b.items] } : {}), key: nextKey() })),
    ctaEnabled: post.cta !== null,
    ctaLabel: post.cta?.label ?? '',
    ctaDestination: post.cta?.destination ?? 'torneios',
    ctaUrl: post.cta?.url ?? '',
    app: post.channels.app,
    site: post.channels.site,
    featured: post.featured,
    status: post.status,
    date: at?.date ?? '',
    time: at?.time ?? DEFAULT_TIME,
  };
}

/** Título mudou: o endereço acompanha enquanto ninguém mexeu nele. */
export function withTitle(draft: BlogDraft, title: string): BlogDraft {
  return { ...draft, title, slug: draft.slugTouched ? draft.slug : slugify(title) };
}

/** O que o usuário digita no endereço vira slug válido na hora (acento, espaço, maiúscula). */
export function withSlug(draft: BlogDraft, raw: string): BlogDraft {
  const typed = raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+/, '')
    .slice(0, BLOG_SLUG_MAX);
  return typed ? { ...draft, slug: typed, slugTouched: true } : { ...draft, slug: slugify(draft.title), slugTouched: false };
}

export function cleanTag(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().replace(/^#/, '').toLowerCase();
}

export function withTag(draft: BlogDraft, raw: string): BlogDraft {
  const tag = cleanTag(raw);
  if (!tag || draft.tags.includes(tag) || draft.tags.length >= BLOG_TAGS_MAX) {
    return draft;
  }
  return { ...draft, tags: [...draft.tags, tag.slice(0, BLOG_TAG_MAX)] };
}

export function moveBlock(blocks: readonly BlockDraft[], index: number, delta: -1 | 1): BlockDraft[] {
  const to = index + delta;
  if (to < 0 || to >= blocks.length) {
    return [...blocks];
  }
  const next = [...blocks];
  [next[index], next[to]] = [next[to]!, next[index]!];
  return next;
}

/** Bloco sem nada escrito: some no save em vez de travar o post (o parágrafo vazio do fim, por ex.). */
export function isBlankBlock(b: BlogBlock): boolean {
  switch (b.type) {
    case 'list':
      return b.items.every((i) => !i.trim());
    case 'image':
      return !b.url.trim();
    default:
      return !b.text.trim();
  }
}

function stripKey(b: BlockDraft): BlogBlock {
  switch (b.type) {
    case 'list':
      return { type: 'list', items: b.items.map((i) => i.trim()).filter(Boolean) };
    case 'image':
      return { type: 'image', url: b.url.trim(), caption: b.caption.trim() };
    case 'paragraph':
      return { type: 'paragraph', text: b.text.trim() };
    default:
      return { type: b.type, text: b.text.trim() };
  }
}

/** `publishAt` pedido: agendar exige data; rascunho/revisão manda a data planejada se houver. */
export function requestedPublishAt(draft: BlogDraft): string | null {
  if (draft.status === 'published' || !draft.date) {
    return null;
  }
  return saoPauloIso(draft.date, draft.time || DEFAULT_TIME);
}

/** O `post` da callable `saveBlogPost`. */
export function payloadFromDraft(draft: BlogDraft): BlogPostInput {
  const title = draft.title.trim();
  return {
    title,
    subtitle: draft.subtitle.trim(),
    slug: draft.slugTouched ? draft.slug.replace(/-+$/g, '') : slugify(title),
    seoDescription: draft.seoDescription.trim(),
    coverUrl: draft.coverUrl,
    category: draft.category,
    sport: draft.sport,
    tags: [...new Set(draft.tags.map(cleanTag).filter(Boolean))],
    author: { name: draft.authorName.trim(), role: draft.authorRole.trim() },
    body: draft.body.filter((b) => !isBlankBlock(b)).map(stripKey),
    cta: draft.ctaEnabled
      ? {
          label: draft.ctaLabel.trim(),
          destination: draft.ctaDestination,
          url: draft.ctaDestination === 'url' ? draft.ctaUrl.trim() || null : null,
        }
      : null,
    channels: { app: draft.app, site: draft.site },
    featured: draft.featured,
    status: draft.status,
    publishAt: requestedPublishAt(draft),
  };
}

const isHttps = (v: unknown): boolean => typeof v === 'string' && v.length <= 1000 && /^https:\/\/\S+$/.test(v);
const line = (v: string) => v.replace(/\s+/g, ' ').trim();

function blockIssues(b: BlogBlock, n: number): string[] {
  const where = `Bloco ${n}`;
  switch (b.type) {
    case 'paragraph':
      return b.text.length > BLOG_PARAGRAPH_MAX ? [`${where}: parágrafo passa de ${BLOG_PARAGRAPH_MAX} caracteres.`] : [];
    case 'heading':
      return line(b.text).length > BLOG_HEADING_MAX ? [`${where}: subtítulo passa de ${BLOG_HEADING_MAX} caracteres.`] : [];
    case 'quote':
      return line(b.text).length > BLOG_QUOTE_MAX ? [`${where}: destaque passa de ${BLOG_QUOTE_MAX} caracteres.`] : [];
    case 'list':
      if (b.items.length > BLOG_LIST_ITEMS_MAX) {
        return [`${where}: lista passa de ${BLOG_LIST_ITEMS_MAX} itens.`];
      }
      return b.items.some((i) => line(i).length > BLOG_LIST_ITEM_MAX)
        ? [`${where}: item passa de ${BLOG_LIST_ITEM_MAX} caracteres.`]
        : [];
    case 'image':
      if (!isHttps(b.url)) {
        return [`${where}: imagem sem endereço https.`];
      }
      return line(b.caption).length > BLOG_CAPTION_MAX ? [`${where}: legenda passa de ${BLOG_CAPTION_MAX} caracteres.`] : [];
  }
}

/**
 * Os mesmos problemas que `blogPostErrors` (functions/src/blog.ts) devolveria, com o mesmo texto,
 * para o botão travar antes da ida ao servidor. Vazio = pode salvar.
 */
export function payloadIssues(p: BlogPostInput, now: Date): string[] {
  const errors: string[] = [];
  if (!line(p.title)) {
    errors.push('Dê um título ao post.');
  } else if (line(p.title).length > BLOG_TITLE_MAX) {
    errors.push(`Título passa de ${BLOG_TITLE_MAX} caracteres.`);
  }
  if (line(p.subtitle).length > BLOG_SUBTITLE_MAX) {
    errors.push(`Subtítulo passa de ${BLOG_SUBTITLE_MAX} caracteres.`);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.slug) || p.slug.length > BLOG_SLUG_MAX) {
    errors.push('Endereço inválido: use letras minúsculas, números e hífen.');
  }
  if (line(p.seoDescription).length > BLOG_SEO_DESCRIPTION_MAX) {
    errors.push(`Descrição passa de ${BLOG_SEO_DESCRIPTION_MAX} caracteres.`);
  }
  if (p.coverUrl !== null && !isHttps(p.coverUrl)) {
    errors.push('Capa sem endereço https.');
  }
  if (p.sport !== 'all' && !resolveSport(p.sport)) {
    errors.push('Esporte desconhecido.');
  }
  if (p.tags.length > BLOG_TAGS_MAX) {
    errors.push(`Até ${BLOG_TAGS_MAX} tags.`);
  }
  if (p.tags.some((t) => t.length > BLOG_TAG_MAX)) {
    errors.push(`Tag passa de ${BLOG_TAG_MAX} caracteres.`);
  }
  if (!line(p.author.name)) {
    errors.push('Informe o autor.');
  } else if (line(p.author.name).length > BLOG_AUTHOR_FIELD_MAX) {
    errors.push(`Nome do autor passa de ${BLOG_AUTHOR_FIELD_MAX} caracteres.`);
  }
  if (line(p.author.role).length > BLOG_AUTHOR_FIELD_MAX) {
    errors.push(`Função do autor passa de ${BLOG_AUTHOR_FIELD_MAX} caracteres.`);
  }
  if (p.body.length === 0) {
    errors.push('Escreva o corpo do post.');
  } else if (p.body.length > BLOG_BLOCKS_MAX) {
    errors.push(`Até ${BLOG_BLOCKS_MAX} blocos.`);
  } else {
    p.body.forEach((b, i) => errors.push(...blockIssues(b, i + 1)));
  }
  if (p.cta) {
    if (!line(p.cta.label)) {
      errors.push('Chamada sem texto.');
    } else if (line(p.cta.label).length > BLOG_CTA_LABEL_MAX) {
      errors.push(`Texto da chamada passa de ${BLOG_CTA_LABEL_MAX} caracteres.`);
    }
    if (!BLOG_CTA_DESTINATIONS.some((d) => d.id === p.cta!.destination)) {
      errors.push('Escolha para onde a chamada leva.');
    } else if (p.cta.destination === 'url' && !isHttps(p.cta.url)) {
      errors.push('Chamada para link precisa de endereço https.');
    }
  }
  if (p.status === 'scheduled') {
    const at = p.publishAt ? new Date(p.publishAt) : null;
    if (!at) {
      errors.push('Escolha data e hora para agendar.');
    } else if (at.getTime() <= now.getTime()) {
      errors.push('A data do agendamento já passou.');
    }
  }
  if ((p.status === 'scheduled' || p.status === 'published') && !p.channels.app && !p.channels.site) {
    errors.push('Escolha onde o post aparece: app, site ou os dois.');
  }
  return errors;
}

/** Rótulo do botão principal pelo destino do save e pelo status que já está gravado. */
export function saveLabel(target: BlogStatus, saved: BlogStatus | null): string {
  switch (target) {
    case 'draft':
      return 'Salvar rascunho';
    case 'review':
      return saved === 'review' ? 'Salvar' : 'Enviar para revisão';
    case 'scheduled':
      return saved === 'scheduled' ? 'Salvar agendamento' : 'Agendar';
    case 'published':
      return saved === 'published' ? 'Salvar alterações' : 'Publicar agora';
  }
}
