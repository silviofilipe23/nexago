import { DESTINATIONS, homeBannerIdFrom, type HomeBannerDestination } from '../../novidades/data/home-banner';

/** Espelha `functions/src/app-news.ts` — mudar os dois. */
export const MAX_RELEASES = 40;
export const MAX_FEATURES = 8;
export const MAX_STEPS = 4;
export const MAX_IMPROVEMENTS = 12;
export const TITLE_MAX = 22;
export const SUMMARY_MAX = 60;
export const DESCRIPTION_MAX = 240;
export const STEP_MAX = 80;
export const WHERE_MAX = 60;
export const CTA_MAX = 16;
export const IMPROVEMENT_MAX = 90;
const VERSION_RE = /^\d{1,3}(\.\d{1,3}){1,3}$/;
const BUILD_MAX = 999_999;
/** A partir daqui a tela fica comprida: a tela sugere mover as menores para Melhorias (não barra). */
export const CROWDED_FEATURES = 5;

/** As chaves do banner da Home: o app usa as mesmas (`HomeBannerDestination`). */
export { DESTINATIONS };

/** Ícone quando o destino sozinho não diz o bastante (`AppNewsIcon` no app). */
export const ICONS = [
  { id: 'map', label: 'Mapa' },
  { id: 'invite', label: 'Convite' },
] as const;
export type AppNewsIcon = (typeof ICONS)[number]['id'];

/** Uma funcionalidade de `appAdminConfig/appNews.releases[].features`, já como a callable grava. */
export interface AppNewsFeature {
  /** Único entre as versões: é a chave do "Já usou" no aparelho. Vazio = ainda não salva. */
  id: string;
  title: string;
  /** Uma linha: lista e stories. */
  summary: string;
  /** O parágrafo do detalhe; vazio, o app usa o resumo. */
  description: string;
  steps: string[];
  where: string;
  ctaLabel: string;
  /** `null` = só informativa, sem botão. */
  destination: HomeBannerDestination | null;
  /** Só com destino `url`. */
  url: string | null;
  imageUrl: string | null;
  /** `null` = ícone do destino. */
  icon: AppNewsIcon | null;
  /** `false` = fica só na tela, fora dos stories. */
  stories: boolean;
}

export interface AppNewsRelease {
  /** O que o atleta lê: "1.0.15". */
  version: string;
  /** Build number da loja (o `+N` do pubspec): só quem tem esse build ou maior vê. */
  build: number;
  /** Data civil de São Paulo; `null` = a do dia em que for publicada. */
  date: string | null;
  /** Abre os stories depois de atualizar. */
  stories: boolean;
  features: AppNewsFeature[];
  improvements: string[];
  /** `false` = rascunho. */
  published: boolean;
}

/** Na tela cada item ganha uma chave local: versão e funcionalidade mudam de nome e de lugar. */
export interface FeatureDraft extends AppNewsFeature {
  key: string;
}

export interface ReleaseDraft extends Omit<AppNewsRelease, 'features'> {
  key: string;
  features: FeatureDraft[];
}

export type AppNewsStatus = 'publicada' | 'agendada' | 'rascunho';

type Raw = Record<string, unknown>;

let keySeq = 0;
export function nextKey(): string {
  keySeq += 1;
  return `k${keySeq}`;
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

function featureFromRaw(raw: Raw): AppNewsFeature | null {
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
    ctaLabel: str(raw['ctaLabel']),
    destination,
    url: destination === 'url' ? str(raw['url']) || null : null,
    imageUrl: str(raw['imageUrl']) || null,
    icon: oneOfOrNull(ICONS, raw['icon']),
    stories: raw['stories'] !== false,
  };
}

/** `published` vem da fonte; no espelho do app tudo é publicado (`fallbackPublished`). */
function releaseFromRaw(raw: Raw, fallbackPublished: boolean): AppNewsRelease | null {
  const version = str(raw['version']);
  const build = raw['build'];
  if (!version || typeof build !== 'number' || !Number.isFinite(build)) {
    return null;
  }
  const date = str(raw['date']);
  const features = Array.isArray(raw['features']) ? (raw['features'] as unknown[]) : [];
  return {
    version,
    build: Math.trunc(build),
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    stories: raw['stories'] !== false,
    features: features
      .map((f) => (f && typeof f === 'object' ? featureFromRaw(f as Raw) : null))
      .filter((f): f is AppNewsFeature => f !== null),
    improvements: strList(raw['improvements']),
    published: typeof raw['published'] === 'boolean' ? raw['published'] : fallbackPublished,
  };
}

function byBuildDesc<T extends { build: number }>(list: T[]): T[] {
  return [...list].sort((a, b) => b.build - a.build);
}

function releasesFrom(data: Raw | undefined, fallbackPublished: boolean): AppNewsRelease[] {
  const list = Array.isArray(data?.['releases']) ? (data!['releases'] as unknown[]) : [];
  return byBuildDesc(
    list
      .map((r) => (r && typeof r === 'object' ? releaseFromRaw(r as Raw, fallbackPublished) : null))
      .filter((r): r is AppNewsRelease => r !== null),
  );
}

/** `appAdminConfig/appNews` (ou a resposta da callable). Doc ausente = nada, versão 0. */
export function appNewsFromDoc(data: Raw | undefined): { releases: AppNewsRelease[]; version: number } {
  const version = data?.['version'];
  return {
    releases: releasesFrom(data, false),
    version: typeof version === 'number' && Number.isInteger(version) && version > 0 ? version : 0,
  };
}

/**
 * `appConfig/appNews`, o espelho do app. Só serve antes do primeiro save pelo backoffice: o
 * `seed-app-news.js` grava direto ali, e abrir a tela vazia e salvar apagaria o que está no app.
 */
export function appNewsFromMirror(data: Raw | undefined): AppNewsRelease[] {
  return releasesFrom(data, true);
}

export function draftFromRelease(r: AppNewsRelease): ReleaseDraft {
  return {
    ...r,
    key: nextKey(),
    features: r.features.map((f) => ({ ...f, steps: [...f.steps], key: nextKey() })),
    improvements: [...r.improvements],
  };
}

export function releaseFromDraft(d: ReleaseDraft): AppNewsRelease {
  return {
    version: d.version.trim(),
    build: d.build,
    date: d.date,
    stories: d.stories,
    features: d.features.map(({ key: _key, ...f }) => ({ ...f, steps: [...f.steps] })),
    improvements: [...d.improvements],
    published: d.published,
  };
}

export function emptyFeature(): FeatureDraft {
  return {
    key: nextKey(),
    id: '',
    title: '',
    summary: '',
    description: '',
    steps: ['', '', ''],
    where: '',
    ctaLabel: '',
    destination: 'reservar',
    url: null,
    imageUrl: null,
    icon: null,
    stories: true,
  };
}

/** "1.0.15" → "1.0.16". Sem número no fim, vazio (a pessoa digita). */
function bumpVersion(version: string): string {
  const parts = version.split('.');
  const last = Number(parts[parts.length - 1]);
  if (!VERSION_RE.test(version) || !Number.isInteger(last)) {
    return '';
  }
  parts[parts.length - 1] = String(last + 1);
  return parts.join('.');
}

/** Nova versão: a seguinte à de maior build, rascunho, sem data (= a do dia ao publicar). */
export function newReleaseDraft(releases: readonly AppNewsRelease[]): ReleaseDraft {
  const top = byBuildDesc([...releases])[0];
  return {
    key: nextKey(),
    version: top ? bumpVersion(top.version) : '',
    build: top ? top.build + 1 : 0,
    date: null,
    stories: true,
    features: [],
    improvements: [],
    published: false,
  };
}

/** Rascunho; publicada com data futura conta como agendada (o app já mostra a quem tem o build). */
export function releaseStatus(r: Pick<AppNewsRelease, 'published' | 'date'>, today: string): AppNewsStatus {
  if (!r.published) {
    return 'rascunho';
  }
  return r.date !== null && r.date > today ? 'agendada' : 'publicada';
}

function len(s: string): number {
  return s.trim().length;
}

/**
 * O que impede salvar uma funcionalidade, em uma frase, ou `null`. Mesma regra da callable:
 * rascunho só respeita os tetos; publicada exige título, o texto do botão e o link https.
 */
export function featureIssue(f: AppNewsFeature, published: boolean): string | null {
  if (published && len(f.title) === 0) {
    return 'Falta o título.';
  }
  if (len(f.title) > TITLE_MAX) {
    return `Título passa de ${TITLE_MAX} caracteres.`;
  }
  if (len(f.summary) > SUMMARY_MAX) {
    return `Resumo passa de ${SUMMARY_MAX} caracteres.`;
  }
  if (len(f.description) > DESCRIPTION_MAX) {
    return `Descrição passa de ${DESCRIPTION_MAX} caracteres.`;
  }
  if (f.steps.some((s) => len(s) > STEP_MAX)) {
    return `Passo passa de ${STEP_MAX} caracteres.`;
  }
  if (len(f.where) > WHERE_MAX) {
    return `“Onde encontrar” passa de ${WHERE_MAX} caracteres.`;
  }
  if (f.destination !== null) {
    if (published && len(f.ctaLabel) === 0) {
      return 'Falta o texto do botão.';
    }
    if (len(f.ctaLabel) > CTA_MAX) {
      return `Botão passa de ${CTA_MAX} caracteres.`;
    }
  }
  if (f.destination === 'url' && (f.url ? !isHttps(f.url) : published)) {
    return 'O link externo precisa começar com https://.';
  }
  return null;
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

/** Sem resumo a lista e os stories mostram só o título: avisa, não barra (versões antigas são assim). */
export function featureWarning(f: AppNewsFeature): string | null {
  return len(f.summary) === 0 ? 'Sem resumo: a lista e os stories mostram só o título.' : null;
}

/**
 * O que impede salvar a versão como `published`, contra as outras (`others`, sem ela): número e
 * build únicos, ao menos uma funcionalidade para publicar, e o que cada funcionalidade tiver.
 */
export function releaseIssues(r: AppNewsRelease, others: readonly AppNewsRelease[], published: boolean): string[] {
  const issues: string[] = [];
  const version = r.version.trim();
  if (!VERSION_RE.test(version)) {
    issues.push('Número da versão no formato 1.0.15.');
  } else if (others.some((o) => o.version === version)) {
    issues.push(`Já existe a versão ${version}.`);
  }
  if (!Number.isInteger(r.build) || r.build < 1 || r.build > BUILD_MAX) {
    issues.push('Informe o build da loja (o +N do pubspec).');
  } else if (others.some((o) => o.build === r.build)) {
    issues.push(`O build ${r.build} já é de outra versão.`);
  }
  if (published && r.features.length === 0) {
    issues.push('Adicione pelo menos uma funcionalidade.');
  }
  if (r.features.length > MAX_FEATURES) {
    issues.push(`No máximo ${MAX_FEATURES} funcionalidades.`);
  }
  const broken = r.features.filter((f) => featureIssue(f, published) !== null).length;
  if (broken > 0) {
    issues.push(broken === 1 ? '1 funcionalidade incompleta.' : `${broken} funcionalidades incompletas.`);
  }
  if (r.improvements.length > MAX_IMPROVEMENTS) {
    issues.push(`No máximo ${MAX_IMPROVEMENTS} melhorias.`);
  }
  return issues;
}

/**
 * Funcionalidade nova ganha id do título na hora de salvar, sem repetir nenhum de nenhuma versão;
 * a que já tem id fica com ele (trocar apagaria o "Já usou" de quem tocou).
 */
export function withFeatureIds(releases: readonly AppNewsRelease[]): AppNewsRelease[] {
  const taken = new Set(releases.flatMap((r) => r.features.map((f) => f.id)).filter((id) => id.length > 0));
  return releases.map((r) => ({
    ...r,
    features: r.features.map((f) => {
      if (f.id) {
        return f;
      }
      const id = homeBannerIdFrom(f.title, taken);
      taken.add(id);
      return { ...f, id };
    }),
  }));
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "27 out 2026", como o app (`appNewsShortDate`). */
export function shortDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return y && m && d ? `${d} ${MONTHS[m - 1]} ${y}` : date;
}

/** "27/10". */
export function dayMonth(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}
