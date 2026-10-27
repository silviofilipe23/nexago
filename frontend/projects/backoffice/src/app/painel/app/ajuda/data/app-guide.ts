import { DESTINATIONS, homeBannerIdFrom, type HomeBannerDestination } from '../../novidades/data/home-banner';

/** Espelha `functions/src/app-guide.ts` — mudar os dois. */
export const MAX_CATEGORIES = 12;
export const MAX_TOPICS = 12;
/** `AppGuideCategory.maxSteps` no app: passo além disso é cortado. */
export const MAX_STEPS = 6;
export const CATEGORY_TITLE_MAX = 24;
export const TITLE_MAX = 32;
export const SUMMARY_MAX = 90;
export const DESCRIPTION_MAX = 320;
export const STEP_MAX = 140;
export const WHERE_MAX = 80;
export const CTA_MAX = 20;

/** As chaves do banner da Home: o app usa as mesmas (`HomeBannerDestination`). */
export { DESTINATIONS };

/** Ícone quando o destino sozinho não diz o bastante, ou sem destino (`AppNewsIcon` no app). */
export const ICONS = [
  { id: 'map', label: 'Mapa' },
  { id: 'invite', label: 'Convite' },
  { id: 'cancel', label: 'Cancelar' },
  { id: 'story', label: 'Story' },
  { id: 'handshake', label: 'Aperto de mão' },
  { id: 'focus', label: 'Foco' },
  { id: 'chat', label: 'Conversa' },
  { id: 'star', label: 'Estrela' },
] as const;
export type AppGuideIcon = (typeof ICONS)[number]['id'];

/** Um guia de `appAdminConfig/appGuide.categories[].topics`, já como a callable grava. */
export interface AppGuideTopic {
  /** Único entre as categorias: o app abre o guia pelo id. Vazio = ainda não salvo. */
  id: string;
  title: string;
  /** Uma linha: lista e busca. */
  summary: string;
  /** O parágrafo do detalhe; vazio, o app usa o resumo. */
  description: string;
  steps: string[];
  where: string;
  ctaLabel: string;
  /** `null` = sem botão. */
  destination: HomeBannerDestination | null;
  /** Só com destino `url`. */
  url: string | null;
  imageUrl: string | null;
  /** `null` = ícone do destino. */
  icon: AppGuideIcon | null;
  /** `false` = rascunho: fica só no backoffice. */
  published: boolean;
}

export interface AppGuideCategory {
  /** Vazio = ainda não salva. */
  id: string;
  title: string;
  topics: AppGuideTopic[];
}

/** Na tela cada item ganha uma chave local: categoria e guia mudam de nome e de lugar. */
export interface TopicDraft extends AppGuideTopic {
  key: string;
}

export interface CategoryDraft extends Omit<AppGuideCategory, 'topics'> {
  key: string;
  topics: TopicDraft[];
}

type Raw = Record<string, unknown>;

let keySeq = 0;
export function nextKey(): string {
  keySeq += 1;
  return `g${keySeq}`;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.map(str).filter((s) => s.length > 0) : [];
}

function oneOfOrNull<T extends string>(list: ReadonlyArray<{ id: T }>, v: unknown): T | null {
  return list.some((o) => o.id === v) ? (v as T) : null;
}

/** `published` vem da fonte; no espelho do app tudo é publicado (`fallbackPublished`). */
function topicFromRaw(raw: Raw, fallbackPublished: boolean): AppGuideTopic | null {
  const id = str(raw['id']);
  if (!id) {
    return null;
  }
  const destination = oneOfOrNull(DESTINATIONS, raw['destination']);
  return {
    id,
    title: str(raw['title']),
    summary: str(raw['summary']),
    description: str(raw['description']),
    steps: strList(raw['steps']).slice(0, MAX_STEPS),
    where: str(raw['where']),
    ctaLabel: destination === null ? '' : str(raw['ctaLabel']),
    destination,
    url: destination === 'url' ? str(raw['url']) || null : null,
    imageUrl: str(raw['imageUrl']) || null,
    icon: oneOfOrNull(ICONS, raw['icon']),
    published: typeof raw['published'] === 'boolean' ? raw['published'] : fallbackPublished,
  };
}

function categoryFromRaw(raw: Raw, fallbackPublished: boolean): AppGuideCategory | null {
  const id = str(raw['id']);
  if (!id) {
    return null;
  }
  const topics = Array.isArray(raw['topics']) ? (raw['topics'] as unknown[]) : [];
  return {
    id,
    title: str(raw['title']),
    topics: topics
      .map((t) => (t && typeof t === 'object' ? topicFromRaw(t as Raw, fallbackPublished) : null))
      .filter((t): t is AppGuideTopic => t !== null),
  };
}

function categoriesFrom(data: Raw | undefined, fallbackPublished: boolean): AppGuideCategory[] {
  const list = Array.isArray(data?.['categories']) ? (data!['categories'] as unknown[]) : [];
  return list
    .map((c) => (c && typeof c === 'object' ? categoryFromRaw(c as Raw, fallbackPublished) : null))
    .filter((c): c is AppGuideCategory => c !== null);
}

/** `appAdminConfig/appGuide` (ou a resposta da callable). Doc ausente = nada, versão 0. */
export function appGuideFromDoc(data: Raw | undefined): { categories: AppGuideCategory[]; version: number } {
  const version = data?.['version'];
  return {
    categories: categoriesFrom(data, false),
    version: typeof version === 'number' && Number.isInteger(version) && version > 0 ? version : 0,
  };
}

/**
 * `appConfig/appGuide`, o espelho do app. Só serve antes do primeiro save pelo backoffice: o
 * `seed-app-guide.js` grava direto ali, e abrir a tela vazia e salvar apagaria o que está no app.
 */
export function appGuideFromMirror(data: Raw | undefined): AppGuideCategory[] {
  return categoriesFrom(data, true);
}

export function draftsFromCategories(categories: readonly AppGuideCategory[]): CategoryDraft[] {
  return categories.map((c) => ({
    ...c,
    key: nextKey(),
    topics: c.topics.map((t) => ({ ...t, steps: [...t.steps], key: nextKey() })),
  }));
}

/** Cópia para editar, com as mesmas chaves (a categoria e o guia abertos continuam abertos). */
export function cloneDrafts(drafts: readonly CategoryDraft[]): CategoryDraft[] {
  return drafts.map((c) => ({ ...c, topics: c.topics.map((t) => ({ ...t, steps: [...t.steps] })) }));
}

export function categoriesFromDrafts(drafts: readonly CategoryDraft[]): AppGuideCategory[] {
  return drafts.map(({ key: _key, ...c }) => ({
    id: c.id,
    title: c.title.trim(),
    topics: c.topics.map(({ key: _topicKey, ...t }) => ({ ...t, steps: [...t.steps] })),
  }));
}

export function newCategoryDraft(title: string): CategoryDraft {
  return { key: nextKey(), id: '', title: title.trim().slice(0, CATEGORY_TITLE_MAX), topics: [] };
}

/** Guia novo nasce rascunho e sem botão: a pessoa escolhe o destino (o errado levaria a outra tela). */
export function emptyTopic(): TopicDraft {
  return {
    key: nextKey(),
    id: '',
    title: '',
    summary: '',
    description: '',
    steps: ['', '', ''],
    where: '',
    ctaLabel: '',
    destination: null,
    url: null,
    imageUrl: null,
    icon: null,
    published: false,
  };
}

function len(s: string): number {
  return s.trim().length;
}

function isHttps(v: string): boolean {
  if (/\s/.test(v)) {
    return false;
  }
  try {
    return new URL(v).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * O que impede salvar um guia, em uma frase, ou `null`. Mesma regra da callable: rascunho só
 * respeita os tetos; publicado exige título, o texto do botão e o link https.
 */
export function topicIssue(t: AppGuideTopic, published: boolean): string | null {
  if (published && len(t.title) === 0) {
    return 'Falta o título.';
  }
  if (len(t.title) > TITLE_MAX) {
    return `Título passa de ${TITLE_MAX} caracteres.`;
  }
  if (len(t.summary) > SUMMARY_MAX) {
    return `Resumo passa de ${SUMMARY_MAX} caracteres.`;
  }
  if (len(t.description) > DESCRIPTION_MAX) {
    return `Descrição passa de ${DESCRIPTION_MAX} caracteres.`;
  }
  if (t.steps.length > MAX_STEPS) {
    return `No máximo ${MAX_STEPS} passos.`;
  }
  if (t.steps.some((s) => len(s) > STEP_MAX)) {
    return `Passo passa de ${STEP_MAX} caracteres.`;
  }
  if (len(t.where) > WHERE_MAX) {
    return `“Onde encontrar” passa de ${WHERE_MAX} caracteres.`;
  }
  if (t.destination !== null) {
    if (published && len(t.ctaLabel) === 0) {
      return 'Falta o texto do botão.';
    }
    if (len(t.ctaLabel) > CTA_MAX) {
      return `Botão passa de ${CTA_MAX} caracteres.`;
    }
  }
  if (t.destination === 'url' && (t.url ? !isHttps(t.url) : published)) {
    return 'O link externo precisa começar com https://.';
  }
  return null;
}

/** Sem resumo a lista mostra só o título: avisa, não barra. */
export function topicWarning(t: AppGuideTopic): string | null {
  return len(t.summary) === 0 ? 'Sem resumo: a lista da Central mostra só o título.' : null;
}

/** O que impede salvar a categoria (nome e teto de guias), ou `null`. */
export function categoryIssue(c: AppGuideCategory): string | null {
  if (len(c.title) === 0) {
    return 'Falta o nome da categoria.';
  }
  if (len(c.title) > CATEGORY_TITLE_MAX) {
    return `Nome passa de ${CATEGORY_TITLE_MAX} caracteres.`;
  }
  if (c.topics.length > MAX_TOPICS) {
    return `No máximo ${MAX_TOPICS} guias por categoria.`;
  }
  return null;
}

/** O que impede salvar a Central inteira: categoria sem nome e guia incompleto, por categoria. */
export function saveIssues(categories: readonly AppGuideCategory[]): string[] {
  const issues: string[] = [];
  if (categories.length > MAX_CATEGORIES) {
    issues.push(`No máximo ${MAX_CATEGORIES} categorias.`);
  }
  categories.forEach((c, i) => {
    const name = c.title.trim() || `Categoria ${i + 1}`;
    const problem = categoryIssue(c);
    if (problem) {
      issues.push(`${name}: ${problem}`);
    }
    const broken = c.topics.filter((t) => topicIssue(t, t.published) !== null).length;
    if (broken > 0) {
      issues.push(`${name}: ${broken === 1 ? '1 guia incompleto' : `${broken} guias incompletos`}.`);
    }
  });
  return issues;
}

/**
 * Categoria e guia novos ganham id do nome na hora de salvar, sem repetir; o que já tem id fica com
 * ele (o guia é aberto pelo id no app). Guia novo leva o prefixo "guia-", como os do seed.
 */
export function withIds(categories: readonly AppGuideCategory[]): AppGuideCategory[] {
  const takenCategories = new Set(categories.map((c) => c.id).filter((id) => id.length > 0));
  const takenTopics = new Set(categories.flatMap((c) => c.topics.map((t) => t.id)).filter((id) => id.length > 0));
  return categories.map((c) => {
    let id = c.id;
    if (!id) {
      id = homeBannerIdFrom(c.title, takenCategories);
      takenCategories.add(id);
    }
    return {
      ...c,
      id,
      topics: c.topics.map((t) => {
        if (t.id) {
          return t;
        }
        const topicId = homeBannerIdFrom(`guia ${t.title}`, takenTopics);
        takenTopics.add(topicId);
        return { ...t, id: topicId };
      }),
    };
  });
}

/** "4 guias · 1 rascunho". */
export function topicCountText(c: Pick<AppGuideCategory, 'topics'>): string {
  const total = c.topics.length;
  if (total === 0) {
    return 'Sem guias';
  }
  const drafts = c.topics.filter((t) => !t.published).length;
  const base = total === 1 ? '1 guia' : `${total} guias`;
  return drafts === 0 ? base : `${base} · ${drafts === 1 ? '1 rascunho' : `${drafts} rascunhos`}`;
}
