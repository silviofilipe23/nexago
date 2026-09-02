/** Aviso do prazo de garantia da vaga na tela de inscrição.
 *
 *  Módulo puro (padrão de `painel/registration-progress.ts`): a regra mora aqui e é o que os
 *  testes exercitam. Espelha `registrationHoldNotice` do app Flutter — mesmas frases nas duas
 *  superfícies, senão o atleta lê um prazo no celular e outro no navegador. */

export const DEFAULT_REGISTRATION_HOLD_MINUTES = 30;

/** Minutos de garantia do torneio — espelha `resolveRegistrationHoldMinutes` do backend. */
export function resolveRegistrationHoldMinutes(data: {
  registrationHoldEnabled?: unknown;
  registrationHoldMinutes?: unknown;
}): number {
  if (data.registrationHoldEnabled === false) return DEFAULT_REGISTRATION_HOLD_MINUTES;
  const raw = data.registrationHoldMinutes;
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : Number.NaN;
  if (Number.isFinite(n) && n > 0) return Math.trunc(n);
  return DEFAULT_REGISTRATION_HOLD_MINUTES;
}

/** Janela fixa do countdown — configurada no torneio, não recalculada no mount. */
export function registrationHoldCountdownTotalMs(holdMinutes: number): number {
  return Math.max(1, Math.min(9999, holdMinutes)) * 60_000;
}

export interface RegistrationHoldCountdownView {
  headline: string;
  clockLabel: string;
  progress: number;
  expired: boolean;
}

/** Countdown "PAGUE EM …" + mm:ss + progresso — espelha `RegistrationWizardNotice` do app. */
export function registrationHoldCountdownView(params: {
  holdExpiresAt: Date;
  holdMinutes: number;
  now?: Date;
}): RegistrationHoldCountdownView {
  const now = params.now ?? new Date();
  const totalMs = registrationHoldCountdownTotalMs(params.holdMinutes);
  const remainingMs = params.holdExpiresAt.getTime() - now.getTime();
  const expired = remainingMs <= 0;
  const progress = expired ? 0 : Math.min(1, Math.max(0, remainingMs / totalMs));
  return {
    headline: expired ? 'PRAZO ENCERRADO' : holdCountdownHeadline(totalMs),
    clockLabel: expired ? '00:00' : holdCountdownClockLabel(remainingMs),
    progress,
    expired,
  };
}

/** Exibe o relógio da vaga reservada? */
export function shouldShowRegistrationHoldCountdown(params: {
  holdExpiresAt: Date | null;
  isPaid: boolean;
  hasLivePartnerInvite: boolean;
}): boolean {
  const { holdExpiresAt, isPaid, hasLivePartnerInvite } = params;
  return holdExpiresAt != null && !isPaid && !hasLivePartnerInvite;
}

function holdCountdownHeadline(totalMs: number): string {
  const totalMinutes = Math.floor(totalMs / 60_000);
  if (totalMinutes >= 60) {
    const hours = Math.floor(totalMinutes / 60);
    return hours === 1 ? 'PAGUE EM 1 H' : `PAGUE EM ${hours} H`;
  }
  const minutes = Math.max(1, Math.min(9999, totalMinutes));
  return `PAGUE EM ${minutes} MIN`;
}

function holdCountdownClockLabel(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.min(remainingMs / 1000, 99 * 3600 + 59 * 60 + 59));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** Frase do prazo, ou `null` quando não há relógio real para mostrar.
 *
 *  Com convite pendente vivo a vaga acompanha o convite (48h) e a contagem some: mostrá-la ali
 *  mentiria sobre quanto tempo o atleta tem. Inscrição sem `holdExpiresAt` — anterior à regra,
 *  criada pelo organizador, em fila ou de torneio com o prazo desligado — também não mostra nada. */
export function registrationHoldNotice(params: {
  holdExpiresAt: Date | null;
  isPaid: boolean;
  hasLivePartnerInvite: boolean;
  now?: Date;
}): string | null {
  const { holdExpiresAt, isPaid, hasLivePartnerInvite } = params;
  if (!holdExpiresAt || isPaid || hasLivePartnerInvite) return null;
  const now = params.now ?? new Date();
  const remainingMs = holdExpiresAt.getTime() - now.getTime();
  if (remainingMs <= 0) return 'Prazo encerrado — sua vaga será liberada.';
  return `Vaga garantida até ${clockLabel(holdExpiresAt, now)} · ${remainingLabel(remainingMs)}`;
}

/** Janela mínima que o servidor exige para abrir uma cobrança: o piso do PIX
 *  (3 min) mais a margem que separa a cobrança do fim do prazo da vaga (2 min).
 *  Espelha `PIX_MIN_WINDOW_MS + PIX_HOLD_MARGIN_MS` das Functions. */
const PIX_REGENERATION_FLOOR_MS = 5 * 60_000;

/** Ainda dá tempo de gerar outro código?
 *
 *  A cobrança cabe dentro do prazo da vaga, então perto do fim o servidor
 *  recusa gerar — e oferecer "gerar novo código" ali manda o atleta bater numa
 *  porta fechada. Inscrição sem prazo nunca esbarra nisso. */
export function canRegeneratePix(params: {
  holdExpiresAt: Date | null;
  now?: Date;
}): boolean {
  const { holdExpiresAt } = params;
  if (!holdExpiresAt) return true;
  const now = params.now ?? new Date();
  return holdExpiresAt.getTime() - now.getTime() >= PIX_REGENERATION_FLOOR_MS;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Hora de parede local; ganha a data quando o vencimento não é hoje. */
function clockLabel(expiresAt: Date, now: Date): string {
  const time = `${pad(expiresAt.getHours())}:${pad(expiresAt.getMinutes())}`;
  const sameDay =
    expiresAt.getFullYear() === now.getFullYear() &&
    expiresAt.getMonth() === now.getMonth() &&
    expiresAt.getDate() === now.getDate();
  if (sameDay) return time;
  return `${pad(expiresAt.getDate())}/${pad(expiresAt.getMonth() + 1)} ${time}`;
}

function remainingLabel(remainingMs: number): string {
  const minutes = Math.floor(remainingMs / 60_000);
  if (minutes < 1) return 'falta menos de 1 min';
  if (minutes < 60) return `faltam ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? 'falta 1 hora' : `faltam ${hours} horas`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'falta 1 dia' : `faltam ${days} dias`;
}
