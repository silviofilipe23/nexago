import {
  levelLabelForRank,
  tournamentSportToLevelSportCode as sharedTournamentSportToLevelSportCode,
} from '@nexago/levels';
import type { MyAthleteProfile } from '../data/my-athlete-profile-repository';
import { levelRankOf } from '../data/athlete-level';
import type { TournamentCategoryOffer } from '../data/tournaments-repository';

/** Pré-validação de elegibilidade na escolha de categoria — port fiel de
 *  `category_{level,gender,age}_eligibility.dart` (Flutter). O backend continua autoritativo;
 *  isto só evita que o atleta tente uma categoria que a function vai recusar. */

const HIGHEST_LEVEL_RANK = 6;

/** Esporte do torneio (`tournaments/{id}.sport`) → código de esporte do perfil
 *  (`levelsBySport`). `null` quando não há equivalente → usa nível global. */
export function tournamentSportToLevelSportCode(sport: string | null): string | null {
  return sharedTournamentSportToLevelSportCode(sport);
}

/** Rank do nível da categoria; categoria sem nível → Open (aceita todos). */
export function categoryLevelRank(category: Pick<TournamentCategoryOffer, 'level'>): number {
  return levelRankOf(category.level) ?? HIGHEST_LEVEL_RANK;
}

/** Rank do piso da categoria; ausente/desconhecido → 0 (sem piso). */
export function categoryMinLevelRank(category: Pick<TournamentCategoryOffer, 'minLevel'>): number {
  return levelRankOf(category.minLevel) ?? 0;
}

/** Rank do atleta pro esporte do torneio: por esporte → global → Iniciante (permissivo). */
export function athleteLevelRank(profile: MyAthleteProfile | null, tournamentSport: string | null): number {
  if (!profile) return 0;
  const sportCode = tournamentSportToLevelSportCode(tournamentSport);
  if (sportCode) {
    const perSport = levelRankOf(profile.levelsBySport[sportCode] ?? null);
    if (perSport != null) return perSport;
  }
  return levelRankOf(profile.level) ?? 0;
}


export function normalizeAthleteGender(raw: string | null): 'M' | 'F' | null {
  const v = raw?.trim().toLowerCase() ?? '';
  if (!v) return null;
  if (v === 'm' || v.startsWith('masc')) return 'M';
  if (v === 'f' || v.startsWith('fem')) return 'F';
  return null; // 'Outro' etc. — não casa com categorias M/F (só Misto).
}

/** Filtro da busca de parceiro em categoria de gênero fixo. Declarado que não
 *  casa (inclui "Outro") sai da lista; SEM gênero (vazio) FICA — sumir em
 *  silêncio deixava o convidante achando que o parceiro não existe. A linha
 *  avisa a pendência e o aceite valida no servidor. */
export function partnerMatchesRequiredGender(rawGender: string | null, requiredGender: 'M' | 'F' | null): boolean {
  if (requiredGender == null) return true;
  if (!rawGender?.trim()) return true;
  return normalizeAthleteGender(rawGender) === requiredGender;
}

function categoryGenderDisplayLabel(genderType: TournamentCategoryOffer['genderType']): string {
  return genderType === 'F' ? 'Feminino' : genderType === 'Mix' ? 'Misto' : 'Masculino';
}

// ── Idade (espelha `CategoryAgeRestriction`) ─────────────────────────────────

type AgeRestrictionMode = 'none' | 'min' | 'max' | 'range';
type AgeReference = 'tournamentStart' | 'yearEnd' | 'registration';

interface AgeRestriction {
  mode: AgeRestrictionMode;
  minAge: number | null;
  maxAge: number | null;
  reference: AgeReference;
}

function ageReferenceFromRaw(raw: string | null): AgeReference {
  const v = raw?.trim() ?? '';
  return v === 'yearEnd' || v === 'registration' ? v : 'tournamentStart';
}

/** `ageRestriction` explícita, com fallback no preset `ageBand` (Sub-N→máx, plusN→mín). */
export function ageRestrictionFromOffer(category: TournamentCategoryOffer): AgeRestriction {
  const reference = ageReferenceFromRaw(category.ageReference);
  const mode = category.ageRestrictionMode?.trim() ?? '';
  if (mode === 'none' || mode === 'min' || mode === 'max' || mode === 'range') {
    return { mode, minAge: category.ageMinYears, maxAge: category.ageMaxYears, reference };
  }
  const band = category.ageBand?.trim().toLowerCase() ?? '';
  if (band.startsWith('sub')) {
    const n = Number.parseInt(band.slice(3), 10);
    if (Number.isFinite(n)) return { mode: 'max', minAge: null, maxAge: n, reference };
  }
  if (band.startsWith('plus')) {
    const n = Number.parseInt(band.slice(4), 10);
    if (Number.isFinite(n)) return { mode: 'min', minAge: n, maxAge: null, reference };
  }
  return { mode: 'none', minAge: null, maxAge: null, reference };
}

function ageRestrictionHasLimit(r: AgeRestriction): boolean {
  if (r.mode === 'min') return r.minAge != null;
  if (r.mode === 'max') return r.maxAge != null;
  if (r.mode === 'range') return r.minAge != null || r.maxAge != null;
  return false;
}

function ageRestrictionLabel(r: AgeRestriction): string {
  switch (r.mode) {
    case 'min':
      return r.minAge != null ? `${r.minAge}+ anos` : 'idade mínima';
    case 'max':
      return r.maxAge != null ? `até ${r.maxAge} anos` : 'idade máxima';
    case 'range':
      if (r.minAge != null && r.maxAge != null) return `${r.minAge}–${r.maxAge} anos`;
      if (r.minAge != null) return `${r.minAge}+ anos`;
      if (r.maxAge != null) return `até ${r.maxAge} anos`;
      return 'faixa etária';
    case 'none':
      return 'livre';
  }
}

/** ISO `aaaa-mm-dd` ou BR `dd/mm/aaaa` → Date (só a parte da data). */
export function parseBirthDate(raw: string | null): Date | null {
  const v = raw?.trim() ?? '';
  if (!v) return null;
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
  if (br) return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  return null;
}

function computeAge(birthDate: Date, reference: AgeReference, tournamentStart: Date | null, now: Date): number {
  if (reference === 'yearEnd') {
    return (tournamentStart ?? now).getFullYear() - birthDate.getFullYear();
  }
  const ref = reference === 'registration' ? now : (tournamentStart ?? now);
  let age = ref.getFullYear() - birthDate.getFullYear();
  const beforeBirthday = ref.getMonth() < birthDate.getMonth() || (ref.getMonth() === birthDate.getMonth() && ref.getDate() < birthDate.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

// ── Avaliação combinada ──────────────────────────────────────────────────────

export type CategoryEligibilityStatus =
  | 'eligible'
  | 'belowLevel'
  | 'belowMinLevel'
  | 'genderMismatch'
  | 'missingGender'
  | 'missingBirthDate'
  | 'outOfAgeRange';

export interface CategoryEligibility {
  status: CategoryEligibilityStatus;
  /** Rótulo curto pro chip do card (ex.: "ABAIXO DO SEU NÍVEL"); null quando elegível. */
  badge: string | null;
  /** Mensagem explicativa; null quando elegível. */
  message: string | null;
}

const ELIGIBLE: CategoryEligibility = { status: 'eligible', badge: null, message: null };

/** Nível → gênero → idade, mesmas mensagens do app. `profile` null (ainda carregando ou
 *  indisponível) → elegível: pré-validação nunca deve bloquear por falta de dado do CLIENT. */
export function evaluateCategoryEligibility(
  category: TournamentCategoryOffer,
  profile: MyAthleteProfile | null,
  opts: { tournamentSport: string | null; tournamentStart: Date | null; now?: Date },
): CategoryEligibility {
  if (!profile) return ELIGIBLE;
  const now = opts.now ?? new Date();

  // Nível (anti-sandbagging): própria categoria ou ACIMA, nunca abaixo.
  const athleteRank = athleteLevelRank(profile, opts.tournamentSport);
  if (categoryLevelRank(category) < athleteRank) {
    return {
      status: 'belowLevel',
      badge: 'ABAIXO DO SEU NÍVEL',
      message: `Seu nível (${levelLabelForRank(athleteRank)}) não permite categorias inferiores. Escolha uma categoria igual ou superior.`,
    };
  }

  // Piso da faixa: categoria com nível mínimo barra quem está abaixo dele.
  const minRank = categoryMinLevelRank(category);
  if (minRank > 0 && athleteRank < minRank) {
    return {
      status: 'belowMinLevel',
      badge: 'NÍVEL MÍNIMO NÃO ATINGIDO',
      message: `Esta categoria exige nível mínimo ${levelLabelForRank(minRank)}. Seu nível atual é ${levelLabelForRank(athleteRank)}.`,
    };
  }

  // Gênero: próprio gênero ou Misto.
  if (category.genderType !== 'Mix') {
    const athleteGender = normalizeAthleteGender(profile.gender);
    const label = categoryGenderDisplayLabel(category.genderType);
    if (!profile.gender?.trim()) {
      return {
        status: 'missingGender',
        badge: 'GÊNERO INCOMPATÍVEL',
        message: `Informe seu gênero no perfil para se inscrever em categorias ${label.toLowerCase()}.`,
      };
    }
    if (athleteGender !== category.genderType) {
      return {
        status: 'genderMismatch',
        badge: 'GÊNERO INCOMPATÍVEL',
        message: `Esta categoria é ${label}. Você só pode se inscrever em categorias do seu gênero ou Misto.`,
      };
    }
  }

  // Idade.
  const restriction = ageRestrictionFromOffer(category);
  if (ageRestrictionHasLimit(restriction)) {
    const birthDate = parseBirthDate(profile.birthDate);
    if (!birthDate) {
      return {
        status: 'missingBirthDate',
        badge: 'COMPLETE SUA DATA DE NASCIMENTO',
        message: 'Informe sua data de nascimento no perfil para se inscrever nesta categoria.',
      };
    }
    const age = computeAge(birthDate, restriction.reference, opts.tournamentStart, now);
    const withinMin = restriction.minAge == null || age >= restriction.minAge;
    const withinMax = restriction.maxAge == null || age <= restriction.maxAge;
    const ok = restriction.mode === 'min' ? withinMin : restriction.mode === 'max' ? withinMax : withinMin && withinMax;
    if (!ok) {
      return {
        status: 'outOfAgeRange',
        badge: 'FORA DA FAIXA ETÁRIA',
        message: `Você está fora da faixa etária desta categoria (${ageRestrictionLabel(restriction)}).`,
      };
    }
  }

  return ELIGIBLE;
}
