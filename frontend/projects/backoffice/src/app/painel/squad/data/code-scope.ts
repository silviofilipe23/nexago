/**
 * NexaSquad: onde o código do embaixador vale (`codeScope` do contrato, do convite e do nível).
 *
 * Fora do escopo o código não existe naquela compra: nem prévia no checkout, nem desconto, nem
 * comissão. Vale onde o contrato E o nível (versão do contrato) deixam; sem o campo, em tudo. Na
 * Loja, também a regra global precisa estar ligada (ela nasce desligada). Espelho de `codeScopeOf`
 * em `functions/src/squad-rules.ts`: mudou lá, muda aqui.
 */
import type { FollowerDiscountKind, FollowerDiscountScope } from '../niveis-regras/data/squad-rules';

/** `inList`: como a área aparece no meio de uma lista ("inscrições em torneios e Loja"). */
export const CODE_SCOPE_OPTIONS: ReadonlyArray<{ kind: FollowerDiscountKind; label: string; inList: string }> = [
  { kind: 'registration', label: 'Inscrições em torneios', inList: 'inscrições em torneios' },
  { kind: 'booking', label: 'Reservas de quadra', inList: 'reservas de quadra' },
  { kind: 'club', label: 'Clubinho', inList: 'clubinho' },
  { kind: 'store', label: 'Loja', inList: 'Loja' },
];

/** Contrato/nível sem restrição. Na Loja quem decide é a regra global (nasce desligada). */
export const FULL_CODE_SCOPE: FollowerDiscountScope = { registration: true, booking: true, club: true, store: true };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Vale só onde todos deixam (contrato ∧ nível); sem nenhum, vale em tudo. */
export function intersectScopes(...scopes: FollowerDiscountScope[]): FollowerDiscountScope {
  return {
    registration: scopes.every((s) => s.registration),
    booking: scopes.every((s) => s.booking),
    club: scopes.every((s) => s.club),
    store: scopes.every((s) => s.store),
  };
}

/** Campo do contrato: ausente → `null` (vale em tudo); tipo ausente ou inválido conta como ligado. */
export function codeScopeOf(raw: unknown): FollowerDiscountScope | null {
  if (!isObj(raw)) return null;
  return {
    registration: raw['registration'] !== false,
    booking: raw['booking'] !== false,
    club: raw['club'] !== false,
    store: raw['store'] !== false,
  };
}

/** O que o convite manda: tudo ligado → `null` (o contrato nasce sem o campo); nada ligado → inválido. */
export function codeScopePayload(scope: FollowerDiscountScope): FollowerDiscountScope | null | 'invalid' {
  const on = CODE_SCOPE_OPTIONS.filter((o) => scope[o.kind]);
  if (on.length === 0) return 'invalid';
  return on.length === CODE_SCOPE_OPTIONS.length ? null : { ...scope };
}

/** "Inscrições em torneios e clubinho"; `null` quando vale em tudo (a linha nem aparece). */
export function codeScopeLabel(scope: FollowerDiscountScope | null): string | null {
  if (!scope) return null;
  const on = CODE_SCOPE_OPTIONS.filter((o) => scope[o.kind]);
  if (on.length === CODE_SCOPE_OPTIONS.length) return null;
  if (on.length === 0) return 'Nenhuma compra';
  const [first, ...rest] = on.map((o, i) => (i === 0 ? o.label : o.inList));
  return rest.length === 0 ? first : `${[first, ...rest.slice(0, -1)].join(', ')} e ${rest[rest.length - 1]}`;
}
