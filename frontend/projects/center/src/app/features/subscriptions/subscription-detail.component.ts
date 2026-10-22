import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CenterContextService } from '../../core/center-context.service';
import { writeErrorMessage } from '../../data/actions/actor';
import { EnrollmentsActions } from '../../data/actions/enrollments.actions';
import { SubscriptionsActions, type ChargeNowResult } from '../../data/actions/subscriptions.actions';
import { CenterStore } from '../../data/center-store.service';
import { NOTICE_STAGE_LABEL, blockDate, dunningLadder } from '../../domain/billing';
import { addDays, daysBetween, formatDayKey, formatInstant, isValidDayKey, todayKey } from '../../domain/dates';
import { canTransition } from '../../domain/enrollment';
import { formatBRL } from '../../domain/money';
import { DEFAULT_BILLING, SUBSCRIPTION_METHOD, SUBSCRIPTION_STATUS } from '../../domain/models';
import { IconComponent } from '../../ui/icon.component';
import { BannerComponent, ModalComponent, PageHeaderComponent } from '../../ui/kit';
import { ChangePlanComponent } from './change-plan.component';
import { cycleLines, invoiceTitle, ladderView, nextCycleLine, oldestLate } from './subscription-view';

type Dialog = 'pause' | 'cancel' | 'charge' | 'plan' | 'undo';

/** R3 — Detalhe da assinatura: ciclos, régua, contrato e ações do gestor. */
@Component({
  selector: 'ct-subscription-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, BannerComponent, ModalComponent, IconComponent, RouterLink, ChangePlanComponent],
  templateUrl: './subscription-detail.component.html',
  styles: `
    .page { padding: 20px var(--ct-gutter) 26px; display: flex; flex-direction: column; gap: 16px; }
    .grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 360px; gap: 16px; align-items: start; }
    @media (max-width: 1280px) { .grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } .grid > :last-child { grid-column: 1 / -1; } }
    @media (max-width: 820px) { .grid { grid-template-columns: 1fr; } }
    .cy { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-top: 1px solid var(--nx-line); }
    .cy:first-of-type { border-top: none; }
    .cy-t { font-family: var(--nx-font-display); font-weight: 700; font-size: 13.5px; color: var(--nx-text); }
    .cy-d { margin-top: 2px; }
    .warn { color: var(--nx-pending); }
    .amt { font-family: var(--nx-font-mono); font-size: 12px; font-weight: 700; color: var(--nx-text); white-space: nowrap; }
    .ghost { margin-top: 6px; padding: 12px; border-radius: var(--nx-r-3); background: var(--nx-surface-1); border: 1px dashed var(--nx-line-strong); display: flex; align-items: center; gap: 12px; }
    .ghost .cy-t, .ghost .amt { color: var(--nx-text-mute); font-weight: 600; }
    .step { display: grid; grid-template-columns: 46px 14px 1fr; gap: 10px; }
    .step-d { font-family: var(--nx-font-mono); font-size: 10.5px; font-weight: 700; color: var(--nx-text-dim); padding-top: 2px; }
    .rail { display: flex; flex-direction: column; align-items: center; }
    .dot { width: 9px; height: 9px; border-radius: 50%; margin-top: 4px; background: var(--nx-surface-2); border: 1px solid var(--nx-line-strong); }
    .dot.yellow { background: var(--nx-pending); } .dot.red { background: var(--nx-live); } .dot.orange { background: var(--nx-orange-500); } .dot.dim { background: var(--nx-text-dim); }
    .dot.cur { box-shadow: 0 0 0 3px rgba(255,106,26,0.35); }
    .line { flex: 1; width: 1px; background: var(--nx-line-strong); margin-top: 3px; }
    .step-b { padding-bottom: 12px; }
    .step-t { font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; color: var(--nx-text-mute); }
    .step.on .step-t { color: var(--nx-text); }
    .pay { display: flex; align-items: center; gap: 12px; }
    .pix { width: 46px; height: 32px; border-radius: 6px; background: var(--nx-surface-2); border: 1px solid var(--nx-line-strong); display: grid; place-items: center; font-family: var(--nx-font-mono); font-size: 9px; font-weight: 700; color: var(--nx-text); }
    .link { color: var(--nx-orange-400); font-family: var(--nx-font-mono); font-size: 11px; word-break: break-all; }
    .inline-link { color: var(--nx-orange-400); font-size: 11px; font-family: var(--nx-font-display); font-weight: 600; text-decoration: none; white-space: nowrap; }
  `,
})
export class SubscriptionDetailComponent {
  readonly centerId = input('');
  readonly subscriptionId = input('');

  protected readonly ctx = inject(CenterContextService);
  protected readonly store = inject(CenterStore);
  private readonly subsActions = inject(SubscriptionsActions);
  private readonly enrActions = inject(EnrollmentsActions);

  protected readonly STATUS = SUBSCRIPTION_STATUS;
  protected readonly METHOD = SUBSCRIPTION_METHOD;
  protected readonly STAGE = NOTICE_STAGE_LABEL;
  protected readonly formatBRL = formatBRL;
  protected readonly formatDayKey = formatDayKey;
  protected readonly invoiceTitle = invoiceTitle;

  protected readonly cid = computed(() => this.centerId() || this.ctx.activeCenterId() || '');
  protected readonly tz = computed(() => this.ctx.center()?.timezone);
  protected readonly today = computed(() => todayKey(this.tz()));
  protected readonly billing = computed(() => this.ctx.center()?.billing ?? DEFAULT_BILLING);
  protected readonly policies = computed(() => this.ctx.center()?.policies ?? null);

  protected readonly sub = computed(() => this.store.subscriptions().find((s) => s.id === this.subscriptionId()) ?? null);
  protected readonly enrollment = computed(() => {
    const s = this.sub();
    return s ? (this.store.enrollments().find((e) => e.id === s.enrollmentId) ?? null) : null;
  });

  protected readonly cycles = computed(() => {
    const s = this.sub();
    return s ? cycleLines(s, this.store.invoices(), this.today()) : [];
  });
  protected readonly nextLine = computed(() => {
    const s = this.sub();
    return s ? nextCycleLine(s) : null;
  });
  protected readonly ladder = computed(() => {
    const s = this.sub();
    return s ? ladderView(dunningLadder(this.billing()), s, this.today()) : [];
  });
  protected readonly notices = computed(() =>
    [...(this.sub()?.notices ?? [])]
      .sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0))
      .map((n) => ({ ...n, when: formatInstant(n.at, this.tz()), stageLabel: NOTICE_STAGE_LABEL[n.stage] ?? 'Aviso' })),
  );

  /** Banner de atraso: cobrança mais antiga, dias e bloqueio. */
  protected readonly late = computed(() => {
    const s = this.sub();
    if (!s || s.status !== 'past_due') {
      return null;
    }
    const inv = oldestLate(s, this.store.invoices(), this.today());
    const since = s.overdueSince ?? inv?.dueDate ?? null;
    const days = since ? daysBetween(since, this.today()) : 0;
    return {
      inv,
      days,
      title: inv ? invoiceTitle(inv) : 'Mensalidade',
      block: blockDate(this.billing(), since),
      blocked: s.checkinBlocked,
    };
  });

  /** Só gestor e centro não suspenso mexem na assinatura. */
  protected readonly canAct = computed(() => this.ctx.isManager() && this.ctx.canWrite());
  protected readonly live = computed(() => ['active', 'past_due'].includes(this.sub()?.status ?? ''));
  protected readonly canPause = computed(() => {
    const e = this.enrollment();
    return this.live() && !!this.policies()?.allowPause && !!e && canTransition(e.status, 'paused');
  });
  protected readonly immediateCancel = computed(() => this.policies()?.monthlyCancellation === 'immediate');

  protected readonly dialog = signal<Dialog | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly pauseUntil = signal('');
  protected readonly reason = signal('');
  protected readonly chargeResult = signal<ChargeNowResult | null>(null);
  protected readonly copied = signal(false);

  protected readonly pauseValid = computed(() => {
    const d = this.pauseUntil();
    return isValidDayKey(d) && d > this.today() && this.reason().trim().length >= 3;
  });
  protected readonly cancelValid = computed(() => !this.immediateCancel() || this.reason().trim().length >= 3);

  constructor() {
    // Trocar de assinatura fecha o que estiver aberto.
    effect(() => {
      this.subscriptionId();
      this.dialog.set(null);
      this.chargeResult.set(null);
    });
  }

  open(d: Dialog): void {
    this.dialog.set(d);
    this.error.set('');
    this.reason.set('');
    this.copied.set(false);
    this.pauseUntil.set(addDays(this.today(), 14));
    if (d === 'charge') {
      this.chargeResult.set(null);
    }
  }

  close(): void {
    if (!this.busy()) {
      this.dialog.set(null);
    }
  }

  val(ev: Event): string {
    return (ev.target as HTMLInputElement).value;
  }

  async pause(): Promise<void> {
    const e = this.enrollment();
    if (!e || !this.pauseValid()) {
      return;
    }
    await this.run(() => this.enrActions.pause(e, this.pauseUntil(), this.reason().trim()));
  }

  async cancel(): Promise<void> {
    const s = this.sub();
    if (!s || !this.cancelValid()) {
      return;
    }
    if (this.immediateCancel()) {
      const e = this.enrollment();
      if (!e) {
        this.error.set('Matrícula não encontrada.');
        return;
      }
      await this.run(() => this.enrActions.transition(e, 'cancelled', this.reason().trim()));
    } else {
      await this.run(() => this.subsActions.cancelAtCycleEnd(s));
    }
  }

  async undoCancel(): Promise<void> {
    const s = this.sub();
    if (s) {
      await this.run(() => this.subsActions.undoCancel(s));
    }
  }

  async chargeNow(): Promise<void> {
    const s = this.sub();
    if (!s || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      this.chargeResult.set(await this.subsActions.chargeNow(s));
    } catch (err) {
      this.error.set(writeErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }

  async copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.copied.set(true);
    } catch {
      this.error.set('Não foi possível copiar. Selecione o link e copie à mão.');
    }
  }

  private async run(fn: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await fn();
      this.dialog.set(null);
    } catch (err) {
      this.error.set(writeErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}
