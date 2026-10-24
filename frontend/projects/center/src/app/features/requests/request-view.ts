/**
 * Trancar, pausa por lesão e cancelar (portal › Trancar e cancelar). Funções puras de visão sobre
 * `trainingCenters/{c}/enrollmentRequests` — quem decide e grava é o servidor
 * (`training-center-enrollment-requests.ts`). Datas são dias `YYYY-MM-DD` na parede do centro.
 */
import { addDays, formatDayKey, wallClock } from '../../domain/dates';
import {
  CANCEL_REASONS,
  CLEARANCE_LEAD_DAYS,
  type CenterPolicies,
  type Enrollment,
  type EnrollmentRequest,
  type EnrollmentRequestStatus,
  type EnrollmentRequestType,
  type RetentionOffer,
} from '../../domain/models';

export type RequestFilter = 'all' | 'review' | 'injury' | 'pause' | 'cancel';
export type Tone = 'green' | 'red' | 'yellow' | 'orange' | 'blue' | 'dim';

export const REQUEST_FILTERS: { value: RequestFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'review', label: 'Para revisar' },
  { value: 'injury', label: 'Pausa por lesão' },
  { value: 'pause', label: 'Trancamento' },
  { value: 'cancel', label: 'Cancelamento' },
];

export const REQUEST_TYPE: Record<EnrollmentRequestType, [label: string, tone: Tone]> = {
  pause: ['Trancamento', 'blue'],
  injury: ['Pausa por lesão', 'orange'],
  cancel: ['Cancelamento', 'red'],
};

export const RETENTION_LABEL: Record<RetentionOffer, string> = {
  pause: 'Trancar',
  plan_change: 'Trocar plano',
  discount: 'Desconto de 1 mês',
};

/** Pedidos que ainda mexem na matrícula (a callable bloqueia outro pedido enquanto houver um). */
export const OPEN_STATUSES: EnrollmentRequestStatus[] = ['pending', 'needs_document', 'scheduled', 'active'];

export function isOpen(r: Pick<EnrollmentRequest, 'status'>): boolean {
  return OPEN_STATUSES.includes(r.status);
}

const isPause = (r: Pick<EnrollmentRequest, 'type'>) => r.type === 'pause' || r.type === 'injury';

function day(key: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? formatDayKey(key) : '';
}

/** Pausa por lesão em curso cuja alta a gestão precisa olhar: enviada, ou pausa já segurada esperando. */
export function clearanceToReview(r: EnrollmentRequest): boolean {
  return r.type === 'injury' && r.status === 'active' && r.requireClearance && r.clearanceStatus !== 'approved' &&
    (r.awaitingClearance || r.clearanceStatus === 'submitted');
}

/** Entra em "Para revisar": atestado pendente ou alta médica para liberar. */
export function needsReview(r: EnrollmentRequest): boolean {
  return r.status === 'pending' || clearanceToReview(r);
}

export function filterRequests(list: EnrollmentRequest[], filter: RequestFilter): EnrollmentRequest[] {
  if (filter === 'all') return list;
  if (filter === 'review') return list.filter(needsReview);
  return list.filter((r) => r.type === filter);
}

export function countByFilter(list: EnrollmentRequest[]): Record<RequestFilter, number> {
  return {
    all: list.length,
    review: filterRequests(list, 'review').length,
    injury: filterRequests(list, 'injury').length,
    pause: filterRequests(list, 'pause').length,
    cancel: filterRequests(list, 'cancel').length,
  };
}

/** "Lesão no joelho · atestado 30 dias" / "Mudança de cidade" / "Viagem". */
export function requestReason(r: EnrollmentRequest): string {
  if (r.type === 'cancel') return CANCEL_REASONS[r.reason] ?? (r.reason || '—');
  if (r.type === 'injury') {
    const what = r.reason || r.certificate?.description || 'Atestado médico';
    return r.certificate?.daysOff ? `${what} · atestado ${r.certificate.daysOff} dias` : what;
  }
  return r.reason || '—';
}

/** "24 out → 23 nov" / "Último dia 19 nov" / "Encerrado 30 set". */
export function requestPeriod(r: EnrollmentRequest): string {
  if (isPause(r)) {
    return r.startsOn && r.endsOn ? `${day(r.startsOn)} → ${day(r.endsOn)}` : '—';
  }
  if (!r.lastDay) return '—';
  if (r.status === 'done') return `Encerrado ${day(r.lastDay)}`;
  if (r.status === 'scheduled') return `Último dia ${day(r.lastDay)}`;
  return '—';
}

/** Situação curta do pedido, com o tom do texto. */
export function requestSituation(r: EnrollmentRequest): { label: string; tone: Tone } {
  switch (r.status) {
    case 'pending':
      return { label: r.overLimit ? 'Atestado para revisar · acima do limite' : 'Atestado para revisar', tone: 'yellow' };
    case 'needs_document':
      return { label: 'Aguardando outro documento', tone: 'yellow' };
    case 'scheduled':
      return isPause(r)
        ? { label: `Agendado para ${day(r.startsOn)} · vaga reservada`, tone: 'blue' }
        : { label: `Em aviso · vaga libera após ${day(r.lastDay)}`, tone: 'orange' };
    case 'active': {
      const back = day(r.pausedUntil) || day(r.endsOn);
      if (r.type === 'injury' && r.requireClearance && r.clearanceStatus !== 'approved') {
        if (r.awaitingClearance) {
          return { label: r.clearanceStatus === 'submitted' ? 'Alta enviada · pausa segue até liberar' : 'Aguardando alta · pausa segue até liberar', tone: 'yellow' };
        }
        if (r.clearanceStatus === 'submitted') return { label: `Alta enviada para revisar · volta ${back}`, tone: 'yellow' };
        if (r.clearanceStatus === 'requested') return { label: `Pausado · alta pedida · volta ${back}`, tone: 'blue' };
      }
      return { label: `Pausado · volta ${back}`, tone: 'blue' };
    }
    case 'rejected':
      return { label: 'Recusado', tone: 'red' };
    case 'withdrawn':
      return { label: r.source === 'app' && r.decidedByName === r.studentName ? 'Aluno desistiu' : 'Desfeito', tone: 'dim' };
    case 'retained':
      return {
        label:
          r.retention?.accepted === 'plan_change' && r.retention.planName
            ? `Aceitou troca para ${r.retention.planName}`
            : r.retention?.accepted === 'discount' && r.retention.percent
              ? `Aceitou ${r.retention.percent}% de desconto`
              : 'Ficou no centro',
        tone: 'green',
      };
    case 'done':
      return { label: r.type === 'cancel' ? 'Matrícula encerrada' : 'Pausa concluída', tone: 'dim' };
  }
}

export interface RequestStats {
  review: number;
  reviewSub: string;
  pausedNow: number;
  pausedSub: string;
  cancelNotice: number;
  cancelSub: string;
  retained: number;
  cancelsInMonth: number;
  retainedSub: string;
}

/** Os 4 números do topo. `month` = 'YYYY-MM' no fuso do centro. */
export function requestStats(list: EnrollmentRequest[], month: string, tz: string): RequestStats {
  const pending = list.filter((r) => r.status === 'pending');
  const clearances = list.filter(clearanceToReview).length;
  const review = pending.length + clearances;
  const over = pending.filter((r) => r.overLimit).length;
  const waitingDoc = list.filter((r) => r.status === 'needs_document').length;
  const active = list.filter((r) => r.status === 'active');
  const injuries = active.filter((r) => r.type === 'injury').length;
  const notice = list.filter((r) => r.type === 'cancel' && r.status === 'scheduled');
  const lastSeat = notice.map((r) => r.lastDay).filter(Boolean).sort().at(-1);
  const inMonth = list.filter((r) => r.type === 'cancel' && r.createdAt && wallClock(r.createdAt, tz).dayKey.startsWith(month));
  const retained = inMonth.filter((r) => r.status === 'retained').length;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return {
    review,
    reviewSub: review
      ? [
          pending.length ? plural(pending.length, 'atestado', 'atestados') : '',
          over ? `${over} acima do limite` : '',
          clearances ? plural(clearances, 'alta médica', 'altas médicas') : '',
        ].filter(Boolean).join(' · ')
      : waitingDoc
        ? `${plural(waitingDoc, 'aguarda', 'aguardam')} outro documento`
        : 'nada pendente',
    pausedNow: active.length,
    pausedSub: active.length ? `${injuries} lesão · ${active.length - injuries} trancamento` : 'ninguém em pausa',
    cancelNotice: notice.length,
    cancelSub: lastSeat ? `vagas liberam até ${day(lastSeat)}` : 'nenhum em aviso',
    retained,
    cancelsInMonth: inMonth.length,
    retainedSub: inMonth.length ? `${Math.round((retained / inMonth.length) * 100)}% dos pedidos de cancelamento` : 'nenhum pedido no mês',
  };
}

/** Pedido em andamento da matrícula (no máximo um, pela regra da callable). */
export function openRequestFor(list: EnrollmentRequest[], enrollmentId: string): EnrollmentRequest | null {
  return list.find((r) => r.enrollmentId === enrollmentId && isOpen(r)) ?? null;
}

/** Owner/admin decidem pausas aguardando revisão (aprovar, recusar, pedir documento). */
export function canDecide(r: EnrollmentRequest): boolean {
  return isPause(r) && (r.status === 'pending' || r.status === 'needs_document');
}

/** "Pedir outro documento" só quando o aluno já mandou um (pendente). */
export function canAskDocument(r: EnrollmentRequest): boolean {
  return r.type === 'injury' && r.status === 'pending';
}

/** Liberar a volta: pausa por lesão em curso que exige alta ainda não aprovada (aprovar a alta ou dispensar). */
export function canClear(r: EnrollmentRequest): boolean {
  return r.type === 'injury' && r.status === 'active' && r.requireClearance && r.clearanceStatus !== 'approved';
}

/** Texto do botão: aprova a alta enviada ou libera sem ela. */
export function clearLabel(r: Pick<EnrollmentRequest, 'clearanceStatus'>): string {
  return r.clearanceStatus === 'submitted' ? 'Aprovar alta' : 'Liberar sem alta';
}

export interface ClearanceView {
  label: string;
  tone: Tone;
  text: string;
}

/** Situação da alta médica no detalhe (null quando o pedido não exige alta). */
export function clearanceView(r: EnrollmentRequest): ClearanceView | null {
  if (r.type !== 'injury' || !r.requireClearance) return null;
  const end = day(r.endsOn);
  if (r.clearanceStatus === 'approved') {
    const who = r.clearanceDecidedByName ? ` por ${r.clearanceDecidedByName}` : '';
    return {
      label: r.clearance ? 'Alta aprovada' : 'Volta liberada sem alta',
      tone: 'green',
      text: r.status === 'active' ? `Liberada${who}. A matrícula volta em ${day(r.pausedUntil) || end}.` : `Liberada${who}.`,
    };
  }
  if (r.status !== 'active' && r.status !== 'pending' && r.status !== 'needs_document' && r.status !== 'scheduled') {
    return { label: 'Alta exigida', tone: 'dim', text: 'O centro exigia a alta médica para a volta.' };
  }
  if (r.awaitingClearance) {
    return r.clearanceStatus === 'submitted'
      ? { label: 'Alta enviada', tone: 'yellow', text: `A pausa terminou em ${end} e segue até a alta ser aprovada. Confira o documento e libere a volta.` }
      : { label: 'Aguardando alta', tone: 'orange', text: `A pausa terminou em ${end} e segue até liberar. O aluno ainda não enviou a alta.` };
  }
  if (r.clearanceStatus === 'submitted') {
    return { label: 'Alta enviada', tone: 'yellow', text: `Confira o documento. Aprovada, a matrícula volta na data marcada (${day(r.pausedUntil) || end}).` };
  }
  if (r.clearanceStatus === 'requested') {
    return { label: 'Alta pedida', tone: 'blue', text: `O aluno foi avisado para enviar a alta. Sem alta aprovada, a pausa segue depois de ${end}.` };
  }
  const ask = r.endsOn ? day(addDays(r.endsOn, -CLEARANCE_LEAD_DAYS)) : '';
  return {
    label: 'Alta exigida',
    tone: 'dim',
    text: `${ask ? `O app pede a alta em ${ask}, ${CLEARANCE_LEAD_DAYS} dias antes do fim. ` : ''}Sem alta aprovada, a pausa segue depois de ${end || 'o fim'}.`,
  };
}

/** Desfazer: pausa agendada ou cancelamento em aviso antes do último dia. */
export function canUndo(r: EnrollmentRequest, today: string): boolean {
  if (r.status !== 'scheduled') return false;
  return r.type !== 'cancel' || (!!r.lastDay && r.lastDay >= today);
}

/** Dias de pausa já usados no ano pela matrícula (espelho de `pauseDaysUsed` do servidor). */
export function pauseDaysUsed(list: EnrollmentRequest[], enrollmentId: string, year: string, countInjury: boolean, exceptId = ''): number {
  return list
    .filter((r) => r.enrollmentId === enrollmentId && r.id !== exceptId)
    .filter((r) => r.type === 'pause' || (r.type === 'injury' && countInjury))
    .filter((r) => r.status === 'scheduled' || r.status === 'active' || r.status === 'done')
    .filter((r) => r.startsOn.startsWith(year))
    .reduce((sum, r) => sum + Math.max(0, r.days), 0);
}

export interface Banner {
  tone: 'blue' | 'yellow' | 'orange' | 'red';
  title: string;
  text: string;
}

/** Faixas do detalhe de uma pausa: acima do limite da lesão e como ela conta no limite do ano. */
export function pauseBanners(r: EnrollmentRequest, p: CenterPolicies, usedDays: number): Banner[] {
  const out: Banner[] = [];
  const first = r.studentName.split(' ')[0] || 'O aluno';
  const left = Math.max(0, p.pauseMaxDaysPerYear - usedDays);
  if (r.type === 'injury' && r.overLimit) {
    out.push({
      tone: 'orange',
      title: `Afastamento acima de ${p.injuryMaxDays} dias`,
      text: `O pedido passa do limite da pausa por lesão. O centro decide caso a caso — confira o atestado antes de aprovar.`,
    });
  }
  if (r.type === 'injury' && !p.injuryCountsInLimit) {
    out.push({
      tone: 'blue',
      title: 'Pausa por lesão não conta no limite de trancamento',
      text: `${first} tem ${left} dia${left === 1 ? '' : 's'} de trancamento livre${left === 1 ? '' : 's'} no ano.`,
    });
  } else if (r.type === 'injury') {
    out.push({
      tone: 'yellow',
      title: 'Pausa por lesão conta no limite de trancamento',
      text: `Já usados no ano: ${usedDays} de ${p.pauseMaxDaysPerYear} dias. Este pedido soma ${r.days}.`,
    });
  } else {
    out.push({
      tone: 'blue',
      title: `Limite do ano: ${p.pauseMaxDaysPerYear} dias`,
      text: `${first} usou ${usedDays + (isOpen(r) || r.status === 'done' ? r.days : 0)} dias de trancamento neste ano (somando este).`,
    });
  }
  return out;
}

/** "Ao aprovar" / "O que acontece" de uma pausa. */
export function pauseEffects(r: EnrollmentRequest): [string, string][] {
  return [
    ['Pausa', r.startsOn ? `${day(r.startsOn)} → ${day(r.endsOn)} · ${r.days} dia${r.days === 1 ? '' : 's'}` : '—'],
    ['Cobrança', 'Ciclos que vencem na pausa ficam suspensos'],
    ['Vaga', 'Reservada · não vai para a lista de espera'],
    ['Volta', pauseReturn(r)],
  ];
}

function pauseReturn(r: EnrollmentRequest): string {
  if (!r.pausedUntil) return '—';
  if (r.type === 'injury' && r.requireClearance && r.clearanceStatus !== 'approved') {
    return r.awaitingClearance ? 'Segue pausada até a alta ser aprovada' : `Só com a alta aprovada · previsão ${day(r.pausedUntil)}`;
  }
  return `Matrícula reativa sozinha em ${day(r.pausedUntil)}`;
}

export interface TimelineStep {
  day: string;
  label: string;
  last: boolean;
}

/** Pedido → último dia de aula → vencimento que não é cobrado (assinatura encerra). */
export function cancelTimeline(r: EnrollmentRequest, tz: string): TimelineStep[] {
  const steps: TimelineStep[] = [];
  if (r.createdAt) steps.push({ day: day(wallClock(r.createdAt, tz).dayKey), label: 'Pedido', last: false });
  if (r.lastDay) steps.push({ day: day(r.lastDay), label: r.status === 'done' ? 'Encerrado' : 'Último dia', last: !r.cancelAt });
  if (r.cancelAt) steps.push({ day: day(r.cancelAt), label: 'Vencimento não cobrado', last: true });
  return steps;
}

/** Ofertas de retenção mostradas e a resposta do aluno. */
export function retentionRows(r: EnrollmentRequest): { offer: string; outcome: string }[] {
  const ret = r.retention;
  if (!ret || ret.offered.length === 0) return [];
  return ret.offered.map((o) => {
    const accepted = ret.accepted === o;
    const offer =
      o === 'plan_change' && accepted && ret.planName
        ? `Trocar para ${ret.planName}`
        : o === 'discount'
          ? accepted && ret.percent ? `Desconto de ${ret.percent}% em 1 mensalidade` : 'Desconto de 1 mês'
          : o === 'pause' ? 'Trancar a matrícula' : 'Trocar de plano';
    return { offer, outcome: accepted ? 'Aceitou' : r.status === 'retained' ? '—' : 'Recusou' };
  });
}

/** Fila de espera da turma, na ordem de chegada. */
export function waitlistFor(enrollments: Enrollment[], classId: string): Enrollment[] {
  return enrollments
    .filter((e) => e.classId === classId && e.status === 'waitlisted')
    .sort((a, b) => (a.waitlistedAt?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.waitlistedAt?.getTime() ?? Number.MAX_SAFE_INTEGER));
}

export function certificateKind(contentType: string): 'image' | 'pdf' | 'other' {
  if (contentType === 'application/pdf') return 'pdf';
  if (contentType.startsWith('image/') && contentType !== 'image/heic') return 'image';
  return 'other';
}

export function fileSize(bytes: number): string {
  if (bytes <= 0) return '';
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

// ── Registrar no balcão ─────────────────────────────────

export interface DeskDraft {
  enrollmentId: string;
  type: EnrollmentRequestType;
  startsOn: string;
  days: number | null;
  reason: string;
  comment: string;
}

/** Matrículas que aceitam pedido: pausa só mensal ativa; cancelamento ativa ou pausada. */
export function eligibleEnrollments(enrollments: Enrollment[], requests: EnrollmentRequest[], type: EnrollmentRequestType): Enrollment[] {
  return enrollments
    .filter((e) => (type === 'cancel' ? e.status === 'active' || e.status === 'paused' : e.status === 'active' && (e.contract?.planType ?? 'monthly') === 'monthly'))
    .filter((e) => {
      const open = openRequestFor(requests, e.id);
      return !open || (type === 'cancel' && open.status === 'active');
    })
    .sort((a, b) => a.studentName.localeCompare(b.studentName, 'pt-BR') || a.className.localeCompare(b.className, 'pt-BR'));
}

/** Validação do balcão (o servidor revalida datas e limites). */
export function deskDraftError(d: DeskDraft, p: CenterPolicies, today: string): string | null {
  if (!d.enrollmentId) return 'Escolha a matrícula.';
  if (d.type === 'cancel') {
    return CANCEL_REASONS[d.reason] ? null : 'Escolha o motivo do cancelamento.';
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.startsOn) || d.startsOn < today) return 'A pausa começa hoje ou depois.';
  if (d.days === null || !Number.isInteger(d.days) || d.days < 1) return 'Informe quantos dias de pausa.';
  if (d.days > 365) return 'A pausa pode ter no máximo 1 ano.';
  if (d.type === 'pause' && d.days < p.pauseMinDays) return `O trancamento mínimo é de ${p.pauseMinDays} dias.`;
  if (d.type === 'pause' && !d.reason.trim()) return 'Conte o motivo do trancamento.';
  return null;
}

export function requestErrorMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : '';
  const message = error instanceof Error ? error.message.trim() : '';
  if (message.toUpperCase() === 'NOT FOUND') return 'Pedidos indisponíveis no momento. Tente mais tarde.';
  if (code === 'functions/permission-denied') return message || 'Só owner ou admin do centro decide os pedidos.';
  if (code === 'functions/unavailable' || code === 'functions/deadline-exceeded') return 'Sem conexão. Tente de novo.';
  if (code === 'storage/unauthorized') return 'Sem permissão para abrir o atestado.';
  if (code === 'storage/object-not-found') return 'Arquivo do atestado não encontrado.';
  if (code === 'functions/internal' && (!message || message.toLowerCase() === 'internal')) return 'Não foi possível concluir. Tente de novo.';
  return message || 'Não foi possível concluir. Tente de novo.';
}
