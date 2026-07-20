import { levelLabelOf } from '../data/athlete-level';

export function titleCase(input: string): string {
  return input
    .toLowerCase()
    .split(/[\s_.\-]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/** Código de nível (`sportProfile.level` / `sportOnboarding.levelsBySport`) → rótulo da
 *  escada de 5 (`data/athlete-level.ts`), a MESMA da listagem/ranking/equipes — legados
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

export function splitCityState(input: string): { city: string; state: string } {
  const trimmed = input.trim();
  if (!trimmed) {
    return { city: '', state: '' };
  }
  const lastComma = trimmed.lastIndexOf(',');
  if (lastComma === -1) {
    return { city: trimmed, state: '' };
  }
  const city = trimmed.slice(0, lastComma).trim();
  const state = trimmed.slice(lastComma + 1).trim().toUpperCase();
  if (!city) {
    return { city: trimmed, state: '' };
  }
  return { city, state };
}

export function joinCityState(city: string, state: string): string {
  const trimmedCity = city.trim();
  const trimmedState = state.trim();
  if (!trimmedCity) {
    return '';
  }
  return trimmedState ? `${trimmedCity}, ${trimmedState}` : trimmedCity;
}
