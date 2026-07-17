import type { TournamentCategoryOffer } from '../data/tournaments-repository';
import type { UniformInput } from '../data/tournament-registrations-repository';

/** Port fiel de `tournament_uniform_selection.dart` (Flutter) — mesmas regras, mesmas
 *  mensagens. Uniforme é POR ATLETA (titular e convidado escolhem o seu). */

/** Tamanhos padrão quando a categoria não define `uniformSizeOptionsTop`/`Shorts`. */
export const DEFAULT_UNIFORM_SIZE_OPTIONS_TOP = ['PP', 'P', 'M', 'G', 'GG', 'XGG'];
export const DEFAULT_UNIFORM_SIZE_OPTIONS_SHORTS = ['PP', 'P', 'M', 'G', 'GG', 'XGG'];

/** Prazo exibido até existir campo dedicado no torneio (`kUniformChangeDeadlineDays`). */
export const UNIFORM_CHANGE_DEADLINE_DAYS = 7;

export interface UniformSelection {
  sizeTop: string | null;
  sizeShorts: string | null;
  jerseyNumber: number | null;
  jerseyName: string | null;
}

export function categoryRequiresUniform(category: Pick<TournamentCategoryOffer, 'uniformType'>): boolean {
  const t = category.uniformType?.trim() ?? 'none';
  return t === 'top_only' || t === 'top' || t === 'full';
}

export function categoryRequiresShorts(category: Pick<TournamentCategoryOffer, 'uniformType'>): boolean {
  return category.uniformType === 'full';
}

export function uniformSizeOptionsTopForCategory(category: Pick<TournamentCategoryOffer, 'uniformSizeOptionsTop'>): string[] {
  const fromCategory = category.uniformSizeOptionsTop.map((s) => s.trim()).filter((s) => s.length > 0);
  return fromCategory.length > 0 ? fromCategory : DEFAULT_UNIFORM_SIZE_OPTIONS_TOP;
}

export function uniformSizeOptionsShortsForCategory(category: Pick<TournamentCategoryOffer, 'uniformSizeOptionsShorts'>): string[] {
  const fromCategory = category.uniformSizeOptionsShorts.map((s) => s.trim()).filter((s) => s.length > 0);
  return fromCategory.length > 0 ? fromCategory : DEFAULT_UNIFORM_SIZE_OPTIONS_SHORTS;
}

/** Valida a seleção pra avançar no fluxo — mensagens idênticas às do app. */
export function validateUniformSelection(category: TournamentCategoryOffer, selection: UniformSelection): string | null {
  const topOptions = uniformSizeOptionsTopForCategory(category);
  const top = selection.sizeTop?.trim() ?? '';
  if (!top) return 'Selecione o tamanho da regata.';
  if (!topOptions.includes(top)) return 'Tamanho da regata inválido para esta categoria.';

  if (categoryRequiresShorts(category)) {
    const shortsOptions = uniformSizeOptionsShortsForCategory(category);
    const shorts = selection.sizeShorts?.trim() ?? '';
    if (!shorts) return 'Selecione o tamanho do shorts.';
    if (!shortsOptions.includes(shorts)) return 'Tamanho do shorts inválido para esta categoria.';
  }

  if (category.uniformNumberOnShirt) {
    const n = selection.jerseyNumber;
    if (n == null || n < 1 || n > 99) return 'Informe um número entre 1 e 99.';
  }

  if (category.uniformNameOnShirt) {
    if (!selection.jerseyName?.trim()) return 'Informe o nome para a camisa.';
  }

  return null;
}

export function isUniformSelectionComplete(category: TournamentCategoryOffer, selection: UniformSelection): boolean {
  return validateUniformSelection(category, selection) == null;
}

/** Nome padrão na camisa: apelido, ou sobrenome quando há nome completo. */
export function defaultJerseyNameForAthlete(fullName: string | null, nickname: string | null): string | null {
  const nick = nickname?.trim();
  if (nick) return nick;
  const parts = (fullName?.trim() ?? '').split(/\s+/).filter((p) => p.length > 0);
  if (parts.length === 0) return null;
  return parts.length > 1 ? parts[parts.length - 1]! : parts[0]!;
}

export function defaultUniformSelectionForCategory(category: TournamentCategoryOffer, athleteName: string | null = null, athleteNickname: string | null = null): UniformSelection {
  const tops = uniformSizeOptionsTopForCategory(category);
  const shorts = uniformSizeOptionsShortsForCategory(category);
  return {
    sizeTop: tops.includes('M') ? 'M' : (tops[0] ?? null),
    sizeShorts: categoryRequiresShorts(category) ? (shorts.includes('M') ? 'M' : (shorts[0] ?? null)) : null,
    jerseyNumber: category.uniformNumberOnShirt ? 10 : null,
    jerseyName: category.uniformNameOnShirt ? defaultJerseyNameForAthlete(athleteName, athleteNickname) : null,
  };
}

/** Converte pro payload das callables, omitindo vazios (espelha `toCallableMap`). */
export function toUniformInput(selection: UniformSelection): UniformInput {
  const input: UniformInput = {};
  const top = selection.sizeTop?.trim();
  if (top) input.sizeTop = top;
  const shorts = selection.sizeShorts?.trim();
  if (shorts) input.sizeShorts = shorts;
  if (selection.jerseyNumber != null) input.jerseyNumber = selection.jerseyNumber;
  const name = selection.jerseyName?.trim();
  if (name) input.jerseyName = name;
  return input;
}
