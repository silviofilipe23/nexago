/**
 * NexaSquad: espelho público dos embaixadores (`squadPublic/{uid}`), lido sem login pela página
 * "Conheça o Squad" do site.
 *
 * O contrato (`squadAmbassadors`) leva comissão, % de desconto e versão das regras, e o perfil
 * (`users`) é gravado pelo atleta — nenhum dos dois pode abrir para leitura pública. Daqui só sai
 * o que a página mostra: nome, foto, nível do programa, cidade/arena, esporte, Elo, torneios e o
 * código. Nenhum número de dinheiro (nem o % de desconto: o desconto real tem teto na taxa da
 * plataforma, então um % publicado seria promessa errada).
 *
 * Lógica pura (sem Firestore): quem lê e grava é `squad-public-sync.ts`.
 */
import {SAND_RANK_TRACK, sandRankLabel} from "./sand-rank-engine";
import {isValidCode} from "./squad-program";
import type {SquadTier} from "./squad-rules";

export const SQUAD_PUBLIC = "squadPublic";

type Raw = Record<string, unknown>;

const TIERS: readonly SquadTier[] = ["ath", "amb", "pro", "cap"];

export interface SquadPublicEntry {
  name: string;
  photoUrl: string | null;
  tier: SquadTier;
  code: string;
  city: string | null;
  state: string | null;
  arenaName: string | null;
  /** Código do esporte principal (`beachTennis`, `volleyball`…); o site traduz pelo catálogo. */
  sport: string | null;
  /** Rótulo do elo da trilha de gamificação ("Elite II"); `eloIndex` ordena (0 = Iniciante III). */
  elo: string | null;
  eloIndex: number | null;
  tournaments: number | null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function strOrNull(v: unknown): string | null {
  return str(v) || null;
}

function isObj(v: unknown): v is Raw {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function httpUrl(v: unknown): string | null {
  const s = str(v);
  return /^https?:\/\//i.test(s) ? s : null;
}

/**
 * O que a página usa do perfil do atleta, já com a privacidade aplicada. É também a impressão
 * digital do gatilho de `users`: se isto não mudou, a escrita (último acesso, keywords…) não
 * mexe na página e o gatilho sai sem ler nada.
 */
export interface PublicUserPart {
  name: string | null;
  photoUrl: string | null;
  city: string | null;
  state: string | null;
  arenaName: string | null;
  sport: string | null;
  eloIndex: number | null;
  /** Perfil privado: sai sem foto, esporte e números (fica o papel de embaixador e o código). */
  private: boolean;
  /** "Mostrar conquistas e nível" desligado: sai sem Elo e torneios. */
  hideLevel: boolean;
}

export function publicUserPart(user: Raw | null): PublicUserPart | null {
  if (!user) return null;
  const sports = Array.isArray(user["sports"]) ? user["sports"] : [];
  const sandRank = isObj(user["sandRank"]) ? user["sandRank"] : null;
  const trackIndex = sandRank?.["trackIndex"];
  const privacy = isObj(user["privacyPreferences"]) ? user["privacyPreferences"] : {};
  const showOthers = isObj(privacy["showOthers"]) ? privacy["showOthers"] : {};
  return {
    name: strOrNull(user["fullName"]) ?? strOrNull(user["name"]) ?? strOrNull(user["displayName"]) ??
      strOrNull(user["nickname"]),
    photoUrl: httpUrl(user["profilePhotoUrl"]) ?? httpUrl(user["photoURL"]) ?? httpUrl(user["avatarUrl"]),
    city: strOrNull(user["city"]),
    state: strOrNull(user["state"]),
    arenaName: strOrNull(user["mainArenaName"]),
    sport: strOrNull(user["primarySport"]) ?? strOrNull(user["sport"]) ?? strOrNull(sports[0]),
    eloIndex: Number.isInteger(trackIndex) && SAND_RANK_TRACK[trackIndex as number] ? (trackIndex as number) : null,
    private: privacy["profileVisibility"] === "private",
    hideLevel: showOthers["achievementsAndLevel"] === false,
  };
}

export function samePublicUserPart(a: PublicUserPart | null, b: PublicUserPart | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Só contrato ativo aparece: pausado responde "Código indisponível." e encerrado não vale mais. */
export function isPublicContract(contract: Raw | null): boolean {
  return !!contract && contract["status"] === "active" &&
    TIERS.includes(contract["tier"] as SquadTier) && isValidCode(str(contract["code"]));
}

export function rankingTournaments(ranking: Raw | null): number | null {
  const n = ranking?.["tournamentsCount"];
  return typeof n === "number" && Number.isInteger(n) && n >= 0 ? n : null;
}

/**
 * Projeção do embaixador para a página pública; `null` = fora da página (contrato não ativo ou
 * conta apagada). Cidade e arena vêm do perfil de hoje e caem para o retrato do contrato.
 */
export function buildSquadPublic(input: {
  contract: Raw | null;
  user: Raw | null;
  ranking: Raw | null;
}): SquadPublicEntry | null {
  const {contract} = input;
  if (!isPublicContract(contract)) return null;
  const u = publicUserPart(input.user);
  if (!u) return null;
  const name = u.name ?? strOrNull(contract!["displayName"]);
  if (!name) return null;
  const showLevel = !u.private && !u.hideLevel;
  const eloStep = showLevel && u.eloIndex !== null ? SAND_RANK_TRACK[u.eloIndex] : undefined;
  return {
    name,
    photoUrl: u.private ? null : u.photoUrl,
    tier: contract!["tier"] as SquadTier,
    code: str(contract!["code"]),
    city: u.city ?? strOrNull(contract!["city"]),
    state: u.state ?? strOrNull(contract!["state"]),
    arenaName: u.arenaName ?? strOrNull(contract!["arenaName"]),
    sport: u.private ? null : u.sport,
    elo: eloStep ? sandRankLabel(eloStep) : null,
    eloIndex: eloStep ? eloStep.trackIndex : null,
    tournaments: showLevel ? rankingTournaments(input.ranking) : null,
  };
}
