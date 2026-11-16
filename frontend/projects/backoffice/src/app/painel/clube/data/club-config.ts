/**
 * `appConfig/benefitsClub`: liga o card do clube no Hub para todos (`enabled`), diz quem testa
 * (`testerUids`, até 50) e, na v2, qual parceiro "oferece" o card do Hub (`hubSponsorPartnerId`).
 * A rule aceita só esses campos mais a autoria. Funções puras; o repositório grava.
 */

export const TESTERS_MAX = 50;
/** Uid do Firebase Auth: letras, números, `_` e `-`, até 128. */
const UID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export interface ClubConfig {
  enabled: boolean;
  testerUids: string[];
  /** Card do Hub em modo patrocinador: "Oferecido por <parceiro>". `null` = card normal. */
  hubSponsorPartnerId: string | null;
  updatedAt: Date | null;
  updatedByName: string;
}

export interface ClubConfigPayload {
  enabled: boolean;
  testerUids: string[];
  hubSponsorPartnerId?: string;
}

const PARTNER_ID_PATTERN = /^[a-z0-9-]{1,60}$/;

function dateOf(value: unknown): Date | null {
  if (value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate(): Date }).toDate();
  }
  return value instanceof Date ? value : null;
}

/** Sem doc = desligado e ninguém testando (além dos admins, que sempre veem). */
export function clubConfigFromDoc(data: Record<string, unknown> | undefined): ClubConfig {
  const raw = data ?? {};
  const list: unknown[] = Array.isArray(raw['testerUids']) ? raw['testerUids'] : [];
  const uids = list.filter((u): u is string => typeof u === 'string' && UID_PATTERN.test(u));
  const by = raw['updatedByName'];
  const sponsor = raw['hubSponsorPartnerId'];
  return {
    enabled: raw['enabled'] === true,
    testerUids: [...new Set(uids)].slice(0, TESTERS_MAX),
    hubSponsorPartnerId: typeof sponsor === 'string' && PARTNER_ID_PATTERN.test(sponsor) ? sponsor : null,
    updatedAt: dateOf(raw['updatedAt']),
    updatedByName: typeof by === 'string' ? by : '',
  };
}

/** Acrescenta um uid à lista (sem espaço, sem repetir, até 50) ou devolve o porquê não. */
export function addTester(list: readonly string[], raw: string): { list: string[] } | { error: string } {
  const uid = raw.trim();
  if (uid === '') return { error: 'Cole o uid do atleta.' };
  if (!UID_PATTERN.test(uid)) return { error: 'Uid inválido: só letras, números, _ e -.' };
  if (list.includes(uid)) return { error: 'Esse uid já está na lista.' };
  if (list.length >= TESTERS_MAX) return { error: `Limite de ${TESTERS_MAX} pessoas testando.` };
  return { list: [...list, uid] };
}

export function removeTester(list: readonly string[], uid: string): string[] {
  return list.filter((u) => u !== uid);
}

/**
 * O doc inteiro (sem merge). Sem patrocinador o campo fica de fora, que vale `null` para quem lê:
 * assim a liberação e a lista de quem testa continuam gravando mesmo antes da rule da v2.
 */
export function configPayload(
  enabled: boolean,
  testerUids: readonly string[],
  hubSponsorPartnerId: string | null = null,
): ClubConfigPayload {
  const base = { enabled, testerUids: [...testerUids].slice(0, TESTERS_MAX) };
  return hubSponsorPartnerId ? { ...base, hubSponsorPartnerId } : base;
}

/** Nome de exibição do doc `users/{uid}`: nome completo, apelido de exibição ou e-mail. */
export function userDisplayName(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null;
  for (const key of ['fullName', 'displayName', 'name', 'nickname', 'email']) {
    const value = data[key];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return null;
}

/** "Silvio Dionizio Filho" → "Silvio D." (a pílula do card é curta). */
export function shortName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1 || name.includes('@')) return name.trim();
  return `${words[0]} ${words[1]!.charAt(0).toUpperCase()}.`;
}
