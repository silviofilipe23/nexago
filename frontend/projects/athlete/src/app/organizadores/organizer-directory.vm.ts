/** Lista "Organizadores" — ordem, busca e card, puros. Spec: "Lista Organizadores". */
import { formatOrganizerRating, type OrganizerPublicProfile, type OrganizerReputationDetail } from '../data/organizer-public-profiles';
import { formatCompactCount, formatCount, hasPublicRating, organizerInitials } from './organizer-profile.vm';

export interface OrganizerDirectoryCardVm {
  readonly id: string;
  readonly link: readonly string[];
  readonly name: string;
  readonly initials: string;
  readonly logoUrl: string | null;
  readonly verified: boolean;
  /** "Goiânia · GO". */
  readonly locationLabel: string | null;
  /** "4,8" — só com reputação pública (3+ avaliações). */
  readonly ratingLabel: string | null;
  readonly eventsLabel: string;
  readonly followersLabel: string;
  /** "3 com inscrição aberta". */
  readonly openLabel: string | null;
}

export function organizerDirectoryCardVm(p: OrganizerPublicProfile, reputation: OrganizerReputationDetail | null): OrganizerDirectoryCardVm {
  const { eventsCompleted, openEvents } = p.stats;
  return {
    id: p.uid,
    link: ['/organizadores', p.uid],
    name: p.name,
    initials: organizerInitials(p.name),
    logoUrl: p.logoUrl,
    verified: p.verified,
    locationLabel: [p.city, p.state].filter((v): v is string => !!v).join(' · ') || null,
    ratingLabel: hasPublicRating(reputation) ? formatOrganizerRating(reputation.average) : null,
    eventsLabel: `${formatCount(eventsCompleted)} ${eventsCompleted === 1 ? 'evento realizado' : 'eventos realizados'}`,
    followersLabel: `${formatCompactCount(p.followersCount)} ${p.followersCount === 1 ? 'seguidor' : 'seguidores'}`,
    openLabel: openEvents > 0 ? `${openEvents} com inscrição aberta` : null,
  };
}

/** Quem tem inscrição aberta primeiro; depois mais seguidores; depois o nome. */
export function sortOrganizers(list: readonly OrganizerPublicProfile[]): OrganizerPublicProfile[] {
  return [...list].sort((a, b) => {
    const open = Number(b.stats.openEvents > 0) - Number(a.stats.openEvents > 0);
    if (open !== 0) return open;
    if (b.followersCount !== a.followersCount) return b.followersCount - a.followersCount;
    return a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });
  });
}

/** Minúsculas e sem acento: "Goiânia" casa com "goiania". */
export function foldSearchText(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

/** Busca no cliente por nome e cidade/UF: cada termo digitado tem de aparecer em algum deles. */
export function filterOrganizers(list: readonly OrganizerPublicProfile[], query: string): OrganizerPublicProfile[] {
  const terms = foldSearchText(query).split(/\s+/).filter((t) => t.length > 0);
  if (terms.length === 0) return [...list];
  return list.filter((p) => {
    const haystack = foldSearchText([p.name, p.city ?? '', p.state ?? ''].join(' '));
    return terms.every((t) => haystack.includes(t));
  });
}
