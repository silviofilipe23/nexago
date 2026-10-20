import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import type { Unsubscribe } from 'firebase/firestore';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { arenaFunctions } from '../data/functions';
import { AvatarComponent } from '../ui/avatar.component';
import { IconComponent } from '../ui/icon.component';
import { ModalComponent } from '../ui/modal.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PillComponent } from '../ui/pill.component';
import { AulaStatComponent, AulasPageComponent } from './aulas-ui';
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
  PAY_STATE_LABEL,
  PAY_STATE_TONE,
  brl,
  chargeState,
  daysLate,
  enrollmentClassNames,
  formatPhoneBR,
  slotsLabel,
  studentPayState,
  chargeInvoiceUrl,
  chargeVoidsInvoice,
  onlineChargeLabel,
  whatsappChargeLink,
  whatsappLink,
  type Charge,
  type Enrollment,
  type MakeupCredit,
  type PaymentMethod,
} from './billing.model';
import { fetchStudentCredits, setChargeStatus, setEnrollmentStatus, watchEnrollment, watchStudentCharges } from './billing-repository';
import {
  addDaysKey,
  isoWeekdayOf,
  shortDate,
  todayKeyLocal,
  weekdayDateLabel,
  type AttendanceMark,
  type ClassSession,
} from './class.model';
import { fetchSessionsBetween } from './classes-repository';

export interface AttendanceCell {
  date: string;
  mark: AttendanceMark | null;
}

/** Aulas do aluno nas últimas semanas (turmas e dias da matrícula), da mais antiga à mais nova. */
export function studentAttendance(sessions: readonly ClassSession[], e: Pick<Enrollment, 'studentId' | 'slots'>, todayKey: string): AttendanceCell[] {
  const slots = new Set(e.slots.map((s) => `${s.classId}:${s.weekday}`));
  return sessions
    .filter((s) => s.date <= todayKey && s.status !== 'canceled' && slots.has(`${s.classId}:${isoWeekdayOf(s.date)}`))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => ({ date: s.date, mark: s.attendance[e.studentId]?.mark ?? null }));
}

const MARK_COLOR: Record<string, string> = {
  present: 'var(--nx-win)',
  absent: 'var(--nx-live)',
  excused: 'var(--nx-pending)',
  none: 'var(--nx-surface-2)',
};

type Confirm = 'pause' | 'resume' | 'cancel';

/** 08 · Aluno — plano, horários, créditos, frequência e mensalidades (baixa manual). */
@Component({
  selector: 'ar-panel-aula-student-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AulasPageComponent, PanelCardComponent, PillComponent, IconComponent, AvatarComponent, ModalComponent, AulaStatComponent],
  styleUrl: './aulas-form.scss',
  template: `
    <ar-aulas-page [title]="enrollment()?.name ?? 'Aluno'" [subtitle]="subtitle()">
      <div page-actions style="display: flex; gap: 8px; flex-wrap: wrap">
        <button type="button" class="ar-mini-btn" (click)="go(['/painel/aulas/alunos'])">
          <ar-icon name="chevron-left" [size]="14" />
          Alunos
        </button>
        @if (whatsapp(); as link) {
          <a class="ar-mini-btn" [href]="link" target="_blank" rel="noopener">
            <ar-icon name="mail" [size]="14" />
            WhatsApp
          </a>
        }
      </div>

      @if (missing()) {
        <p class="state-text">Matrícula não encontrada.</p>
      } @else if (enrollment(); as e) {
        @if (error(); as err) {
          <div class="error-banner">{{ err }}</div>
        }
        <div class="layout">
          <div class="col">
            <ar-panel-card>
              <div class="profile">
                <ar-avatar class="big" [name]="e.name" [photoUrl]="e.photoUrl" [size]="52" zoomable personRole="Aluno" [meta]="e.plan.name" />
                <div>
                  <div class="p-name">{{ e.name }}</div>
                  <div class="sub">{{ e.phone ? phoneLabel(e.phone) : 'Sem telefone' }}</div>
                </div>
              </div>
              <div class="pills">
                <ar-pill [tone]="stateTone()">{{ stateLabel() }}</ar-pill>
                <ar-pill tone="dim">{{ e.athleteId ? 'Conta NexaGO' : 'Sem conta NexaGO' }}</ar-pill>
              </div>
            </ar-panel-card>

            <ar-panel-card title="Plano atual">
              <div class="plan-name">{{ e.plan.name }}</div>
              @if (e.plan.kind === 'package') {
                <div class="plan-price">{{ e.creditsLeft ?? 0 }}<span> de {{ e.plan.credits }} aulas</span></div>
              } @else {
                <div class="plan-price">{{ brl(e.plan.priceReais) }}<span> /mês</span></div>
              }
              <div class="facts">
                @if (e.plan.kind === 'package') {
                  <div><span>Validade</span><strong>{{ e.expiresOn ? shortDate(e.expiresOn) : '—' }}</strong></div>
                } @else {
                  <div><span>Próx. cobrança</span><strong>{{ nextChargeLabel() }}</strong></div>
                  <div><span>Vencimento</span><strong>todo dia {{ e.dueDay }}</strong></div>
                }
                @if (e.billingMode === 'asaas') {
                  <div><span>Cobrança</span><strong>Online (PIX ou cartão)</strong></div>
                  @if (e.cpfMasked) {
                    <div><span>CPF do pagador</span><strong class="mono-v">{{ e.cpfMasked }}</strong></div>
                  }
                } @else {
                  <div><span>Forma</span><strong>{{ methodLabel[e.paymentMethod] }}</strong></div>
                }
                <div><span>Horários fixos</span><strong>{{ slots(e) }}</strong></div>
                <div><span>Turma</span><strong>{{ classNames(e) }}</strong></div>
              </div>
              @if (e.status === 'active' || e.status === 'paused') {
                <div class="plan-actions">
                  <button type="button" class="ar-mini-btn" [disabled]="readOnly()" (click)="confirm.set(e.status === 'paused' ? 'resume' : 'pause')">
                    {{ e.status === 'paused' ? 'Reativar' : 'Pausar (férias)' }}
                  </button>
                  <button type="button" class="ar-ghost-btn danger" [disabled]="readOnly()" (click)="confirm.set('cancel')">Cancelar plano</button>
                </div>
              }
            </ar-panel-card>

            <ar-panel-card title="Créditos de reposição" [kicker]="availableCredits().length + ' disponível(is)'">
              @for (c of availableCredits(); track c.id) {
                <div class="credit">
                  <span class="credit-n">1</span>
                  <div>
                    <div class="c-title">{{ c.reason === 'excused' ? 'Falta justificada' : 'Aula cancelada pela arena' }} · {{ weekdayDate(c.sourceDate) }}</div>
                    <div class="sub">Expira em {{ shortDate(c.expiresOn) }}</div>
                  </div>
                </div>
              } @empty {
                <p class="hint first">Sem crédito agora. Falta justificada e aula cancelada pela arena geram crédito para repor em outra aula.</p>
              }
              @if (availableCredits().length > 0) {
                <p class="hint">Use o crédito pelo botão "Encaixar" na chamada de uma aula com vaga.</p>
              }
            </ar-panel-card>
          </div>

          <div class="col">
            <div class="stats">
              <ar-aula-stat label="Frequência · 8 sem." [value]="frequency() == null ? '—' : frequency() + '%'" [sub]="presentCount() + ' de ' + markedCount() + ' aulas'" />
              <ar-aula-stat label="Aulas no período" [value]="'' + attendance().length" sub="últimas 8 semanas" />
              <ar-aula-stat label="Total pago" [value]="brl(totalPaid())" tone="green" [sub]="paidCount() + ' pagamento(s)'" />
            </div>

            <ar-panel-card title="Frequência" kicker="Últimas 8 semanas">
              <div class="legend">
                <span><i style="background: var(--nx-win)"></i>Presente</span>
                <span><i style="background: var(--nx-pending)"></i>Justificada</span>
                <span><i style="background: var(--nx-live)"></i>Falta</span>
                <span><i style="background: var(--nx-surface-2)"></i>Sem chamada</span>
              </div>
              @if (attendance().length > 0) {
                <div class="cells">
                  @for (a of attendance(); track a.date) {
                    <div class="cell" [title]="weekdayDate(a.date)">
                      <div class="bar" [style.background]="markColor(a.mark)"></div>
                      <span>{{ shortDate(a.date) }}</span>
                    </div>
                  }
                </div>
              } @else {
                <p class="hint first">Nenhuma aula nas últimas 8 semanas.</p>
              }
            </ar-panel-card>

            <ar-panel-card title="Mensalidades e pagamentos">
              @for (c of charges(); track c.id) {
                <div class="pay-row" [class.off]="c.status === 'canceled'">
                  <div class="pay-desc">
                    <div class="c-title">{{ c.description }}</div>
                    <div class="sub">
                      Vence {{ shortDate(c.dueDate) }}
                      @if (c.status === 'paid') {
                        · pago {{ shortDate(c.paidOn ?? c.dueDate) }}
                        @if (c.paidVia !== 'asaas') {
                          ({{ methodLabel[c.paymentMethod] }})
                        }
                      }
                      @if (onlineLabel(c); as ol) {
                        · <span class="online">{{ ol }}</span>
                      }
                    </div>
                  </div>
                  <span class="mono">{{ brl(c.amountReais) }}</span>
                  <ar-pill [tone]="chargeTone(c)">{{ chargeLabel(c) }}</ar-pill>
                  <div class="pay-actions">
                    @if (c.status === 'open') {
                      @if (invoiceUrl(c); as url) {
                        <button type="button" class="ar-ghost-btn small" (click)="copyLink(url)">{{ copied() === url ? 'Copiado ✓' : 'Copiar link' }}</button>
                      }
                      @if (chargeLink(c); as link) {
                        <a class="ar-ghost-btn small" [href]="link" target="_blank" rel="noopener">Cobrar</a>
                      }
                      <button type="button" class="ar-mini-btn small" [disabled]="readOnly()" (click)="openPay(c)">Registrar pagamento</button>
                      <button type="button" class="ar-ghost-btn small danger" [disabled]="readOnly()" (click)="canceling.set(c)">Cancelar</button>
                    } @else if (c.status === 'paid' && c.paidVia !== 'asaas') {
                      <button type="button" class="ar-ghost-btn small" [disabled]="readOnly() || busy()" (click)="reopen(c)">Desfazer</button>
                    }
                  </div>
                </div>
              } @empty {
                <p class="hint first">Nenhuma cobrança ainda.</p>
              }
            </ar-panel-card>
          </div>
        </div>
      } @else {
        <p class="state-text">Carregando aluno…</p>
      }
    </ar-aulas-page>

    @if (paying(); as c) {
      <ar-modal (close)="paying.set(null)">
        <p class="modal-title">Registrar pagamento</p>
        <p class="modal-sub">{{ c.description }} · {{ brl(c.amountReais) }}</p>
        @if (c.billingMode === 'asaas' && c.asaas?.state === 'open') {
          <p class="hint first">Esta mensalidade tem fatura online: registrar o pagamento aqui cancela o link enviado ao aluno.</p>
        }
        <div class="field-label">Forma</div>
        <div class="chip-row">
          @for (m of methods; track m) {
            <button type="button" class="ar-chip" [class.active]="payMethod() === m" (click)="payMethod.set(m)">{{ methodLabel[m] }}</button>
          }
        </div>
        <div class="field-label spaced">Data do pagamento</div>
        <input class="input-box" type="date" [max]="today" [value]="payDate()" (input)="payDate.set($any($event.target).value)" />
        <p class="hint">O valor foi recebido direto pela arena — a plataforma só registra a baixa.</p>
        <div class="modal-actions">
          <button type="button" class="ar-mini-btn" [disabled]="busy()" (click)="paying.set(null)">Cancelar</button>
          <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="busy() || !payDate()" (click)="pay(c)">{{ busy() ? 'Salvando…' : 'Confirmar pagamento' }}</button>
        </div>
      </ar-modal>
    }

    @if (canceling(); as c) {
      <ar-modal (close)="canceling.set(null)">
        <p class="modal-title">Cancelar mensalidade?</p>
        <p class="modal-sub">{{ c.description }} · {{ brl(c.amountReais) }}</p>
        @if (voidsInvoice(c)) {
          <p class="hint first">A fatura online também é cancelada no Asaas e o link enviado ao aluno deixa de valer. Se ela cobria outras mensalidades, o aluno recebe um link novo só com elas.</p>
        }
        <p class="hint">A mensalidade sai do que o aluno deve e não volta a ser cobrada.</p>
        <div class="modal-actions">
          <button type="button" class="ar-mini-btn" [disabled]="busy()" (click)="canceling.set(null)">Voltar</button>
          <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="busy()" (click)="cancelCharge(c)">{{ busy() ? 'Cancelando…' : 'Cancelar mensalidade' }}</button>
        </div>
      </ar-modal>
    }

    @if (confirm(); as k) {
      <ar-modal (close)="confirm.set(null)">
        <p class="modal-title">{{ k === 'pause' ? 'Pausar plano?' : k === 'resume' ? 'Reativar plano?' : 'Cancelar plano?' }}</p>
        <p class="modal-sub">
          @switch (k) {
            @case ('pause') { O aluno sai da chamada e não recebe novas mensalidades até reativar. A vaga fica livre. }
            @case ('resume') { O aluno volta para a chamada nos mesmos horários, se a vaga ainda existir. }
            @default { O aluno sai das turmas. Mensalidades que ainda não venceram são canceladas; as vencidas continuam em aberto. }
          }
        </p>
        <div class="modal-actions">
          <button type="button" class="ar-mini-btn" [disabled]="busy()" (click)="confirm.set(null)">Voltar</button>
          <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="busy()" (click)="applyStatus(k)">{{ busy() ? 'Aguarde…' : 'Confirmar' }}</button>
        </div>
      </ar-modal>
    }
  `,
  styles: `
    .state-text { font-size: 13.5px; color: var(--nx-text-mute); margin: 0; }
    .layout { display: grid; grid-template-columns: 340px minmax(0, 1fr); gap: 16px; align-items: start; }
    .col { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
    .profile { display: flex; align-items: center; gap: 14px; }
    ar-avatar.big { color: var(--nx-orange-500); background: var(--nx-orange-tint); border: 1px solid rgba(255, 106, 26, 0.4); }
    .p-name { font-family: var(--nx-font-display); font-weight: 700; font-size: 17px; color: var(--nx-text); }
    .sub { font-family: var(--nx-font-mono); font-size: 10.5px; color: var(--nx-text-dim); margin-top: 3px; }
    .pills { display: flex; gap: 6px; margin-top: 14px; flex-wrap: wrap; }
    .plan-name { font-family: var(--nx-font-display); font-weight: 700; font-size: 15px; color: var(--nx-text); }
    .plan-price { font-family: var(--nx-font-display); font-weight: 800; font-size: 24px; color: var(--nx-orange-500); margin-top: 6px; }
    .plan-price span { font-family: var(--nx-font-mono); font-size: 11px; font-weight: 500; color: var(--nx-text-dim); }
    .facts { display: flex; flex-direction: column; gap: 8px; margin-top: 14px; }
    .facts div { display: flex; justify-content: space-between; gap: 10px; font-size: 12.5px; }
    .facts span { color: var(--nx-text-dim); }
    .facts strong { font-family: var(--nx-font-display); font-weight: 600; color: var(--nx-text); text-align: right; }
    .plan-actions { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
    .danger { color: var(--nx-live); }
    .credit { display: flex; align-items: center; gap: 12px; padding: 10px 12px; margin-bottom: 8px; border-radius: var(--nx-r-3); background: rgba(43, 209, 126, 0.08); border: 1px solid rgba(43, 209, 126, 0.25); }
    .credit-n { font-family: var(--nx-font-display); font-weight: 800; font-size: 22px; color: var(--nx-win); }
    .c-title { font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; color: var(--nx-text); }
    .first { margin-top: 0; }
    .stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
    .legend { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; font-family: var(--nx-font-mono); font-size: 10px; color: var(--nx-text-dim); }
    .legend span { display: flex; align-items: center; gap: 5px; }
    .legend i { width: 8px; height: 8px; border-radius: 2px; display: inline-block; }
    .cells { display: grid; grid-template-columns: repeat(auto-fill, minmax(46px, 1fr)); gap: 8px; }
    .cell { display: flex; flex-direction: column; align-items: center; gap: 5px; }
    .bar { width: 100%; height: 22px; border-radius: 6px; }
    .cell span { font-family: var(--nx-font-mono); font-size: 9.5px; color: var(--nx-text-dim); }
    .pay-row { display: grid; grid-template-columns: minmax(0, 1fr) 90px 100px auto; gap: 12px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--nx-line); }
    .pay-row:last-child { border-bottom: none; }
    .pay-row.off { opacity: 0.5; }
    .mono { font-family: var(--nx-font-mono); font-size: 12px; font-weight: 700; color: var(--nx-text); text-align: right; }
    .pay-actions { display: flex; gap: 6px; justify-content: flex-end; flex-wrap: wrap; }
    .online { color: var(--nx-orange-500); }
    .mono-v { font-family: var(--nx-font-mono); font-size: 12px; }
    .small { height: 28px; font-size: 11.5px; text-decoration: none; display: inline-flex; align-items: center; }
    @media (max-width: 1180px) { .layout { grid-template-columns: minmax(0, 1fr); } }
    @media (max-width: 720px) {
      .stats { grid-template-columns: minmax(0, 1fr); }
      .pay-row { grid-template-columns: minmax(0, 1fr) auto; }
      .pay-actions { grid-column: 1 / -1; justify-content: flex-start; }
    }
  `,
})
export class PanelAulaStudentDetailComponent {
  private readonly arenaContext = inject(ArenaContextService);
  private readonly access = inject(ArenaAccessService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly today = todayKeyLocal();
  protected readonly brl = brl;
  protected readonly shortDate = shortDate;
  protected readonly weekdayDate = weekdayDateLabel;
  protected readonly methods = PAYMENT_METHODS;
  protected readonly methodLabel = PAYMENT_METHOD_LABEL;
  protected readonly readOnly = computed(() => !this.access.canWrite('agenda'));

  private readonly enrollmentId = this.route.snapshot.paramMap.get('enrollmentId') ?? '';
  protected readonly enrollment = signal<Enrollment | null>(null);
  protected readonly missing = signal(false);
  protected readonly charges = signal<Charge[]>([]);
  protected readonly credits = signal<MakeupCredit[]>([]);
  private readonly sessions = signal<ClassSession[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly paying = signal<Charge | null>(null);
  /** Mensalidade no modal "Cancelar mensalidade?". */
  protected readonly canceling = signal<Charge | null>(null);
  protected readonly payMethod = signal<PaymentMethod>('pix');
  protected readonly payDate = signal(this.today);
  protected readonly confirm = signal<Confirm | null>(null);
  protected readonly copied = signal<string | null>(null);

  protected readonly availableCredits = computed(() => this.credits().filter((c) => c.status === 'available'));
  protected readonly attendance = computed(() => {
    const e = this.enrollment();
    return e ? studentAttendance(this.sessions(), e, this.today) : [];
  });
  protected readonly markedCount = computed(() => this.attendance().filter((a) => a.mark != null).length);
  protected readonly presentCount = computed(() => this.attendance().filter((a) => a.mark === 'present').length);
  protected readonly frequency = computed(() =>
    this.markedCount() > 0 ? Math.round((this.presentCount() / this.markedCount()) * 100) : null,
  );
  private readonly paid = computed(() => this.charges().filter((c) => c.status === 'paid'));
  protected readonly totalPaid = computed(() => Math.round(this.paid().reduce((s, c) => s + c.amountReais, 0) * 100) / 100);
  protected readonly paidCount = computed(() => this.paid().length);
  private readonly openOfEnrollment = computed(() =>
    this.charges().filter((c) => c.status === 'open' && c.enrollmentId === this.enrollmentId),
  );
  private readonly payState = computed(() => {
    const e = this.enrollment();
    return e ? studentPayState(e, this.openOfEnrollment(), this.today) : 'ok';
  });
  protected readonly subtitle = computed(() => {
    const e = this.enrollment();
    if (!e) return '';
    const since = e.startDate ? `Aluno desde ${shortDate(e.startDate)}/${e.startDate.slice(0, 4)}` : 'Aluno';
    return `${since} · ${enrollmentClassNames(e.slots)}`;
  });
  protected readonly whatsapp = computed(() => {
    const e = this.enrollment();
    return e ? whatsappLink(e.phone, `Olá, ${e.name.split(' ')[0]}! Aqui é da ${this.arenaContext.arenaName() ?? 'arena'}.`) : null;
  });
  protected readonly nextChargeLabel = computed(() => {
    const next = [...this.openOfEnrollment()].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
    return next ? `${shortDate(next.dueDate)} · ${brl(next.amountReais)}` : 'Gerada 10 dias antes do vencimento';
  });

  private unsubs: Unsubscribe[] = [];
  private chargesFor: string | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.unsubs.forEach((u) => u()));
    if (!this.enrollmentId) this.missing.set(true);
    else {
      this.unsubs.push(
        watchEnrollment(arenaFirestore(), this.enrollmentId, (e) => {
          if (!e) this.missing.set(true);
          this.enrollment.set(e);
        }),
      );
    }
    effect(() => {
      const e = this.enrollment();
      const arenaId = this.arenaContext.arenaId();
      if (!e || !arenaId || this.chargesFor === e.studentId) return;
      this.chargesFor = e.studentId;
      const db = arenaFirestore();
      this.unsubs.push(watchStudentCharges(db, arenaId, e.studentId, (list) => this.charges.set(list)));
      void this.loadExtras(arenaId, e.studentId);
    });
  }

  private async loadExtras(arenaId: string, studentId: string): Promise<void> {
    try {
      const db = arenaFirestore();
      const [credits, sessions] = await Promise.all([
        fetchStudentCredits(db, arenaId, studentId),
        fetchSessionsBetween(db, arenaId, addDaysKey(this.today, -56), this.today),
      ]);
      this.credits.set(credits);
      this.sessions.set(sessions);
    } catch {
      this.error.set('Não foi possível carregar créditos e frequência.');
    }
  }

  protected phoneLabel(phone: string): string {
    return formatPhoneBR(phone);
  }

  protected slots(e: Enrollment): string {
    return slotsLabel(e.slots);
  }

  protected classNames(e: Enrollment): string {
    return enrollmentClassNames(e.slots);
  }

  protected stateLabel(): string {
    const s = this.enrollment()?.status;
    if (s === 'canceled') return 'Cancelado';
    if (s === 'ended') return 'Encerrado';
    return PAY_STATE_LABEL[this.payState()];
  }

  protected stateTone(): 'green' | 'yellow' | 'red' | 'dim' {
    const s = this.enrollment()?.status;
    return s === 'canceled' || s === 'ended' ? 'dim' : PAY_STATE_TONE[this.payState()];
  }

  protected chargeLabel(c: Charge): string {
    const state = chargeState(c, this.today);
    if (state === 'paid') return 'Pago';
    if (state === 'canceled') return 'Cancelado';
    if (state === 'overdue') return `${daysLate(c.dueDate, this.today)}d atraso`;
    if (state === 'due_today') return 'Vence hoje';
    return 'Em aberto';
  }

  protected chargeTone(c: Charge): 'green' | 'yellow' | 'red' | 'dim' | 'orange' {
    const state = chargeState(c, this.today);
    return state === 'paid' ? 'green' : state === 'overdue' ? 'red' : state === 'due_today' ? 'yellow' : state === 'canceled' ? 'dim' : 'orange';
  }

  protected chargeLink(c: Charge): string | null {
    return whatsappChargeLink(c.phone ?? this.enrollment()?.phone ?? null, c.name, c, this.arenaContext.arenaName() ?? 'arena', chargeInvoiceUrl(c));
  }

  protected invoiceUrl(c: Charge): string | null {
    return chargeInvoiceUrl(c);
  }

  protected onlineLabel(c: Charge): string | null {
    return onlineChargeLabel(c);
  }

  protected copyLink(url: string): void {
    void navigator.clipboard?.writeText(url).then(() => this.copied.set(url), () => undefined);
  }

  protected markColor(mark: AttendanceMark | null): string {
    return MARK_COLOR[mark ?? 'none']!;
  }

  protected openPay(c: Charge): void {
    if (this.readOnly()) return;
    this.payMethod.set(c.paymentMethod);
    this.payDate.set(this.today);
    this.paying.set(c);
  }

  protected async pay(c: Charge): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await setChargeStatus(arenaFunctions(), c.id, 'paid', this.payMethod(), this.payDate());
      this.paying.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível registrar o pagamento.');
      this.paying.set(null);
    } finally {
      this.busy.set(false);
    }
  }

  protected voidsInvoice(c: Charge): boolean {
    return chargeVoidsInvoice(c);
  }

  /** Cancela a mensalidade; online, o servidor também anula a fatura no Asaas. */
  protected async cancelCharge(c: Charge): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await setChargeStatus(arenaFunctions(), c.id, 'canceled');
      this.canceling.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível cancelar a mensalidade.');
      this.canceling.set(null);
    } finally {
      this.busy.set(false);
    }
  }

  protected async reopen(c: Charge): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await setChargeStatus(arenaFunctions(), c.id, 'open');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível desfazer.');
    } finally {
      this.busy.set(false);
    }
  }

  protected async applyStatus(k: Confirm): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await setEnrollmentStatus(arenaFunctions(), this.enrollmentId, k === 'pause' ? 'paused' : k === 'resume' ? 'active' : 'canceled');
      this.confirm.set(null);
    } catch (err) {
      this.confirm.set(null);
      this.error.set(err instanceof Error ? err.message : 'Não foi possível mudar o plano.');
    } finally {
      this.busy.set(false);
    }
  }

  protected go(route: unknown[]): void {
    void this.router.navigate(route);
  }
}
