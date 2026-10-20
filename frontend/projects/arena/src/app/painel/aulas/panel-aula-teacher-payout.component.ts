import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { Unsubscribe } from 'firebase/firestore';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { arenaFunctions } from '../data/functions';
import { IconComponent } from '../ui/icon.component';
import { ModalComponent } from '../ui/modal.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { AulaStatComponent, AulasPageComponent } from './aulas-ui';
import { brl } from './billing.model';
import { shortDate, todayKeyLocal, type ClassTeacher } from './class.model';
import { fetchTeachers } from './classes-repository';
import { closePayout, previewPayouts, setPayoutStatus, watchTeacherPayout, watchTeacherPayoutHistory } from './payout-repository';
import {
  PAYOUT_METHODS,
  PAYOUT_METHOD_LABEL,
  PAYOUT_STATE_LABEL,
  defaultPayoutMonth,
  isMonthKey,
  monthLastDay,
  monthLongLabel,
  parseDecimalInput,
  payoutColumnLabel,
  payoutModelLabel,
  payoutState,
  shiftMonth,
  shortMonthDay,
  type ClassPayout,
  type PayoutMethod,
  type TeacherPayoutFigures,
  type TeacherPayoutPreview,
} from './payout.model';

type Dialog = 'close' | 'pay' | 'undo';

/** 15 · Repasse do professor no mês — composição, regra, histórico. O gestor fecha o mês
 *  (com ajuste explicado), registra o pagamento feito por fora e pode desfazer. */
@Component({
  selector: 'ar-panel-aula-teacher-payout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AulasPageComponent, PanelCardComponent, IconComponent, ModalComponent, AulaStatComponent, RouterLink],
  styleUrl: './aulas-form.scss',
  template: `
    <ar-aulas-page [title]="title()" [subtitle]="subtitle()">
      <div page-actions class="actions">
        <a class="ar-mini-btn" routerLink="/painel/aulas/repasse" [queryParams]="{ mes: month() }">
          <ar-icon name="chevron-left" [size]="14" />
          Repasse
        </a>
        <button type="button" class="ar-mini-btn icon" aria-label="Mês anterior" (click)="goMonth(-1)">
          <ar-icon name="chevron-left" [size]="14" />
        </button>
        <button type="button" class="ar-mini-btn icon" aria-label="Próximo mês" [disabled]="month() >= currentMonth" (click)="goMonth(1)">
          <ar-icon name="chevron-right" [size]="14" />
        </button>
        @if (canManage()) {
          @switch (state()) {
            @case ('no_model') {
              <a class="ar-mini-btn ar-mini-btn-primary" routerLink="/painel/aulas/professores" [queryParams]="{ editar: teacherId }">Definir modelo</a>
            }
            @case ('to_close') {
              <button type="button" class="ar-mini-btn ar-mini-btn-primary" (click)="openClose()">Fechar mês</button>
            }
            @case ('closed') {
              <button type="button" class="ar-mini-btn" (click)="openClose()">Recalcular</button>
              <button type="button" class="ar-mini-btn ar-mini-btn-primary" (click)="openPay()">Registrar pagamento</button>
            }
            @case ('paid') {
              <button type="button" class="ar-mini-btn" (click)="dialog.set('undo')">Desfazer pagamento</button>
            }
          }
        }
      </div>

      @if (loading()) {
        <p class="state-text">Calculando o repasse…</p>
      } @else if (loadError(); as err) {
        <p class="state-text">{{ err }}</p>
      } @else if (!teacher()) {
        <p class="state-text">Professor não encontrado.</p>
      } @else {
        @if (state() === 'partial') {
          <div class="info-banner">Mês em andamento — valores parciais. O fechamento abre em 1º de {{ nextMonthName() }}.</div>
        } @else if (stale()) {
          <div class="info-banner warn">A conta de hoje deu {{ brl(previewFigures()?.amountReais ?? 0) }} — mudou desde o fechamento (pagamento lançado ou estornado depois). Recalcule antes de pagar.</div>
        }

        <div class="kpis">
          <ar-aula-stat label="Aulas dadas" [value]="'' + figures().classesGiven" [sub]="classesSub()" />
          <ar-aula-stat label="Receita gerada" [value]="brl(figures().grossRevenueReais)" tone="green" [sub]="revenueSub()" />
          @if (closed()?.adjustmentReais) {
            <ar-aula-stat label="Ajuste" [value]="signedBrl(closed()!.adjustmentReais)" [tone]="closed()!.adjustmentReais < 0 ? 'red' : 'green'" [sub]="closed()!.adjustmentNote ?? ''" />
          } @else {
            <ar-aula-stat label="Alunos" [value]="'' + figures().students" [sub]="figures().presences + ' presenças'" />
          }
          <ar-aula-stat [label]="state() === 'paid' ? 'Pago' : 'A pagar'" [value]="brl(amount())" [tone]="state() === 'paid' ? 'green' : 'orange'" [sub]="amountSub()" />
        </div>

        <div class="layout">
          <ar-panel-card title="Composição do repasse" [kicker]="closed() ? 'fechado em ' + closedOn() : 'prévia de hoje'">
            <div class="ar-table-scroll" tabindex="0" role="region" aria-label="Composição do repasse">
              <div class="ar-table-inner">
                <div class="grid head">
                  <span>Origem</span><span>Detalhe</span><span>Aulas</span><span>Presenças</span><span>Receita</span><span>{{ columnLabel() }}</span>
                </div>
                @for (l of figures().lines; track l.key) {
                  <div class="grid row">
                    <span class="origin">{{ l.label }}</span>
                    <span class="cell">{{ l.detail }}{{ l.payingStudents ? ' · ' + l.payingStudents + ' pagante' + (l.payingStudents === 1 ? '' : 's') : '' }}</span>
                    <span class="mono dim">{{ l.classes }}</span>
                    <span class="mono dim">{{ l.presences }}</span>
                    <span class="mono dim">
                      {{ brl(l.revenueReais) }}
                      @if (l.platformFeeReais > 0) {
                        <span class="fee-note">{{ brl(l.grossRevenueReais) }} − {{ brl(l.platformFeeReais) }} taxa NexaGO</span>
                      }
                    </span>
                    <span class="mono">{{ brl(l.amountReais) }}</span>
                  </div>
                } @empty {
                  <p class="state-text empty">Nenhuma aula com chamada fechada nem mensalidade paga neste mês.</p>
                }
                @if (closed()?.adjustmentReais) {
                  <div class="grid row">
                    <span class="origin" [class.neg]="closed()!.adjustmentReais < 0">Ajuste</span>
                    <span class="cell span-4">{{ closed()!.adjustmentNote }}</span>
                    <span class="mono" [class.neg]="closed()!.adjustmentReais < 0">{{ signedBrl(closed()!.adjustmentReais) }}</span>
                  </div>
                }
              </div>
            </div>
            <div class="total">
              <span>{{ state() === 'paid' ? 'Total pago' : 'Total a pagar' }}</span>
              <strong>{{ brl(amount()) }}</strong>
            </div>
          </ar-panel-card>

          <div class="side">
            <ar-panel-card title="Regra de repasse">
              @if (canManage()) {
                <a card-actions class="ar-ghost-btn" routerLink="/painel/aulas/professores" [queryParams]="{ editar: teacherId }">Alterar</a>
              }
              <div class="facts">
                <div><span>Modelo</span><strong>{{ modelText() }}</strong></div>
                @switch (model()?.model) {
                  @case ('per_class') {
                    <div><span>Conta</span><strong>Aula com chamada fechada</strong></div>
                  }
                  @case ('per_student') {
                    <div><span>Conta</span><strong>Aluno presente (encaixe incluso)</strong></div>
                  }
                  @default {
                    <div><span>Conta</span><strong>Mensalidade paga no mês</strong></div>
                    <div><span>Aluno com vários professores</span><strong>Rateio pelos horários</strong></div>
                    <div><span>Taxa de matrícula</span><strong>Fica com a arena</strong></div>
                  }
                }
                <div><span>Aula cancelada</span><strong>Não entra</strong></div>
              </div>
              @if (closed() && teacherModelChanged()) {
                <p class="hint">Fechado com o modelo anterior — hoje o cadastro diz {{ teacherModelText() }}. Recalcule para aplicar.</p>
              }
            </ar-panel-card>

            <ar-panel-card title="Histórico">
              @for (h of history(); track h.id) {
                <a class="hist" [class.current]="h.month === month()" [routerLink]="[]" [queryParams]="{ mes: h.month }">
                  <span class="h-month">{{ monthName(h.month) }}</span>
                  <span class="h-state" [class.paid]="h.status === 'paid'">{{ h.status === 'paid' ? 'Pago ' + (h.paidOn ? shortDate(h.paidOn) : '') : 'A pagar' }}</span>
                  <span class="mono">{{ brl(h.amountReais) }}</span>
                </a>
              } @empty {
                <p class="state-text">Nenhum mês fechado ainda.</p>
              }
            </ar-panel-card>
          </div>
        </div>
      }
    </ar-aulas-page>

    @switch (dialog()) {
      @case ('close') {
        <ar-modal (close)="closeDialog()">
          <p class="modal-title">{{ closed() ? 'Recalcular o repasse' : 'Fechar o repasse' }} de {{ monthName(month()) }}</p>
          <p class="modal-sub">{{ teacher()?.name }} · {{ modelText() }} · calculado hoje: {{ brl(previewFigures()?.amountReais ?? 0) }}</p>
          @if ((previewFigures()?.pendingSessions ?? 0) > 0) {
            <div class="info-banner warn">{{ previewFigures()!.pendingSessions }} aula(s) do mês estão com a chamada aberta e não entram. Feche a chamada antes, se for o caso.</div>
          }
          @if (error(); as err) {
            <div class="error-banner">{{ err }}</div>
          }
          <div class="row-2">
            <div>
              <div class="field-label spaced">Ajuste (R$, negativo desconta)</div>
              <input class="input-box mono-input" type="text" inputmode="decimal" placeholder="0" [value]="adjustment()" (input)="adjustment.set($any($event.target).value)" />
            </div>
            <div>
              <div class="field-label spaced">Motivo do ajuste</div>
              <input class="input-box" type="text" maxlength="200" placeholder="Ex.: aula de 08/10 sem substituto" [value]="adjustmentNote()" (input)="adjustmentNote.set($any($event.target).value)" />
            </div>
          </div>
          <div class="sum">
            <span>Total do fechamento</span>
            <strong>{{ closeTotal() == null ? '—' : brl(closeTotal()!) }}</strong>
          </div>
          <p class="hint">O fechamento grava um retrato do mês. Até registrar o pagamento, dá para recalcular.</p>
          <div class="modal-actions">
            <button type="button" class="ar-mini-btn" [disabled]="busy()" (click)="closeDialog()">Cancelar</button>
            <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="busy() || closeTotal() == null" (click)="confirmClose()">
              {{ busy() ? 'Salvando…' : closed() ? 'Recalcular' : 'Fechar mês' }}
            </button>
          </div>
        </ar-modal>
      }
      @case ('pay') {
        <ar-modal (close)="closeDialog()">
          <p class="modal-title">Registrar pagamento</p>
          <p class="modal-sub">{{ teacher()?.name }} · repasse de {{ monthName(month()) }} · {{ brl(amount()) }}</p>
          @if (error(); as err) {
            <div class="error-banner">{{ err }}</div>
          }
          <div class="field-label">Forma</div>
          <div class="chip-row">
            @for (m of methods; track m) {
              <button type="button" class="ar-chip" [class.active]="payMethod() === m" (click)="payMethod.set(m)">{{ methodLabel[m] }}</button>
            }
          </div>
          <div class="field-label spaced">Data do pagamento</div>
          <input class="input-box" type="date" [max]="today" [value]="payDate()" (input)="payDate.set($any($event.target).value)" />
          <p class="hint">O pagamento é feito direto ao professor — o painel só registra.</p>
          <div class="modal-actions">
            <button type="button" class="ar-mini-btn" [disabled]="busy()" (click)="closeDialog()">Cancelar</button>
            <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="busy() || !payDate()" (click)="confirmPay()">{{ busy() ? 'Salvando…' : 'Confirmar pagamento' }}</button>
          </div>
        </ar-modal>
      }
      @case ('undo') {
        <ar-modal (close)="closeDialog()">
          <p class="modal-title">Desfazer o pagamento?</p>
          <p class="modal-sub">O repasse de {{ monthName(month()) }} volta para "a pagar". Use quando o pagamento foi registrado por engano.</p>
          @if (error(); as err) {
            <div class="error-banner">{{ err }}</div>
          }
          <div class="modal-actions">
            <button type="button" class="ar-mini-btn" [disabled]="busy()" (click)="closeDialog()">Voltar</button>
            <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="busy()" (click)="confirmUndo()">{{ busy() ? 'Aguarde…' : 'Desfazer' }}</button>
          </div>
        </ar-modal>
      }
    }
  `,
  styles: `
    .state-text { font-size: 13.5px; color: var(--nx-text-mute); margin: 0; }
    .state-text.empty { margin: 14px 0 4px; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .actions a { text-decoration: none; display: inline-flex; align-items: center; }
    .icon { width: 34px; padding: 0; justify-content: center; }
    .info-banner {
      border-radius: var(--nx-r-2); border: 1px solid var(--nx-line-strong); background: var(--nx-surface-1);
      padding: 10px 14px; font-size: 12.5px; color: var(--nx-text-mute); flex: none;
    }
    .info-banner.warn { border-color: var(--nx-pending); color: var(--nx-pending); margin-bottom: 4px; }
    .kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; flex: none; }
    .layout { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 16px; align-items: start; }
    .side { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
    .grid { display: grid; grid-template-columns: minmax(130px, 1.2fr) minmax(150px, 1.3fr) 60px 80px 100px 110px; gap: 12px; align-items: center; }
    .head { padding-bottom: 9px; border-bottom: 1px solid var(--nx-line-strong); }
    .head span { font-family: var(--nx-font-mono); font-size: 9px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .row { padding: 11px 0; border-bottom: 1px solid var(--nx-line); }
    .origin { font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; color: var(--nx-text); }
    .cell { font-size: 12.5px; color: var(--nx-text-mute); }
    .span-4 { grid-column: span 4; }
    .mono { font-family: var(--nx-font-mono); font-size: 12.5px; font-weight: 700; color: var(--nx-text); }
    .mono.dim { font-weight: 500; color: var(--nx-text-mute); }
    .fee-note { display: block; font-family: var(--nx-font-ui); font-size: 10.5px; font-weight: 500; color: var(--nx-text-mute); margin-top: 2px; }
    .neg { color: var(--nx-live); }
    .total { display: flex; justify-content: flex-end; align-items: baseline; gap: 16px; padding-top: 14px; }
    .total span { font-family: var(--nx-font-display); font-weight: 700; font-size: 14px; color: var(--nx-text); }
    .total strong { font-family: var(--nx-font-display); font-weight: 800; font-size: 26px; color: var(--nx-orange-500); }
    .facts { display: flex; flex-direction: column; gap: 8px; }
    .facts div { display: flex; justify-content: space-between; gap: 10px; font-size: 12.5px; }
    .facts span { color: var(--nx-text-dim); }
    .facts strong { font-family: var(--nx-font-display); font-weight: 600; color: var(--nx-text); text-align: right; }
    .hist { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 12px; align-items: center; padding: 9px 0; border-bottom: 1px solid var(--nx-line); text-decoration: none; color: inherit; }
    .hist:last-child { border-bottom: none; }
    .hist.current .h-month { color: var(--nx-orange-500); }
    .h-month { font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; color: var(--nx-text); text-transform: capitalize; }
    .h-state { font-family: var(--nx-font-mono); font-size: 10.5px; color: var(--nx-pending); }
    .h-state.paid { color: var(--nx-win); }
    .mono-input { font-family: var(--nx-font-mono); }
    .sum { display: flex; justify-content: space-between; align-items: baseline; margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--nx-line-strong); }
    .sum span { font-family: var(--nx-font-display); font-weight: 700; font-size: 13.5px; color: var(--nx-text); }
    .sum strong { font-family: var(--nx-font-display); font-weight: 800; font-size: 22px; color: var(--nx-orange-500); }
    @media (max-width: 1180px) { .layout { grid-template-columns: minmax(0, 1fr); } }
    @media (max-width: 1100px) { .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  `,
})
export class PanelAulaTeacherPayoutComponent {
  private readonly arenaContext = inject(ArenaContextService);
  private readonly access = inject(ArenaAccessService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly brl = brl;
  protected readonly shortDate = shortDate;
  protected readonly methods = PAYOUT_METHODS;
  protected readonly methodLabel = PAYOUT_METHOD_LABEL;
  protected readonly today = todayKeyLocal();
  protected readonly currentMonth = this.today.slice(0, 7);
  protected readonly teacherId = this.route.snapshot.paramMap.get('teacherId') ?? '';
  /** Gate de dinheiro: escreve Aulas E lê o financeiro (dono e gestor). */
  protected readonly canManage = computed(() => this.access.canWrite('agenda') && this.access.canRead('financeiro'));

  protected readonly month = signal(defaultPayoutMonth(this.today));
  protected readonly teacher = signal<ClassTeacher | null>(null);
  protected readonly previewFigures = signal<TeacherPayoutPreview | null>(null);
  protected readonly closed = signal<ClassPayout | null>(null);
  protected readonly history = signal<ClassPayout[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected readonly dialog = signal<Dialog | null>(null);
  protected readonly adjustment = signal('');
  protected readonly adjustmentNote = signal('');
  protected readonly payMethod = signal<PayoutMethod>('pix');
  protected readonly payDate = signal(this.today);

  protected readonly model = computed(() => this.closed()?.model ?? this.teacher()?.payout ?? null);
  protected readonly state = computed(() => payoutState(this.closed(), this.model(), this.month(), this.today));
  protected readonly figures = computed<TeacherPayoutFigures>(() => {
    const c = this.closed();
    if (c) return c;
    const p = this.previewFigures();
    if (p) return p;
    const t = this.teacher();
    return {
      teacherId: this.teacherId, teacherName: t?.name ?? 'Professor', teacherColor: t?.color ?? '#FF6A1A', model: t?.payout ?? null,
      classesGiven: 0, presences: 0, students: 0, pendingSessions: 0,
      grossRevenueReais: 0, platformFeeReais: 0, revenueReais: 0, amountReais: 0, lines: [],
    };
  });
  protected readonly amount = computed(() => this.figures().amountReais);
  /** No % da receita a base é sem a taxa da NexaGO das mensalidades pagas online. */
  protected readonly revenueSub = computed(() => {
    const f = this.figures();
    if (f.platformFeeReais > 0) {
      return `− ${brl(f.platformFeeReais)} taxa NexaGO = ${brl(f.revenueReais)}${this.model()?.model === 'revenue_share' ? ' (base do repasse)' : ''}`;
    }
    return this.model()?.model === 'revenue_share' ? 'base do repasse' : 'mensalidades pagas no mês';
  });
  protected readonly stale = computed(() => {
    const c = this.closed();
    const p = this.previewFigures();
    return c != null && c.status === 'closed' && p != null && Math.abs(c.computedReais - p.amountReais) >= 0.01;
  });
  protected readonly teacherModelChanged = computed(() => {
    const now = this.teacher()?.payout ?? null;
    return payoutModelLabel(now) !== payoutModelLabel(this.closed()?.model ?? null);
  });
  protected readonly title = computed(() => `${this.teacher()?.name ?? 'Professor'} · repasse de ${this.monthName(this.month())}`);
  protected readonly subtitle = computed(() => {
    const parts = [`Modelo ${this.modelText()}`, `fechamento ${shortMonthDay(monthLastDay(this.month()))}`];
    parts.push(this.stateText());
    return parts.join(' · ');
  });
  protected readonly modelText = computed(() => payoutModelLabel(this.model()));
  protected readonly teacherModelText = computed(() => payoutModelLabel(this.teacher()?.payout ?? null));
  protected readonly columnLabel = computed(() => payoutColumnLabel(this.model()));
  protected readonly nextMonthName = computed(() => this.monthName(shiftMonth(this.month(), 1)));
  protected readonly closedOn = computed(() => {
    const d = this.closed()?.closedAt;
    return d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}` : '—';
  });
  protected readonly classesSub = computed(() => {
    const pending = this.figures().pendingSessions;
    return pending > 0 ? `${pending} sem chamada fechada` : 'chamada fechada';
  });
  protected readonly amountSub = computed(() => {
    const c = this.closed();
    if (c?.status === 'paid') return `${c.paymentMethod ? PAYOUT_METHOD_LABEL[c.paymentMethod] : ''} · ${c.paidOn ? shortDate(c.paidOn) : ''}`;
    return PAYOUT_STATE_LABEL[this.state()];
  });
  /** Total do fechamento com o ajuste digitado (null = ajuste inválido). */
  protected readonly closeTotal = computed(() => {
    const raw = this.adjustment().trim();
    const adj = raw ? parseDecimalInput(raw) : 0;
    if (Number.isNaN(adj)) return null;
    const total = Math.round(((this.previewFigures()?.amountReais ?? 0) + adj) * 100) / 100;
    return total < 0 ? null : total;
  });

  private unsubs: Unsubscribe[] = [];
  private loadSeq = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.unsubs.forEach((u) => u()));
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const raw = params.get('mes');
      if (isMonthKey(raw) && raw <= this.currentMonth) this.month.set(raw);
    });
    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      const month = this.month();
      if (arenaId) untracked(() => void this.load(arenaId, month));
    });
  }

  private async load(arenaId: string, month: string): Promise<void> {
    const seq = ++this.loadSeq;
    this.loading.set(true);
    this.loadError.set(null);
    this.error.set(null);
    this.unsubs.forEach((u) => u());
    const db = arenaFirestore();
    this.unsubs = [
      watchTeacherPayout(db, arenaId, this.teacherId, month, (p) => this.closed.set(p)),
      watchTeacherPayoutHistory(db, arenaId, this.teacherId, (list) => this.history.set(list)),
    ];
    try {
      const [teachers, preview] = await Promise.all([fetchTeachers(db, arenaId), previewPayouts(arenaFunctions(), arenaId, month)]);
      if (seq !== this.loadSeq) return;
      this.teacher.set(teachers.find((t) => t.id === this.teacherId) ?? null);
      this.previewFigures.set(preview.teachers.find((t) => t.teacherId === this.teacherId) ?? null);
    } catch (err) {
      if (seq === this.loadSeq) this.loadError.set(err instanceof Error ? err.message : 'Não foi possível calcular o repasse.');
    } finally {
      if (seq === this.loadSeq) this.loading.set(false);
    }
  }

  private async refreshPreview(): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId) return;
    const preview = await previewPayouts(arenaFunctions(), arenaId, this.month());
    this.previewFigures.set(preview.teachers.find((t) => t.teacherId === this.teacherId) ?? null);
  }

  protected monthName(month: string): string {
    return monthLongLabel(month).replace(' de ', '/');
  }

  protected stateText(): string {
    const c = this.closed();
    if (c?.status === 'paid' && c.paidOn) return `pago em ${shortDate(c.paidOn)}`;
    return PAYOUT_STATE_LABEL[this.state()].toLowerCase();
  }

  protected signedBrl(value: number): string {
    return `${value < 0 ? '− ' : '+ '}${brl(Math.abs(value))}`;
  }

  protected goMonth(delta: number): void {
    const next = shiftMonth(this.month(), delta);
    if (next > this.currentMonth) return;
    void this.router.navigate([], { relativeTo: this.route, queryParams: { mes: next }, replaceUrl: true });
  }

  protected closeDialog(): void {
    if (this.busy()) return;
    this.dialog.set(null);
    this.error.set(null);
  }

  protected async openClose(): Promise<void> {
    const c = this.closed();
    this.adjustment.set(c?.adjustmentReais ? String(c.adjustmentReais).replace('.', ',') : '');
    this.adjustmentNote.set(c?.adjustmentNote ?? '');
    this.error.set(null);
    this.dialog.set('close');
    // A prévia pode ter mudado desde que a página abriu (pagamento lançado agora).
    try {
      await this.refreshPreview();
    } catch {
      // Segue com a prévia que já está na tela; o servidor recalcula no fechamento.
    }
  }

  protected openPay(): void {
    this.payMethod.set('pix');
    this.payDate.set(this.today);
    this.error.set(null);
    this.dialog.set('pay');
  }

  protected async confirmClose(): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    const raw = this.adjustment().trim();
    const adjustmentReais = raw ? parseDecimalInput(raw) : 0;
    if (!arenaId || Number.isNaN(adjustmentReais)) return;
    await this.run(async () => {
      await closePayout(arenaFunctions(), {
        arenaId,
        teacherId: this.teacherId,
        month: this.month(),
        adjustmentReais,
        adjustmentNote: this.adjustmentNote().trim() || null,
      });
      await this.refreshPreview();
    });
  }

  protected async confirmPay(): Promise<void> {
    const c = this.closed();
    if (!c) return;
    await this.run(() => setPayoutStatus(arenaFunctions(), c.id, 'paid', this.payMethod(), this.payDate()));
  }

  protected async confirmUndo(): Promise<void> {
    const c = this.closed();
    if (!c) return;
    await this.run(() => setPayoutStatus(arenaFunctions(), c.id, 'closed'));
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    if (!this.canManage()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await action();
      this.dialog.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível concluir.');
    } finally {
      this.busy.set(false);
    }
  }
}
