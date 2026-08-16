/**
 * Convite de parceiro sem cadastro (inscrição em torneio).
 *
 * O backend só cria convite de dupla para `inviteeUid` existente
 * (`sendTournamentPartnerInvite`), então o convite externo fecha o ciclo em
 * duas pontas, sem função nova:
 *
 * 1. Quem convida compartilha um link de cadastro com contexto
 *    (`/cadastro?ref=&torneio=&categoria=&de=`) — `ref` é o código de
 *    indicação já existente (UID, ver `athlete-referral-repository.ts`).
 * 2. O convidado cria a conta pelo link (o vínculo `referredBy` é registrado
 *    via `registerReferral`) e cai no torneio ao terminar o onboarding; quem
 *    convidou então busca o nome no diretório e envia o convite real.
 *
 * O contexto sobrevive a cadastro→onboarding via localStorage (o fluxo troca
 * de rota e pode passar por redirect de OAuth).
 */

export const PARTNER_INVITE_REF_PARAM = 'ref';
export const PARTNER_INVITE_TOURNAMENT_PARAM = 'torneio';
export const PARTNER_INVITE_CATEGORY_PARAM = 'categoria';
export const PARTNER_INVITE_FROM_PARAM = 'de';

/** IDs de doc do Firestore — barra qualquer coisa que quebraria a URL/rota. */
const SAFE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export function isSafeInviteId(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 && SAFE_ID_PATTERN.test(value);
}

export interface PartnerInviteContext {
  referralCode: string;
  tournamentId: string | null;
  categoryId: string | null;
  inviterName: string | null;
}

export function buildPartnerInviteUrl(origin: string, ctx: PartnerInviteContext): string {
  const params = new URLSearchParams();
  if (isSafeInviteId(ctx.referralCode)) params.set(PARTNER_INVITE_REF_PARAM, ctx.referralCode);
  if (isSafeInviteId(ctx.tournamentId)) params.set(PARTNER_INVITE_TOURNAMENT_PARAM, ctx.tournamentId);
  if (isSafeInviteId(ctx.categoryId)) params.set(PARTNER_INVITE_CATEGORY_PARAM, ctx.categoryId);
  const inviterName = ctx.inviterName?.trim();
  if (inviterName) params.set(PARTNER_INVITE_FROM_PARAM, inviterName);
  const query = params.toString();
  return query ? `${origin}/cadastro?${query}` : `${origin}/cadastro`;
}

export function buildPartnerInviteMessage(params: {
  partnerName: string | null;
  tournamentName: string;
  categoryName: string;
  url: string;
  /** Categoria de EQUIPE nomeada (trio+): o convite fala da equipe, não de dupla. */
  teamName?: string | null;
}): string {
  const greeting = params.partnerName?.trim() ? `Fala, ${params.partnerName.trim()}!` : 'Fala!';
  const teamName = params.teamName?.trim();
  if (teamName) {
    return (
      `${greeting} Bora jogar na minha equipe ${teamName} no ${params.tournamentName} (${params.categoryName})? ` +
      `Cria tua conta no nexaGO pelo meu link que eu te mando o convite da equipe: ${params.url}`
    );
  }
  return (
    `${greeting} Bora formar dupla comigo no ${params.tournamentName} (${params.categoryName})? ` +
    `Cria tua conta no nexaGO pelo meu link que eu te mando o convite da dupla: ${params.url}`
  );
}

export function whatsAppShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** Lista PT das pendências do cadastro do parceiro (rótulos vêm do backend do
 *  envio do convite): "WhatsApp e cidade", "cadastro inicial, WhatsApp e
 *  cidade". Vazia/ausente → "o cadastro" (o backend antigo não manda a lista). */
export function formatMissingStepsList(steps: readonly string[] | undefined): string {
  const clean = (steps ?? []).map((s) => s.trim()).filter((s) => s.length > 0);
  if (clean.length === 0) return 'o cadastro';
  if (clean.length === 1) return clean[0]!;
  return `${clean.slice(0, -1).join(', ')} e ${clean[clean.length - 1]}`;
}

// ── Contexto do convidado (cadastro → onboarding) ────────────────────────────

export const PARTNER_INVITE_CONTEXT_KEY = 'nexago-athlete-partner-invite';

/** Janela de atribuição: link aberto há mais tempo que isso não conta mais. */
export const PARTNER_INVITE_CONTEXT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface StoredPartnerInviteContext extends PartnerInviteContext {
  storedAt: number;
}

export function stashPartnerInviteContext(ctx: PartnerInviteContext, now = Date.now()): void {
  try {
    const stored: StoredPartnerInviteContext = { ...ctx, storedAt: now };
    localStorage.setItem(PARTNER_INVITE_CONTEXT_KEY, JSON.stringify(stored));
  } catch {
    /* modo privado / quota */
  }
}

export function peekPartnerInviteContext(now = Date.now()): PartnerInviteContext | null {
  try {
    const raw = localStorage.getItem(PARTNER_INVITE_CONTEXT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredPartnerInviteContext>;
    const storedAt = typeof parsed.storedAt === 'number' ? parsed.storedAt : 0;
    if (now - storedAt > PARTNER_INVITE_CONTEXT_TTL_MS) {
      localStorage.removeItem(PARTNER_INVITE_CONTEXT_KEY);
      return null;
    }
    if (typeof parsed.referralCode !== 'string' || parsed.referralCode.length === 0) return null;
    return {
      referralCode: parsed.referralCode,
      tournamentId: isSafeInviteId(parsed.tournamentId ?? null) ? parsed.tournamentId! : null,
      categoryId: isSafeInviteId(parsed.categoryId ?? null) ? parsed.categoryId! : null,
      inviterName: typeof parsed.inviterName === 'string' && parsed.inviterName.trim() ? parsed.inviterName : null,
    };
  } catch {
    return null;
  }
}

export function takePartnerInviteContext(now = Date.now()): PartnerInviteContext | null {
  const ctx = peekPartnerInviteContext(now);
  try {
    localStorage.removeItem(PARTNER_INVITE_CONTEXT_KEY);
  } catch {
    /* modo privado / quota */
  }
  return ctx;
}

// ── Marcador de quem convidou ("convite por link enviado") ───────────────────

export interface PartnerLinkInviteMarker {
  partnerName: string | null;
  sentAt: number;
}

function markerKey(tournamentId: string, categoryId: string): string {
  return `nexago-athlete-partner-link-invite:${tournamentId}:${categoryId}`;
}

export function savePartnerLinkInviteMarker(
  tournamentId: string,
  categoryId: string,
  partnerName: string | null,
  now = Date.now(),
): void {
  try {
    const marker: PartnerLinkInviteMarker = { partnerName: partnerName?.trim() || null, sentAt: now };
    localStorage.setItem(markerKey(tournamentId, categoryId), JSON.stringify(marker));
  } catch {
    /* modo privado / quota */
  }
}

export function readPartnerLinkInviteMarker(tournamentId: string, categoryId: string): PartnerLinkInviteMarker | null {
  try {
    const raw = localStorage.getItem(markerKey(tournamentId, categoryId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PartnerLinkInviteMarker>;
    if (typeof parsed.sentAt !== 'number') return null;
    return {
      partnerName: typeof parsed.partnerName === 'string' && parsed.partnerName.trim() ? parsed.partnerName : null,
      sentAt: parsed.sentAt,
    };
  } catch {
    return null;
  }
}

export function clearPartnerLinkInviteMarker(tournamentId: string, categoryId: string): void {
  try {
    localStorage.removeItem(markerKey(tournamentId, categoryId));
  } catch {
    /* modo privado / quota */
  }
}
