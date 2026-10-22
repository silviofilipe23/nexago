import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { CenterContextService } from '../../core/center-context.service';
import { writeErrorMessage } from '../../data/actions/actor';
import { PayoutsActions } from '../../data/actions/payouts.actions';
import { ReceivingActions } from '../../data/actions/receiving.actions';
import { CenterStore } from '../../data/center-store.service';
import { addMonths, formatDayKey, monthKey, monthLabel, todayKey, wallClock } from '../../domain/dates';
import type { ClassSession, ReceivingAccount } from '../../domain/models';
import { formatBRL, parseBRL } from '../../domain/money';
import {
  NO_RULE,
  PAYOUT_METHODS,
  PAYOUT_STATUS,
  PAY_RULE_LABEL,
  computePayout,
  monthRangeOf,
  paidMethodLabel,
  transferLocked,
  payRuleError,
  type PayRule,
  type PayRuleKind,
  type Payout,
  type PayoutCalc,
} from '../../domain/payouts';
import { downloadCsv, toCsv } from '../../ui/csv';
import { IconComponent } from '../../ui/icon.component';
import { BannerComponent, ModalComponent, PageHeaderComponent, PersonComponent, SegmentedComponent, StatComponent } from '../../ui/kit';
import { ReportsService } from '../reports/reports.service';
import { canClose, payoutRows, payoutTotals, payoutsCsv, type PayoutRow } from './payout-view';

/** Repasses aos professores (fase 1: calculado aqui, pago por fora e marcado como pago). */
@Component({
  selector: 'ct-payouts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, StatComponent, PersonComponent, IconComponent, ModalComponent, SegmentedComponent, BannerComponent],
  template: `
    <ct-page-header title="Repasses" [subtitle]="'Professores · ' + monthTitle()">
      <button type="button" class="ct-mini-btn" [disabled]="rows().length === 0" (click)="exportCsv()"><ct-icon name="download" [size]="14" /> Exportar</button>
      @if (canWrite() && closable().length > 1) {
        <button type="button" class="ct-mini-btn ct-mini-btn-primary" [disabled]="busy()" (click)="closeAll()">Fechar {{ closable().length }} repasses</button>
      }
    </ct-page-header>

    <div class="page">
      <div class="ct-filter-bar">
        <button type="button" class="ct-mini-btn icon" aria-label="Mês anterior" (click)="shift(-1)"><ct-icon name="chevron-left" [size]="14" /></button>
        <span class="ct-disp month">{{ monthTitle() }}</span>
        <button type="button" class="ct-mini-btn icon" aria-label="Próximo mês" [disabled]="month() >= currentMonth()" (click)="shift(1)"><ct-icon name="chevron" [size]="14" /></button>
        <div class="ct-grow"></div>
        <span class="ct-mono">Conta aula com chamada finalizada · quem deu a aula recebe</span>
      </div>

      <div class="ct-stats">
        <ct-stat label="Repasses do mês" [value]="formatBRL(totals().totalCents)" [sub]="rows().length + (rows().length === 1 ? ' professor' : ' professores')" />
        <ct-stat label="Em aberto" [value]="formatBRL(totals().openCents)" sub="calculado · ainda não fechado" />
        <ct-stat label="Fechado a pagar" [value]="formatBRL(totals().closedCents)" sub="pague por fora e marque como pago" tone="orange" />
        <ct-stat label="Pago" [value]="formatBRL(totals().paidCents)" tone="green" />
      </div>

      @if (totals().pendingAttendance > 0) {
        <ct-banner tone="yellow" [inline]="true" [title]="totals().pendingAttendance === 1 ? '1 aula sem chamada finalizada' : totals().pendingAttendance + ' aulas sem chamada finalizada'">
          Aula sem chamada finalizada não entra no repasse por aula até ser finalizada na Agenda.
        </ct-banner>
      }
      @if (error()) {
        <p class="ct-error-text" role="alert">{{ error() }}</p>
      }
      @if (info()) {
        <ct-banner tone="blue" [inline]="true" title="Pagar pelo NexaGO">{{ info() }}</ct-banner>
      }

      <div class="ct-card flush">
        <div class="ct-table" style="--cols: 1.4fr 1.5fr 80px 120px 130px 1.2fr; --min-w: 860px">
          <div class="ct-thead"><span>Professor</span><span>Regra</span><span>Aulas</span><span>Repasse</span><span>Situação</span><span></span></div>
          @for (r of rows(); track r.coachUid) {
            <div class="ct-tr" [class.hi]="r.coachUid === openUid()">
              <button type="button" class="link" (click)="openUid.set(r.coachUid)"><ct-person [name]="r.coachName" [colorKey]="r.coachUid" [size]="28" /></button>
              <span class="ct-row rule">
                <span class="ct-ellipsis" [class.ct-dim]="r.rule.kind === 'none'">{{ r.ruleLabel }}</span>
                @if (canWrite() && r.status !== 'paid' && !locked(r)) {
                  <button type="button" class="ct-ghost-btn sm" (click)="editRule(r)">Editar</button>
                }
              </span>
              <span class="ct-mono">{{ r.classesGiven }}{{ r.pendingAttendance ? ' (+' + r.pendingAttendance + ')' : '' }}</span>
              <span class="val">{{ formatBRL(r.totalCents) }}</span>
              <span>
                @switch (r.payout?.transferStatus) {
                  @case ('pending') {
                    <span class="ct-pill blue">Transferindo</span>
                    <span class="ct-mono warn">{{ r.payout?.transferAuthorized ? 'aguardando o Asaas' : 'confirme o SMS no app do Asaas' }}</span>
                  }
                  @case ('requested') {
                    <span class="ct-pill blue">Transferindo</span>
                  }
                  @case ('unknown') {
                    <span class="ct-pill red">Sem confirmação</span>
                    <span class="ct-mono warn">confira o extrato do Asaas</span>
                  }
                  @default {
                    <span [class]="'ct-pill ' + STATUS[r.status][1]">{{ STATUS[r.status][0] }}</span>
                    @if (r.payout?.transferStatus === 'failed' && r.status === 'closed') {
                      <span class="ct-mono warn" [title]="r.payout?.transferError || ''">transferência falhou</span>
                    }
                  }
                }
                @if (r.outdated && !locked(r)) {
                  <span class="ct-mono warn" title="O cálculo de agora deu outro valor">agora {{ formatBRL(r.liveTotalCents) }}</span>
                }
              </span>
              <span class="ct-row acts">
                @if (canWrite()) {
                  @if (canCloseRow(r)) {
                    <button type="button" class="ct-mini-btn" [disabled]="busy()" (click)="close(r)">{{ r.status === 'closed' ? 'Refazer' : 'Fechar' }}</button>
                  }
                  @if (r.status === 'closed' && r.payout?.transferStatus === 'unknown' && ctx.isOwner()) {
                    <button type="button" class="ct-mini-btn" [disabled]="busy()" (click)="resolve(r, 'not_sent')">Não saiu</button>
                    <button type="button" class="ct-mini-btn ct-mini-btn-primary" [disabled]="busy()" (click)="resolve(r, 'sent')">Saiu</button>
                  } @else if (r.status === 'closed' && !locked(r)) {
                    @if (canPayOnline()) {
                      <button type="button" class="ct-mini-btn" (click)="startPay(r)">Paguei por fora</button>
                      <button type="button" class="ct-mini-btn ct-mini-btn-primary" (click)="transferFor.set(r)">Pagar pelo NexaGO</button>
                    } @else {
                      <button type="button" class="ct-mini-btn ct-mini-btn-primary" (click)="startPay(r)">Marcar pago</button>
                    }
                  }
                }
                <button type="button" class="ct-ghost-btn sm" (click)="openUid.set(r.coachUid)">Detalhe</button>
              </span>
            </div>
          } @empty {
            <div class="ct-empty">
              @if (loading()) {
                <span class="ct-spinner light" aria-hidden="true"></span>
              } @else {
                Nenhum professor com regra de repasse ou aula dada em {{ monthTitle() }}. Defina a regra de cada professor para calcular.
              }
            </div>
          }
        </div>
      </div>

      @if (canWrite() && coachesWithoutRow().length) {
        <div class="ct-filter-bar">
          <span class="ct-dim">Sem regra e sem aula no mês:</span>
          @for (m of coachesWithoutRow(); track m.uid) {
            <button type="button" class="ct-chip" (click)="editRuleFor(m.uid, m.displayName, null)">{{ m.displayName }} · definir regra</button>
          }
        </div>
      }
    </div>

    @if (detail(); as d) {
      <ct-modal [kicker]="monthTitle() + ' · ' + STATUS[d.status][0]" [title]="d.coachName" [width]="620" (closed)="openUid.set(null)">
        <div class="ct-kv"><span>Regra</span><span>{{ d.ruleLabel }}</span></div>
        @if (d.rule.kind === 'percent') {
          <div class="ct-kv mono"><span>Base (pago no mês)</span><span>{{ formatBRL(d.baseCents) }}</span></div>
        }
        <div class="ct-kv mono"><span>Repasse</span><span>{{ formatBRL(d.totalCents) }}</span></div>
        @if (d.payout; as p) {
          <div class="ct-kv"><span>Fechado</span><span>{{ when(p.closedAt) }}{{ p.closedByName ? ' · ' + p.closedByName : '' }}</span></div>
          @if (p.status === 'paid') {
            <div class="ct-kv"><span>Pago</span><span>{{ formatDayKey(p.paidOn) }} · {{ methodLabel(p.paidMethod) }} · {{ p.paidByName }}</span></div>
            @if (p.note) {
              <div class="ct-kv"><span>Obs.</span><span>{{ p.note }}</span></div>
            }
          }
        }
        <div class="lines">
          @for (l of d.lines; track l.ref) {
            <div class="line">
              <span class="ct-mono">{{ formatDayKey(l.date) }}</span>
              <span class="ct-grow ct-ellipsis">{{ l.label }}</span>
              @if (l.kind === 'revenue') {
                <span class="ct-mono dim">{{ formatBRL(l.baseCents) }}</span>
              }
              <span class="ct-mono">{{ formatBRL(l.amountCents) }}</span>
            </div>
          } @empty {
            <div class="ct-dim">Nada a repassar neste mês.</div>
          }
        </div>
      </ct-modal>
    }

    @if (ruleFor(); as rf) {
      <ct-modal kicker="Regra de repasse" [title]="rf.name" [width]="460" (closed)="ruleFor.set(null)">
        <ct-segmented [options]="ruleOptions" [value]="ruleDraft().kind" (valueChange)="setRuleKind($event)" />
        @if (ruleDraft().kind === 'per_class' || ruleDraft().kind === 'monthly') {
          <div class="ct-field">
            <label for="pr-amount">{{ ruleDraft().kind === 'per_class' ? 'Valor por aula dada' : 'Valor fixo por mês' }}</label>
            <input id="pr-amount" class="ct-input mono" inputmode="decimal" [value]="amountText()" (input)="amountText.set(value($event))" placeholder="R$ 80,00" />
          </div>
        } @else if (ruleDraft().kind === 'percent') {
          <div class="ct-field">
            <label for="pr-pct">Percentual das mensalidades das turmas em que é titular</label>
            <input id="pr-pct" class="ct-input mono" inputmode="decimal" [value]="percentText()" (input)="percentText.set(value($event))" placeholder="40" />
          </div>
        }
        <p class="ct-dim hint">{{ ruleHint() }}</p>
        @if (ruleErr()) {
          <p class="ct-error-text" role="alert">{{ ruleErr() }}</p>
        }
        <div footer>
          <button type="button" class="ct-ghost-btn" (click)="ruleFor.set(null)">Cancelar</button>
          <button type="button" class="ct-mini-btn ct-mini-btn-primary" [disabled]="busy()" (click)="saveRule()">Salvar regra</button>
        </div>
      </ct-modal>
    }

    @if (transferFor(); as tf) {
      <ct-modal kicker="Pagar pelo NexaGO" [title]="tf.coachName + ' · ' + formatBRL(tf.totalCents)" [width]="480" (closed)="transferFor.set(null)">
        <p class="hint">
          Transfere {{ formatBRL(tf.totalCents) }} da conta Asaas do centro para a conta de recebimento de {{ tf.coachName }}. O saldo precisa estar
          disponível no Asaas.
        </p>
        <p class="ct-dim hint">
          Se o Asaas pedir confirmação, o código chega por SMS e é confirmado no app do Asaas do centro. O repasse fica pago quando a transferência
          concluir.
        </p>
        <div footer>
          <button type="button" class="ct-ghost-btn" (click)="transferFor.set(null)">Cancelar</button>
          <button type="button" class="ct-mini-btn ct-mini-btn-primary" [disabled]="busy()" (click)="confirmTransfer()">Transferir agora</button>
        </div>
      </ct-modal>
    }

    @if (payFor(); as pf) {
      <ct-modal kicker="Marcar como pago" [title]="pf.coachName + ' · ' + formatBRL(pf.totalCents)" [width]="460" (closed)="payFor.set(null)">
        <p class="ct-dim hint">O pagamento é feito por fora (Pix, transferência). Aqui fica o registro — depois de pago o repasse não muda mais.</p>
        <div class="ct-form-grid">
          <div class="ct-field">
            <label for="pp-date">Pago em</label>
            <input id="pp-date" class="ct-input" type="date" [value]="payDate()" (input)="payDate.set(value($event))" />
          </div>
          <div class="ct-field">
            <label for="pp-method">Forma</label>
            <select id="pp-method" class="ct-input" [value]="payMethod()" (change)="payMethod.set(value($event))">
              @for (m of methods; track m.value) {
                <option [value]="m.value" [selected]="m.value === payMethod()">{{ m.label }}</option>
              }
            </select>
          </div>
        </div>
        <div class="ct-field">
          <label for="pp-note">Observação</label>
          <input id="pp-note" class="ct-input" [value]="payNote()" (input)="payNote.set(value($event))" placeholder="Ex.: comprovante 12345" />
        </div>
        @if (payErr()) {
          <p class="ct-error-text" role="alert">{{ payErr() }}</p>
        }
        <div footer>
          <button type="button" class="ct-ghost-btn" (click)="payFor.set(null)">Cancelar</button>
          <button type="button" class="ct-mini-btn ct-mini-btn-primary" [disabled]="busy() || !payDate()" (click)="confirmPay()">Confirmar pagamento</button>
        </div>
      </ct-modal>
    }
  `,
  styles: `
    .page { padding: 20px var(--ct-gutter) 26px; display: flex; flex-direction: column; gap: 16px; }
    .month { min-width: 150px; text-align: center; }
    .link { all: unset; cursor: pointer; min-width: 0; }
    .rule { gap: 8px; min-width: 0; }
    .acts { gap: 6px; justify-content: flex-end; flex-wrap: wrap; }
    .val { font-family: var(--nx-font-mono); font-weight: 700; color: var(--nx-text); }
    .warn { display: block; margin-top: 3px; color: var(--nx-pending); font-size: 10.5px; }
    .sm { height: 28px; padding: 0 10px; font-size: 12px; }
    .lines { display: flex; flex-direction: column; border-top: 1px solid var(--nx-line); }
    .line { display: flex; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--nx-line); font-size: 13px; }
    .dim { color: var(--nx-text-mute); }
    .hint { margin: 0; line-height: 1.45; }
  `,
})
export class PayoutsComponent {
  readonly centerId = input.required<string>();

  protected readonly ctx = inject(CenterContextService);
  protected readonly store = inject(CenterStore);
  private readonly actions = inject(PayoutsActions);
  private readonly reports = inject(ReportsService);
  private readonly receiving = inject(ReceivingActions);

  protected readonly STATUS = PAYOUT_STATUS;
  protected readonly formatBRL = formatBRL;
  protected readonly formatDayKey = formatDayKey;
  protected readonly methods = PAYOUT_METHODS;
  protected readonly ruleOptions = (['per_class', 'percent', 'monthly', 'none'] as PayRuleKind[]).map((k) => ({ value: k, label: PAY_RULE_LABEL[k] }));

  private readonly tz = computed(() => this.ctx.center()?.timezone);
  protected readonly today = computed(() => todayKey(this.tz()));
  protected readonly currentMonth = computed(() => monthKey(this.today()));
  protected readonly month = signal(monthKey(todayKey()));
  protected readonly monthTitle = computed(() => monthLabel(this.month(), true));

  /** Só owner/admin fecham e marcam pago; quem tem "ver financeiro" só acompanha. */
  protected readonly canWrite = computed(() => this.ctx.isManager() && this.ctx.canWrite());

  private readonly rules = signal<Map<string, PayRule>>(new Map());
  private readonly payouts = signal<Payout[]>([]);
  private readonly fetched = signal<{ month: string; sessions: ClassSession[] } | null>(null);
  protected readonly loading = computed(() => this.fetched()?.month !== this.month());
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected readonly openUid = signal<string | null>(null);
  protected readonly ruleFor = signal<{ uid: string; name: string; before: PayRule } | null>(null);
  protected readonly ruleDraft = signal<PayRule>(NO_RULE);
  protected readonly amountText = signal('');
  protected readonly percentText = signal('');
  protected readonly ruleErr = signal('');
  protected readonly payFor = signal<PayoutRow | null>(null);
  protected readonly transferFor = signal<PayoutRow | null>(null);
  protected readonly info = signal('');
  private readonly centerAccount = signal<ReceivingAccount | null>(null);
  /** Transferência só com a conta do centro criada aqui (tem a chave) e aprovada; só o owner. */
  protected readonly canPayOnline = computed(() => {
    const a = this.centerAccount();
    return this.ctx.isOwner() && this.ctx.center()?.receivingStatus === 'approved' && !!a && a.source === 'self' && !a.manualFollowUp;
  });
  protected readonly payDate = signal('');
  protected readonly payMethod = signal('pix');
  protected readonly payNote = signal('');
  protected readonly payErr = signal('');

  /** Aulas do mês: as buscadas + as do store (ao vivo — chamada finalizada agora já conta). */
  private readonly sessions = computed(() => {
    const f = this.fetched();
    if (!f || f.month !== this.month()) return [];
    const { from, to } = monthRangeOf(f.month);
    const map = new Map(f.sessions.map((s) => [s.id, s]));
    for (const s of this.store.sessions()) {
      if (s.date >= from && s.date <= to) map.set(s.id, s);
    }
    return [...map.values()];
  });

  private readonly calcs = computed(() => {
    const out = new Map<string, PayoutCalc>();
    if (this.loading()) return out;
    const tz = this.tz();
    const people = new Set([...this.store.coaches().map((c) => c.uid), ...this.rules().keys(), ...this.sessions().map((s) => s.coachUid)]);
    for (const uid of people) {
      if (!uid) continue;
      out.set(
        uid,
        computePayout({
          coachUid: uid,
          rule: this.rules().get(uid) ?? NO_RULE,
          month: this.month(),
          today: this.today(),
          sessions: this.sessions(),
          classes: this.store.classes(),
          enrollments: this.store.enrollments(),
          invoices: this.store.invoices(),
          dayOf: (d) => wallClock(d, tz).dayKey,
        }),
      );
    }
    return out;
  });

  protected readonly rows = computed(() => {
    const names = this.store.coaches().map((c) => ({ uid: c.uid, displayName: c.displayName }));
    // Professor que deu aula e já saiu da equipe ainda aparece pelo nome gravado na aula.
    for (const s of this.sessions()) {
      if (s.coachUid && !names.some((n) => n.uid === s.coachUid)) names.push({ uid: s.coachUid, displayName: s.coachName || 'Professor' });
    }
    return payoutRows(names, this.calcs(), this.payouts());
  });
  protected readonly totals = computed(() => payoutTotals(this.rows()));
  protected readonly closable = computed(() => this.rows().filter(canClose));
  protected readonly coachesWithoutRow = computed(() =>
    this.store.coaches().filter((c) => c.role === 'coach' && !this.rows().some((r) => r.coachUid === c.uid)),
  );
  protected readonly detail = computed(() => this.rows().find((r) => r.coachUid === this.openUid()) ?? null);

  protected readonly ruleHint = computed(() => {
    switch (this.ruleDraft().kind) {
      case 'per_class':
        return 'Cada aula que ele der (titular ou substituindo) com a chamada finalizada.';
      case 'percent':
        return 'Sobre o que os alunos das turmas em que ele é titular pagaram no mês (estorno sai da base).';
      case 'monthly':
        return 'O mesmo valor todo mês, independente das aulas.';
      default:
        return 'Sem regra, o professor não aparece no repasse.';
    }
  });

  constructor() {
    const destroy = inject(DestroyRef);
    const stopRules = this.actions.watchRules((r) => this.rules.set(r), (e) => this.error.set(writeErrorMessage(e)));
    destroy.onDestroy(stopRules);
    if (this.ctx.isManager()) {
      const stopAccount = this.receiving.watch((a) => this.centerAccount.set(a), () => this.centerAccount.set(null));
      destroy.onDestroy(stopAccount);
    }
    effect((onCleanup) => {
      const month = this.month();
      const stop = untracked(() =>
        this.actions.watchMonth(month, (p) => this.payouts.set(p), (e) => this.error.set(writeErrorMessage(e))),
      );
      onCleanup(stop);
    });
    effect(() => {
      const month = this.month();
      const centerId = this.centerId();
      const { from, to } = monthRangeOf(month);
      untracked(() => {
        this.reports
          .sessionsBetween(centerId, from, to)
          .then((sessions) => {
            if (this.month() === month) this.fetched.set({ month, sessions });
          })
          .catch((e) => this.error.set(writeErrorMessage(e)));
      });
    });
    effect(() => {
      // Abre no mês atual do fuso do centro (o inicial usa o fuso do navegador).
      const cur = this.currentMonth();
      untracked(() => {
        if (this.month() > cur) this.month.set(cur);
      });
    });
  }

  protected shift(delta: number): void {
    const next = addMonths(this.month(), delta);
    if (next <= this.currentMonth()) {
      this.openUid.set(null);
      this.month.set(next);
    }
  }

  protected canCloseRow(r: PayoutRow): boolean {
    return canClose(r);
  }

  protected value(ev: Event): string {
    return (ev.target as HTMLInputElement).value;
  }

  protected when(d: Date | null): string {
    return d ? formatDayKey(wallClock(d, this.tz()).dayKey) : '—';
  }

  protected methodLabel(m: string): string {
    return paidMethodLabel(m);
  }

  protected locked(r: PayoutRow): boolean {
    return transferLocked(r.payout);
  }

  protected async confirmTransfer(): Promise<void> {
    const r = this.transferFor();
    if (!r?.payout) return;
    this.info.set('');
    await this.run(async () => {
      const res = await this.actions.payViaNexago(r.payout!);
      this.transferFor.set(null);
      this.info.set(`${r.coachName}: ${res.message}`);
    }, this.error);
  }

  protected async resolve(r: PayoutRow, outcome: 'sent' | 'not_sent'): Promise<void> {
    if (!r.payout) return;
    await this.run(() => this.actions.resolveTransfer(r.payout!, outcome).then(() => undefined), this.error);
  }

  protected editRule(r: PayoutRow): void {
    this.editRuleFor(r.coachUid, r.coachName, this.rules().get(r.coachUid) ?? null);
  }

  protected editRuleFor(uid: string, name: string, current: PayRule | null): void {
    const rule = current ?? this.rules().get(uid) ?? NO_RULE;
    this.ruleDraft.set({ ...rule, kind: rule.kind === 'none' ? 'per_class' : rule.kind });
    this.amountText.set(rule.amountCents ? (rule.amountCents / 100).toFixed(2).replace('.', ',') : '');
    this.percentText.set(rule.percent ? String(rule.percent).replace('.', ',') : '');
    this.ruleErr.set('');
    this.ruleFor.set({ uid, name, before: rule });
  }

  protected setRuleKind(kind: string): void {
    this.ruleDraft.update((r) => ({ ...r, kind: kind as PayRuleKind }));
  }

  protected async saveRule(): Promise<void> {
    const rf = this.ruleFor();
    if (!rf) return;
    const kind = this.ruleDraft().kind;
    const next: PayRule = {
      kind,
      amountCents: kind === 'per_class' || kind === 'monthly' ? (parseBRL(this.amountText()) ?? 0) : 0,
      percent: kind === 'percent' ? Number(this.percentText().replace(',', '.')) || 0 : 0,
    };
    const err = payRuleError(next);
    if (err) {
      this.ruleErr.set(err);
      return;
    }
    await this.run(async () => {
      await this.actions.setRule(rf.uid, rf.name, rf.before, next);
      this.ruleFor.set(null);
    }, this.ruleErr);
  }

  protected async close(r: PayoutRow): Promise<void> {
    const calc = this.calcs().get(r.coachUid);
    if (!calc) return;
    await this.run(() => this.actions.close(this.month(), r.coachName, calc), this.error);
  }

  protected async closeAll(): Promise<void> {
    await this.run(async () => {
      for (const r of this.closable()) {
        const calc = this.calcs().get(r.coachUid);
        if (calc) await this.actions.close(this.month(), r.coachName, calc);
      }
    }, this.error);
  }

  protected startPay(r: PayoutRow): void {
    this.payDate.set(this.today());
    this.payMethod.set('pix');
    this.payNote.set('');
    this.payErr.set('');
    this.payFor.set(r);
  }

  protected async confirmPay(): Promise<void> {
    const r = this.payFor();
    if (!r?.payout) return;
    await this.run(async () => {
      await this.actions.markPaid(r.payout!, { paidOn: this.payDate(), method: this.payMethod(), note: this.payNote() });
      this.payFor.set(null);
    }, this.payErr);
  }

  protected exportCsv(): void {
    downloadCsv(`repasses-${this.month()}.csv`, toCsv(payoutsCsv(this.month(), this.rows())));
  }

  private async run(fn: () => Promise<void>, err: ReturnType<typeof signal<string>>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    err.set('');
    try {
      await fn();
    } catch (e) {
      err.set(writeErrorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
