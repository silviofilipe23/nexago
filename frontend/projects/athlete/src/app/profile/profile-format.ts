import { levelLabelOf } from '../data/athlete-level';
import { levelDisplayLabel } from '@nexago/levels';
import { sportLabelForCode } from '../data/sport-catalog';

export function titleCase(input: string): string {
  return input
    .toLowerCase()
    .split(/[\s_.\-]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/** Código de nível (`sportProfile.level` / `sportOnboarding.levelsBySport`) → rótulo da
 *  escada de 7 (`data/athlete-level.ts`), a MESMA da listagem/ranking/equipes — legados
 *  caem no degrau equivalente. Código desconhecido passa cru (paridade com o app). */
export function athleteLevelLabel(code: string | null | undefined): string {
  const trimmed = code?.trim() ?? '';
  if (!trimmed) {
    return '';
  }
  return levelLabelOf(trimmed) ?? trimmed;
}

export function nameFromEmail(email: string | null | undefined): string {
  const local = email?.split('@')[0]?.trim();
  if (!local) {
    return 'Atleta NexaGO';
  }
  return titleCase(local);
}

export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 28);
}

export function buildPublicProfileId(handle: string, uidLike: string | null | undefined): string {
  const base = slugify(handle) || 'atleta';
  const suffix = uidLike ? slugify(uidLike).slice(0, 8) : '';
  return suffix ? `${base}-${suffix}` : base;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return 'AT';
  }
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || 'AT';
}

export function joinCityState(city: string, state: string): string {
  const trimmedCity = city.trim();
  const trimmedState = state.trim();
  if (!trimmedCity) {
    return '';
  }
  return trimmedState ? `${trimmedCity}, ${trimmedState}` : trimmedCity;
}

export interface SportLevelEntry {
  code: string;
  sportLabel: string;
  levelLabel: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

/** Resolve o nível de habilidade por modalidade a partir de `users/{uid}` (não de
 *  `athlete_profiles/{uid}.primarySport`, que é texto livre e não bate com `levelsBySport`).
 *  Ordem do retorno: modalidade principal primeiro, depois as secundárias na ordem de
 *  `secondarySportIds`. Nível ausente na principal cai pro nível global legado
 *  (`level`/`nivel`/`sportProfile.level`), mesma precedência de `athlete-public-profile.component.ts`
 *  — diferente da cadeia de 2 campos (sem `sportProfile.level`) usada em
 *  `public-profiles-repository.ts` (ranking/diretório), divergência pré-existente entre os
 *  dois, fora do escopo desta mudança; modalidades secundárias sem entrada em
 *  `levelsBySport` ficam com `levelLabel: ''` (sem fallback). */
export function buildSportLevels(userData: Record<string, unknown> | null | undefined): SportLevelEntry[] {
  const sportOnboarding = asRecord(userData?.['sportOnboarding']);
  const primarySportId = asString(sportOnboarding?.['primarySportId']);
  const secondarySportIds = asStringArray(sportOnboarding?.['secondarySportIds']);
  const levelsBySport = asRecord(sportOnboarding?.['levelsBySport']) ?? {};

  const codes = Array.from(
    new Set([primarySportId, ...secondarySportIds].filter((code): code is string => !!code)),
  );

  const legacyLevel =
    asString(userData?.['level']) ??
    asString(userData?.['nivel']) ??
    asString(asRecord(userData?.['sportProfile'])?.['level']);

  return codes.map((code) => {
    const rawLevel = asString(levelsBySport[code]);
    const resolvedLevel = rawLevel ?? (code === primarySportId ? legacyLevel : null);
    return {
      code,
      sportLabel: sportLabelForCode(code),
      levelLabel: athleteLevelLabel(resolvedLevel),
    };
  });
}
