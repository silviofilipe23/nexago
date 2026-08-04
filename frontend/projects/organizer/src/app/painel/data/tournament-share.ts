/**
 * Link de inscrição que o organizador compartilha com os atletas.
 *
 * O destino depende da visibilidade do torneio, porque os dois destinos possíveis não servem
 * pros dois casos:
 *
 * - `publicListing` → página do torneio no site (`/torneios/{slug-id}`). Abre sem login, tem
 *   preview rico (OG image) quando colada no WhatsApp/Instagram e leva ao "Inscreva-se".
 * - `linkOnly` (ou torneio antigo, sem o campo) → inscrição direta no portal do atleta
 *   (`/torneios/{id}/inscricao`). O site filtra `visibility === 'publicListing'` de forma
 *   estrita, então qualquer outro valor lá é 404 — mandar pra inscrição é o único link que
 *   funciona. Quem não tem conta cai no login e o `redirect` do `authGuard` traz de volta.
 *
 * Módulo puro de propósito: nada de Angular, Firestore ou `Intl` aqui — local e datas chegam
 * já formatados por quem chama.
 */

import type { OrganizerTournament } from './tournament.model';

export type TournamentShareTarget = 'site' | 'inscricao';

export interface TournamentShareBaseUrls {
  /** `environment.publicSiteUrl` — site público (Next.js). */
  siteBaseUrl: string;
  /** `environment.athleteAppUrl` — portal do atleta. */
  athleteBaseUrl: string;
}

export interface TournamentShareLink {
  url: string;
  target: TournamentShareTarget;
}

/** Marcas diacríticas da forma NFD. Escrito com escapes Unicode — os caracteres literais são
 *  combinantes e se grudam no vizinho em qualquer editor/diff. */
const DIACRITICS = /[\u0300-\u036f]/g;

/** Mesma regra do `slugify` do site (`site/src/lib/slug.ts`): sem acentos, kebab-case, 60 chars. */
export function slugifyTournamentName(input: string): string {
  return input
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

/** Segmento "nome-do-torneio-id" do site. Montar o slug aqui evita o redirect 308 que o site
 *  faria se recebesse só o id — o link compartilhado já cai na URL canônica. */
export function toTournamentSlugId(name: string, id: string): string {
  const slug = slugifyTournamentName(name);
  return slug ? `${slug}-${id}` : id;
}

function trimBase(url: string): string {
  return url.replace(/\/+$/, '');
}

export function tournamentShareLink(
  tournament: Pick<OrganizerTournament, 'id' | 'name' | 'visibility'>,
  bases: TournamentShareBaseUrls,
): TournamentShareLink {
  if (tournament.visibility === 'publicListing') {
    return {
      url: `${trimBase(bases.siteBaseUrl)}/torneios/${toTournamentSlugId(tournament.name, tournament.id)}`,
      target: 'site',
    };
  }
  return {
    url: `${trimBase(bases.athleteBaseUrl)}/torneios/${tournament.id}/inscricao`,
    target: 'inscricao',
  };
}

export interface TournamentShareMessageInput {
  name: string;
  /** Local já resolvido pelo chamador (`location ?? city`), ou nulo. */
  place: string | null;
  /** Período já formatado (ex.: "12 – 14 set"), ou nulo. */
  dateLabel: string | null;
  url: string;
}

/** Texto pronto de divulgação. Curto de propósito: cabe na prévia do WhatsApp sem cortar o
 *  link, e não cita vagas/categorias — número que desatualiza na primeira inscrição.
 *
 *  Local e período vão numa linha própria, não emendados no nome: nome de etapa costuma já
 *  ter travessão ("Copa de Verão — Etapa 2") e o resultado virava travessão duplo. */
export function tournamentShareMessage(input: TournamentShareMessageInput): string {
  const details = [input.place, input.dateLabel].filter((v): v is string => !!v?.trim()).join(' · ');
  const headline = details ? `🏆 ${input.name}\n${details}` : `🏆 ${input.name}`;
  return `${headline}\n\nInscrições abertas! Garanta sua vaga:\n${input.url}`;
}

/** `wa.me` sem número: o WhatsApp pergunta pra quem enviar. Mesma assinatura do
 *  `whatsAppShareUrl` do portal do atleta (`shared/partner-invite/partner-invite.ts`). */
export function whatsAppShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** Nome do arquivo do QR baixado — o slug já é seguro pra sistema de arquivos. */
export function tournamentQrFileName(name: string, id: string): string {
  return `torneio-${toTournamentSlugId(name, id)}-qr.png`;
}
