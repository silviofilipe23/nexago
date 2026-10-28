import { isNamedTeamSize } from '../data/team-size';
import type { OrganizerTournament } from '../data/tournament.model';
import { normalizeSearch, type InscricaoRow } from './inscricoes.model';

/**
 * Dados da arte "duplas inscritas" que o organizador posta no Stories (1080×1920).
 *
 * Função pura de propósito: recebe as MESMAS linhas que a lista da tela já monta e decide só o
 * que entra na arte — quem aparece, em que ordem, como o nome encolhe e quantas vagas sobram.
 * O desenho fica em `inscricoes-story-card.ts`.
 */

/** Oito linhas de 100px cabem entre o título e o rodapé da arte; o resto vira outro story. */
export const STORY_PER_PAGE = 8;

export type StoryTheme = 'dark' | 'orange';

export interface StoryOptions {
  categoryId: string;
  /** Esconde quem ainda não pagou — "A conferir" conta como pago: a vaga já vale. */
  paidOnly: boolean;
  showSpots: boolean;
}

export interface StoryEntry {
  /** Posição na ordem de inscrição (1 = a primeira), que é o número da linha na arte. */
  position: number;
  /** "Ana F. / Bia D." na dupla, o nome da equipe no trio+, o nome inteiro no individual. */
  label: string;
  /** Uma inicial por atleta (máx. 3), para os avatares sobrepostos. */
  initials: string[];
}

export interface StoryPage {
  index: number;
  total: number;
  entries: StoryEntry[];
}

export interface InscricoesStory {
  eventName: string;
  categoryName: string;
  dateLabel: string | null;
  place: string | null;
  /** Primeira linha do título: "DUPLAS", "EQUIPES" ou "ATLETAS". */
  unitTitle: string;
  /** Segunda linha, concordando com a primeira ("INSCRITAS"/"INSCRITOS"). */
  unitVerb: string;
  /** "dupla"/"equipe"/"atleta" — o rodapé diz "12 duplas" quando não mostra vagas. */
  unit: string;
  /** Quantas entram na arte, já com o filtro de pagas. */
  count: number;
  /** Vagas que sobram na categoria, sem olhar o toggle; `null` = sem teto ou lotada. */
  spotsAvailable: number | null;
  /** O que a arte mostra: `spotsAvailable` com o toggle ligado, senão `null`. */
  spotsLeft: number | null;
  /** O botão "Inscreva-se" só faz sentido com inscrições abertas — fora disso o link do
   *  sticker levaria a uma porta fechada. */
  cta: boolean;
  /** Sempre ao menos uma página (vazia, quando ninguém entra), para a prévia ter o que mostrar. */
  pages: StoryPage[];
}

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** "04–05 Ago", "30 Set – 02 Out" ou "04 Ago". Mesmo fuso das outras datas do painel. */
export function storyDateLabel(start: Date | null, end: Date | null): string | null {
  if (!start) return null;
  const day = (d: Date) => String(d.getDate()).padStart(2, '0');
  const month = (d: Date) => MONTHS[d.getMonth()];
  const sameDay =
    !end ||
    end.getTime() <= start.getTime() ||
    (end.getFullYear() === start.getFullYear() &&
      end.getMonth() === start.getMonth() &&
      end.getDate() === start.getDate());
  if (sameDay) return `${day(start)} ${month(start)}`;
  if (end.getFullYear() === start.getFullYear() && end.getMonth() === start.getMonth()) {
    return `${day(start)}–${day(end)} ${month(start)}`;
  }
  return `${day(start)} ${month(start)} – ${day(end)} ${month(end)}`;
}

/** Palavras que não identificam ninguém: partícula ("da Silva") e sufixo ("Júnior"). */
const NAME_FILLERS = new Set([
  'da',
  'das',
  'de',
  'do',
  'dos',
  'e',
  'junior',
  'jr',
  'filho',
  'neto',
  'sobrinho',
]);

function nameWords(name: string): string[] {
  return name.trim().split(/\s+/).filter(Boolean);
}

/** Último sobrenome que diz algo — "Maria da Silva Júnior" → "Silva". */
function lastMeaningfulWord(words: readonly string[]): string | null {
  for (let i = words.length - 1; i > 0; i--) {
    if (!NAME_FILLERS.has(normalizeSearch(words[i]!).replace(/\./g, ''))) return words[i]!;
  }
  return null;
}

function firstLetter(word: string): string {
  return ([...word][0] ?? '').toLocaleUpperCase('pt-BR');
}

/** "Ana Ferreira" → "Ana F.": duas pessoas por linha, numa linha só, em 36px. O sobrenome que
 *  vira inicial é o ÚLTIMO (o de família), não o segundo nome — "Maria Eduarda Lima" é "Maria L.". */
export function shortAthleteName(name: string): string {
  const words = nameWords(name);
  if (words.length <= 1) return words[0] ?? '';
  const last = lastMeaningfulWord(words);
  return last ? `${words[0]} ${firstLetter(last)}.` : words[0]!;
}

/** Iniciais do avatar: primeiro nome + último sobrenome ("AF"); nome de uma palavra, uma letra. */
export function storyInitials(name: string): string {
  const words = nameWords(name);
  if (words.length === 0) return '';
  const last = lastMeaningfulWord(words);
  return firstLetter(words[0]!) + (last ? firstLetter(last) : '');
}

/** Ordem de inscrição: quem chegou primeiro é o 01. Sem data vai pro fim, desempatado pelo id
 *  para a numeração não mudar entre uma geração e outra. */
function byRegistrationOrder(a: InscricaoRow, b: InscricaoRow): number {
  const ta = a.createdAt?.getTime() ?? Number.POSITIVE_INFINITY;
  const tb = b.createdAt?.getTime() ?? Number.POSITIVE_INFINITY;
  if (ta !== tb) return ta < tb ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function entryOf(row: InscricaoRow, position: number, teamSize: number | null): StoryEntry {
  const roster = row.athletes.filter((a) => a.uid !== '');
  // Inscrição sem elenco resolvido só tem o nome da dupla ("Ana / Bia") — vai como veio.
  if (roster.length === 0) {
    const parts = row.name
      .split('/')
      .map((p) => p.trim())
      .filter(Boolean);
    return { position, label: row.name, initials: parts.slice(0, 2).map(storyInitials) };
  }
  const initials = roster.slice(0, 3).map((a) => storyInitials(a.name));
  if (isNamedTeamSize(teamSize)) return { position, label: row.name, initials };
  if (teamSize === 1) return { position, label: roster[0]!.name, initials };
  return { position, label: roster.map((a) => shortAthleteName(a.name)).join(' / '), initials };
}

export function buildInscricoesStory(
  rows: readonly InscricaoRow[],
  tournament: Pick<
    OrganizerTournament,
    'name' | 'status' | 'startAt' | 'endAt' | 'location' | 'city' | 'categories'
  >,
  options: StoryOptions,
): InscricoesStory {
  const category = tournament.categories.find((c) => c.id === options.categoryId);
  const teamSize = category?.teamSize ?? null;
  // Fila de espera não tem vaga: nem aparece na arte, nem ocupa vaga na conta (regra do servidor).
  const inCategory = rows.filter((r) => r.categoriaId === options.categoryId && r.pay !== 'espera');
  const listed = inCategory
    .filter((r) => !options.paidOnly || r.pay === 'pago' || r.pay === 'conferir')
    .sort(byRegistrationOrder);

  const entries = listed.map((row, i) => entryOf(row, i + 1, teamSize));
  const total = Math.max(1, Math.ceil(entries.length / STORY_PER_PAGE));
  const pages: StoryPage[] = Array.from({ length: total }, (_, index) => ({
    index,
    total,
    entries: entries.slice(index * STORY_PER_PAGE, (index + 1) * STORY_PER_PAGE),
  }));

  const max = category?.maxTeams ?? null;
  const spotsAvailable =
    max != null && max > 0 && max > inCategory.length ? max - inCategory.length : null;

  const unit = teamSize === 1 ? 'atleta' : isNamedTeamSize(teamSize) ? 'equipe' : 'dupla';
  return {
    eventName: tournament.name,
    categoryName: category?.name ?? '',
    dateLabel: storyDateLabel(tournament.startAt, tournament.endAt),
    place: tournament.location ?? tournament.city,
    unitTitle: `${unit.toUpperCase()}S`,
    unitVerb: unit === 'atleta' ? 'INSCRITOS' : 'INSCRITAS',
    unit,
    count: entries.length,
    spotsAvailable,
    spotsLeft: options.showSpots ? spotsAvailable : null,
    cta: tournament.status === 'inscricoes',
    pages,
  };
}

/** Nome do PNG baixado: "stories-copa-verao-feminino-open-1-de-2.png". */
export function storyFileName(
  story: Pick<InscricoesStory, 'eventName' | 'categoryName'>,
  page: StoryPage,
): string {
  const slug = normalizeSearch(`${story.eventName} ${story.categoryName}`)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const suffix = page.total > 1 ? `-${page.index + 1}-de-${page.total}` : '';
  return `stories-${slug || 'inscricoes'}${suffix}.png`;
}
