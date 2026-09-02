/**
 * Copy e rótulos da aba "Minha inscrição" no portal do atleta — espelha o
 * protótipo de inscrição confirmada (hero, métricas, linhas de detalhe).
 *
 * Módulo puro de propósito: o componente só orquestra store/perfis; quem decide
 * O QUE escrever em cada estado é daqui.
 */

export type RegistrationTabPaymentState = 'paid' | 'share-paid' | 'pending' | 'waitlist';

export interface RegistrationTabHeroCopy {
  /** "Dupla completa. Vocês estão dentro." */
  title: string;
  /** Parágrafo sob o título. */
  body: string;
  /** Substrings de `body` que a UI destaca em negrito. */
  highlights: readonly string[];
}

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'] as const;

/** `dom · 12 jul · 08h` — sem minutos quando é hora cheia. */
export function registrationTabWhenLabel(startAt: Date | null): string | null {
  if (startAt == null) return null;
  const local = startAt;
  const weekday = WEEKDAYS[local.getDay()] ?? '';
  const month = MONTHS[local.getMonth()] ?? '';
  const hour = String(local.getHours()).padStart(2, '0');
  const minutes = local.getMinutes();
  const time = minutes === 0 ? `${hour}h` : `${hour}h${String(minutes).padStart(2, '0')}`;
  return `${weekday} · ${local.getDate()} ${month} · ${time}`;
}

/** `Arena CFC · Aparecida` — cai no que existir; `null` sem local nem cidade. */
export function registrationTabWhereLabel(location: string | null, city: string | null): string | null {
  const parts = [location?.trim(), city?.trim()].filter((p): p is string => (p?.length ?? 0) > 0);
  return parts.length > 0 ? [...new Set(parts)].join(' · ') : null;
}

export function registrationTabHeroTitle(params: {
  paymentState: RegistrationTabPaymentState;
  teamLabel: 'Dupla' | 'Equipe';
  rosterComplete: boolean;
}): string {
  const unit = params.teamLabel.toLowerCase();
  if (params.paymentState === 'waitlist') return 'Você está na lista de espera.';
  if (!params.rosterComplete) {
    return params.teamLabel === 'Equipe'
      ? 'Equipe incompleta. Falta gente no elenco.'
      : 'Dupla incompleta. Falta o parceiro.';
  }
  if (params.paymentState === 'paid') {
    return `Inscrição completa. Vocês estão dentro.`;
  }
  if (params.paymentState === 'share-paid') {
    return `Sua parte está paga. Falta a ${unit} fechar.`;
  }
  return `${params.teamLabel} montada. Falta o pagamento.`;
}

/**
 * Corpo do hero. Em pagamento confirmado conta a história do parceiro + cotas;
 * nos outros estados usa o hint operacional.
 */
export function registrationTabHeroBody(params: {
  paymentState: RegistrationTabPaymentState;
  teamLabel: 'Dupla' | 'Equipe';
  rosterComplete: boolean;
  partnerFirstName: string | null;
  entryFee: number | null;
  teamSize: number;
  paymentHint: string;
}): RegistrationTabHeroCopy {
  const title = registrationTabHeroTitle({
    paymentState: params.paymentState,
    teamLabel: params.teamLabel,
    rosterComplete: params.rosterComplete,
  });

  if (params.paymentState === 'paid' && params.rosterComplete && params.entryFee != null && params.entryFee > 0) {
    const size = Math.max(2, params.teamSize);
    const share = params.entryFee / size;
    const shareLabel = formatBRL(share);
    const totalLabel = formatBRL(params.entryFee);
    const partner = params.partnerFirstName?.trim() || 'Seu parceiro';
    const split = Array.from({ length: size }, () => shareLabel).join(' + ');
    const unit = params.teamLabel.toLowerCase();
    const shareWord = size > 2 ? 'a própria cota' : 'sua metade';
    const body =
      `A inscrição de ${totalLabel} está quitada e a ${unit} entra no sorteio da chave.`;
    return { title, body, highlights: [split, totalLabel] };
  }

  if (params.paymentState === 'paid' && params.rosterComplete) {
    return {
      title,
      body: `A inscrição está confirmada e a ${params.teamLabel.toLowerCase()} entra no sorteio da chave.`,
      highlights: [],
    };
  }

  return { title, body: params.paymentHint, highlights: [] };
}

/** Valor da métrica "DUPLA/EQUIPE". */
export function registrationTabTeamMetricValue(params: {
  paymentState: RegistrationTabPaymentState;
  rosterComplete: boolean;
  rosterFlag: string | null;
}): string {
  if (params.paymentState === 'waitlist') return 'lista de espera';
  if (params.rosterFlag) return params.rosterFlag.toLowerCase();
  return params.rosterComplete ? 'completa' : 'incompleta';
}

/** Valor da métrica "PAGAMENTO". */
export function registrationTabPaymentMetricValue(params: {
  paymentState: RegistrationTabPaymentState;
  entryFeeLabel: string;
}): string {
  switch (params.paymentState) {
    case 'paid':
      return params.entryFeeLabel === '—' ? 'quitado' : params.entryFeeLabel;
    case 'share-paid':
      return 'sua parte paga';
    case 'waitlist':
      return '—';
    default:
      return 'pendente';
  }
}

/** Destaca substrings em `text` preservando a ordem — para o template montar spans. */
export function registrationTabBodyParts(
  text: string,
  highlights: readonly string[],
): readonly { text: string; emphasize: boolean }[] {
  if (highlights.length === 0 || text.length === 0) {
    return [{ text, emphasize: false }];
  }
  const parts: { text: string; emphasize: boolean }[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    let nextIndex = -1;
    let nextHighlight = '';
    for (const h of highlights) {
      if (h.length === 0) continue;
      const idx = text.indexOf(h, cursor);
      if (idx < 0) continue;
      if (nextIndex < 0 || idx < nextIndex) {
        nextIndex = idx;
        nextHighlight = h;
      }
    }
    if (nextIndex < 0) {
      parts.push({ text: text.slice(cursor), emphasize: false });
      break;
    }
    if (nextIndex > cursor) {
      parts.push({ text: text.slice(cursor, nextIndex), emphasize: false });
    }
    parts.push({ text: nextHighlight, emphasize: true });
    cursor = nextIndex + nextHighlight.length;
  }
  return parts.length > 0 ? parts : [{ text, emphasize: false }];
}

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 });
}
