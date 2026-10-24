import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { CenterContextService } from '../../core/center-context.service';
import { CenterStore } from '../../data/center-store.service';
import { RequestsActions, type RequestDecision } from '../../data/actions/requests.actions';
import { addDays, formatDayKey, formatInstant, todayKey, wallClock } from '../../domain/dates';
import { formatBRL } from '../../domain/money';
import { CANCEL_REASONS, DEFAULT_POLICIES, type Enrollment, type EnrollmentRequest } from '../../domain/models';
import { IconComponent } from '../../ui/icon.component';
import { BannerComponent, ModalComponent, PageHeaderComponent, PersonComponent } from '../../ui/kit';
import { whatsAppLink } from '../trials/trial-view';
import {
  REQUEST_TYPE,
  canAskDocument,
  canDecide,
  canUndo,
  cancelTimeline,
  certificateKind,
  fileSize,
  pauseBanners,
  pauseDaysUsed,
  pauseEffects,
  requestErrorMessage,
  requestPeriod,
  requestReason,
  requestSituation,
  retentionRows,
  waitlistFor,
} from './request-view';

interface DecisionCopy {
  title: string;
  text: string;
  confirm: string;
  needsNote: boolean;
  placeholder: string;
}

const DECISIONS: Record<RequestDecision, DecisionCopy> = {
  approve: {
    title: 'Aprovar pausa',
    text: 'A matrícula pausa no período pedido (ou a partir de hoje, se a data já passou), a cobrança dos ciclos que vencem na pausa fica suspensa e a vaga continua reservada. O aluno recebe o aviso no app.',
    confirm: 'Aprovar pausa',
    needsNote: false,
    placeholder: 'Recado ao aluno (opcional)',
  },
  reject: {
    title: 'Recusar pedido',
    text: 'A matrícula segue normal e o aluno recebe o motivo no app.',
    confirm: 'Recusar',
    needsNote: true,
    placeholder: 'Motivo da recusa (vai para o aluno)',
  },
  needs_document: {
    title: 'Pedir outro documento',
    text: 'O pedido fica aguardando: o aluno reenvia o atestado pelo app e ele volta para revisão.',
    confirm: 'Pedir documento',
    needsNote: true,
    placeholder: 'O que falta no atestado (vai para o aluno)',
  },
  undo: {
    title: 'Desfazer pedido',
    text: '',
    confirm: 'Desfazer',
    needsNote: false,
    placeholder: 'Motivo (opcional, vai para o aluno)',
  },
};

/** T2/T3 — detalhe de um pedido: pausa por lesão (atestado), trancamento ou cancelamento. */
@Component({
  selector: 'ct-request-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PageHeaderComponent, PersonComponent, BannerComponent, ModalComponent, IconComponent],
  templateUrl: './request-detail.component.html',
  styles: `
    .page { padding: 20px var(--ct-gutter) 26px; display: flex; flex-direction: column; gap: 16px; }
    .cols { display: grid; grid-template-columns: minmax(0, 1fr) 420px; gap: 16px; align-items: start; }
    .cols3 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 380px; gap: 16px; align-items: start; }
    @media (max-width: 1280px) { .cols3 { grid-template-columns: 1fr 1fr; } .cols3 > :last-child { grid-column: 1 / -1; } }
    @media (max-width: 1100px) { .cols, .cols3 { grid-template-columns: 1fr; } }
    .side { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .preview { margin-top: 4px; min-height: 420px; border-radius: var(--nx-r-3); border: 1px solid var(--nx-line-strong); overflow: hidden; display: grid; place-items: center;
      background: repeating-linear-gradient(135deg, var(--nx-surface-1) 0 12px, var(--nx-surface-0) 12px 24px); }
    .preview img { max-width: 100%; max-height: 70vh; display: block; object-fit: contain; }
    .preview iframe { width: 100%; height: 70vh; border: 0; background: #fff; }
    .preview .ph { text-align: center; padding: 24px; color: var(--nx-text-dim); }
    .bar { display: flex; gap: 8px; align-items: center; margin-top: 12px; flex-wrap: wrap; }
    a.ct-mini-btn, a.ct-ghost-btn { text-decoration: none; }
    .offer { display: flex; align-items: center; gap: 12px; padding: 9px 0; border-top: 1px solid var(--nx-line); font-size: 12.5px; color: var(--nx-text); }
    .offer:first-of-type { border-top: 0; }
    .timeline { display: flex; align-items: flex-start; margin: 14px 0 18px; }
    .step { text-align: center; flex: none; max-width: 110px; }
    .dot { width: 12px; height: 12px; border-radius: 6px; margin: 0 auto; background: var(--nx-orange-500); }
    .dot.last { background: var(--nx-live); }
    .link { flex: 1; height: 2px; background: var(--nx-line-strong); margin-top: 5px; }
    .step .d { font-family: var(--nx-font-display); font-weight: 700; font-size: 12.5px; margin-top: 8px; color: var(--nx-text); }
    .step .l { font-size: 11px; color: var(--nx-text-dim); }
    .queue { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-top: 1px solid var(--nx-line); }
    .queue:first-of-type { border-top: 0; }
    .pos { font-family: var(--nx-font-mono); font-size: 11px; font-weight: 700; color: var(--nx-text-mute); width: 22px; }
    .note { font-size: 11.5px; color: var(--nx-text-dim); line-height: 1.45; margin-top: 10px; }
    .kick-gap { margin: 16px 0 8px; }
    .decided { font-size: 12.5px; color: var(--nx-text-mute); }
  `,
})
export class RequestDetailComponent {
  readonly centerId = input.required<string>();
  readonly requestId = input.required<string>();

  protected readonly ctx = inject(CenterContextService);
  protected readonly store = inject(CenterStore);
  private readonly actions = inject(RequestsActions);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly TYPE = REQUEST_TYPE;
  protected readonly DECISIONS = DECISIONS;
  protected readonly formatDayKey = formatDayKey;
  protected readonly formatBRL = formatBRL;
  protected readonly fileSize = fileSize;

  private readonly tz = computed(() => this.ctx.center()?.timezone ?? 'America/Sao_Paulo');
  protected readonly today = computed(() => todayKey(this.tz()));
  protected readonly policies = computed(() => this.ctx.center()?.policies ?? DEFAULT_POLICIES);
  protected readonly request = computed(() => this.store.requests().find((r) => r.id === this.requestId()) ?? null);
  protected readonly student = computed(() => {
    const r = this.request();
    return r ? (this.store.studentById(r.studentId) ?? null) : null;
  });

  /** Decidir é só de owner/admin (callable); recepção vê sem ações. */
  protected readonly canAct = computed(() => this.ctx.isManager() && this.ctx.canWrite());
  protected readonly decidable = computed(() => {
    const r = this.request();
    return !!r && this.canAct() && canDecide(r);
  });
  protected readonly askDocument = computed(() => {
    const r = this.request();
    return !!r && this.canAct() && canAskDocument(r);
  });
  protected readonly undoable = computed(() => {
    const r = this.request();
    return !!r && this.canAct() && canUndo(r, this.today());
  });

  protected readonly title = computed(() => {
    const r = this.request();
    return r ? `${r.studentName} · ${REQUEST_TYPE[r.type][0].toLowerCase()}` : 'Pedido';
  });
  protected readonly subtitle = computed(() => {
    const r = this.request();
    if (!r) return '';
    const origin = r.source === 'desk' ? `Registrado no balcão${r.createdByName ? ' por ' + r.createdByName : ''}` : 'Pedido pelo app';
    return [`${origin} em ${formatInstant(r.createdAt, this.tz())}`, r.className, r.planName].filter(Boolean).join(' · ');
  });
  protected readonly situation = computed(() => {
    const r = this.request();
    return r ? requestSituation(r) : null;
  });
  protected readonly reason = computed(() => {
    const r = this.request();
    return r ? requestReason(r) : '';
  });
  protected readonly period = computed(() => {
    const r = this.request();
    return r ? requestPeriod(r) : '';
  });
  protected readonly decidedLine = computed(() => {
    const r = this.request();
    if (!r || !r.decidedAt || r.status === 'pending') return '';
    const who = r.decidedByName ? ` por ${r.decidedByName}` : '';
    return `${requestSituation(r).label} · ${formatInstant(r.decidedAt, this.tz())}${who}`;
  });

  // ── Pausa ──
  protected readonly effects = computed(() => {
    const r = this.request();
    return r ? pauseEffects(r) : [];
  });
  protected readonly banners = computed(() => {
    const r = this.request();
    if (!r || r.type === 'cancel') return [];
    const p = this.policies();
    const year = (r.startsOn || this.today()).slice(0, 4);
    return pauseBanners(r, p, pauseDaysUsed(this.store.requests(), r.enrollmentId, year, r.type === 'injury' ? p.injuryCountsInLimit : true, r.id));
  });

  // ── Atestado (Storage; só owner/admin leem) ──
  protected readonly certUrl = signal<string | null>(null);
  protected readonly certError = signal('');
  protected readonly certKind = computed(() => certificateKind(this.request()?.certificate?.contentType ?? ''));
  protected readonly certFrame = computed<SafeResourceUrl | null>(() => {
    const url = this.certUrl();
    return url && this.certKind() === 'pdf' ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
  });
  private readonly certPath = computed(() => (this.ctx.isManager() ? (this.request()?.certificate?.path ?? '') : ''));

  // ── Cancelamento ──
  protected readonly timeline = computed(() => {
    const r = this.request();
    return r ? cancelTimeline(r, this.tz()) : [];
  });
  protected readonly cancelReason = computed(() => {
    const r = this.request();
    return r ? (CANCEL_REASONS[r.reason] ?? r.reason) : '';
  });
  protected readonly offers = computed(() => {
    const r = this.request();
    return r ? retentionRows(r) : [];
  });
  protected readonly queue = computed(() => {
    const r = this.request();
    return r ? waitlistFor(this.store.enrollments(), r.classId) : [];
  });
  /** Dia em que a vaga volta para a turma (a rodada diária encerra depois do último dia). */
  protected readonly seatDay = computed(() => {
    const r = this.request();
    return r?.lastDay ? addDays(r.lastDay, 1) : '';
  });

  // ── Contato ──
  protected readonly phone = computed(() => {
    const s = this.student();
    if (!s) return '';
    return (s.isMinor && s.guardian?.phone ? s.guardian.phone : s.phone) || '';
  });
  protected readonly telLink = computed(() => {
    const digits = this.phone().replace(/[^\d+]/g, '');
    return digits.length >= 10 ? `tel:${digits}` : null;
  });
  protected readonly whatsApp = computed(() => {
    const r = this.request();
    if (!r) return null;
    const center = this.ctx.center()?.name ?? 'o centro';
    const first = this.student()?.isMinor ? (this.student()?.guardian?.name.split(' ')[0] ?? '') : r.studentName.split(' ')[0];
    return whatsAppLink(this.phone(), `Olá${first ? ', ' + first : ''}! Aqui é ${center}, sobre o pedido de ${REQUEST_TYPE[r.type][0].toLowerCase()} de ${r.studentName} (${r.className}).`);
  });

  // ── Decisão ──
  protected readonly deciding = signal<RequestDecision | null>(null);
  protected readonly note = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected readonly undoText = computed(() => {
    const r = this.request();
    if (!r) return '';
    return r.type === 'cancel'
      ? 'A assinatura volta a ficar ativa e o próximo vencimento é cobrado normalmente. O aluno segue na turma e recebe o aviso no app.'
      : 'A pausa agendada é cancelada e a matrícula segue ativa. O aluno recebe o aviso no app.';
  });

  constructor() {
    effect((onCleanup) => {
      const path = this.certPath();
      this.certUrl.set(null);
      this.certError.set('');
      if (!path) return;
      let alive = true;
      onCleanup(() => (alive = false));
      this.actions.certificateUrl(path).then(
        (url) => alive && this.certUrl.set(url),
        (e) => alive && this.certError.set(requestErrorMessage(e)),
      );
    });
  }

  protected waitingSince(e: Enrollment): string {
    return e.waitlistedAt ? `Esperando desde ${formatDayKey(wallClock(e.waitlistedAt, this.tz()).dayKey)}` : 'Na fila';
  }

  protected val(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected open(decision: RequestDecision): void {
    this.deciding.set(decision);
    this.note.set('');
    this.error.set('');
  }

  protected close(): void {
    if (!this.busy()) this.deciding.set(null);
  }

  protected async confirm(r: EnrollmentRequest): Promise<void> {
    const decision = this.deciding();
    if (!decision || this.busy()) return;
    const note = this.note().trim();
    if (DECISIONS[decision].needsNote && !note) {
      this.error.set('Escreva para o aluno o motivo.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      await this.actions.decide(r.id, decision, note);
      this.deciding.set(null);
    } catch (e) {
      this.error.set(requestErrorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
