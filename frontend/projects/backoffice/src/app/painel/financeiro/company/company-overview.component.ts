import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { SquadKpiComponent } from '../../squad/ui/squad-kpi.component';
import { IconComponent } from '../../ui/icon.component';
import { PanelCardComponent } from '../../ui/panel-card.component';
import {
  ESTIMATED_SOURCES,
  SOURCE_LABEL,
  costsTotal,
  deductionsTotal,
  margin,
  money,
  monthLabel,
  monthResult,
  monthShort,
  outMoney,
  pctLabel,
  revenueTotal,
  signedMoney,
  sourcesOf,
  type CompanyFinance,
} from '../data/company-finance';
import type { CompanyView } from './company-finance.component';

const BAR_MAX_PX = 150;
const DAY_MS = 86_400_000;

/** Visão geral: o saldo da NexaGO agora, o resultado do mês e de onde veio a receita. */
@Component({
  selector: 'bo-company-overview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelCardComponent, SquadKpiComponent, IconComponent],
  template: `
    @for (s of data().stuckWithdrawals; track s.id) {
      <div class="alert" role="alert">
        <bo-icon name="alert" [size]="16" />
        <span><strong>Saque aprovado e não pago{{ s.approvedAt ? ' há ' + daysSince(s.approvedAt) + ' dias' : '' }}</strong> · {{ money(s.amountCents) }} ({{ s.kind }}). O PIX não saiu e o valor segue preso na conta.</span>
        <button type="button" class="bo-mini-btn push" (click)="openView.emit('thirdParty')">Ver</button>
      </div>
    }

    <bo-panel-card title="Saldo da nexaGO agora" kicker="Asaas − terceiros − provisões">
      <div class="steps">
        <div class="step"><span class="lbl">Saldo no Asaas</span><strong>{{ maybe(b().asaasCents) }}</strong><span class="hint">Tudo que está na conta</span></div>
        <div class="step"><span class="lbl">Dinheiro de terceiros</span><strong class="mute">{{ outMoney(b().thirdPartyCents) }}</strong><span class="hint">Caixas, carteiras e saques</span></div>
        <div class="step mid"><span class="lbl acc">Saldo da nexaGO</span><strong>{{ maybe(b().companyCents) }}</strong><span class="hint">É da empresa</span></div>
        <div class="step"><span class="lbl">Provisões</span><strong class="mute">{{ outMoney(b().provisionsCents) }}</strong><span class="hint">Cashback, Squad, devoluções</span></div>
        <div class="step free"><span class="lbl acc">Saldo livre</span><strong class="xl" [class.neg]="(b().freeCents ?? 0) < 0">{{ maybe(b().freeCents) }}</strong><span class="hint">Pode usar sem dever a ninguém</span></div>
      </div>
      <p class="note">
        @if (data().awaitingCents > 0) { Fora do saldo: {{ money(data().awaitingCents) }} em cartões aprovados a liberar (de organizadores e arenas). }
        <button type="button" class="link" (click)="openView.emit('thirdParty')">Ver de quem é cada real</button>
      </p>
    </bo-panel-card>

    @if (current(); as m) {
      <div class="kpis">
        <bo-squad-kpi [label]="'Receita bruta · ' + short(m.key)" [value]="money(revenue())" [hint]="sourceCount() + (sourceCount() === 1 ? ' fonte' : ' fontes')" />
        <bo-squad-kpi label="Deduções" [value]="outMoney(deductions())" hint="Cashback e NexaSquad" />
        <bo-squad-kpi label="Custos" [value]="outMoney(costs())" hint="Asaas, estoque e operação" />
        <bo-squad-kpi class="hl" label="Resultado do mês" [value]="signedMoney(result())" [hint]="'Margem de ' + pctLabel(marginOf())" />
      </div>

      <div class="cards">
        <bo-panel-card title="De onde veio a receita" [kicker]="monthName(m.key)">
          @for (s of sources(); track s.source) {
            <div class="src">
              <span class="name">{{ sourceLabel[s.source] }}@if (estimated.has(s.source)) { <span class="approx" title="Estimado: 5% do split">≈</span> }</span>
              <span class="track"><span class="fill" [style.width.%]="s.width"></span></span>
              <span class="num">{{ money(s.cents) }}</span>
              <span class="num dim">{{ pctLabel(s.share) }}</span>
            </div>
          } @empty {
            <p class="empty">Nenhuma receita registrada neste mês.</p>
          }
        </bo-panel-card>

        <bo-panel-card title="Resultado por mês" kicker="Receita − deduções − custos">
          <div class="bars" role="img" [attr.aria-label]="barsAria()">
            @for (bar of bars(); track bar.key) {
              <div class="col">
                <span class="v">{{ bar.label }}</span>
                <span class="bar" [class.on]="bar.current" [class.neg]="bar.negative" [style.height.px]="bar.height"></span>
                <span class="k">{{ bar.short }}</span>
              </div>
            }
          </div>
          <button type="button" class="link" (click)="openView.emit('result')">Abrir o resultado linha a linha</button>
        </bo-panel-card>
      </div>
    }

    @if (pendingCount() > 0) {
      <div class="pending" role="status">
        <bo-icon name="clock" [size]="16" />
        <span><strong>{{ pendingCount() }} {{ pendingCount() === 1 ? 'saque esperando' : 'saques esperando' }} aprovação</strong> · {{ money(pendingCents()) }}. O valor já está em "dinheiro de terceiros".</span>
        <button type="button" class="bo-mini-btn push" (click)="openWithdrawals.emit()">Ver saques</button>
      </div>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .alert, .pending { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-radius: var(--nx-r-3); font-size: 13px; line-height: 1.45; }
    .alert { background: rgba(255, 59, 48, 0.08); border: 1px solid rgba(255, 59, 48, 0.35); }
    .alert bo-icon { color: var(--nx-live); flex: none; }
    .pending { background: rgba(244, 197, 67, 0.07); border: 1px solid rgba(244, 197, 67, 0.28); }
    .pending bo-icon { color: var(--nx-pending); flex: none; }
    strong { font-family: var(--nx-font-display); }
    .push { margin-left: auto; flex: none; }
    .steps { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); border: 1px solid var(--nx-line); border-radius: var(--nx-r-3); overflow: hidden; margin-top: 4px; }
    .step { display: flex; flex-direction: column; gap: 6px; padding: 16px 18px; border-right: 1px solid var(--nx-line); min-width: 0; }
    .step:last-child { border-right: none; }
    .step strong { font-weight: 700; font-size: 21px; white-space: nowrap; }
    .step strong.xl { font-weight: 800; font-size: 25px; letter-spacing: -0.02em; }
    .mid { background: rgba(255, 106, 26, 0.06); }
    .free { background: rgba(255, 106, 26, 0.12); }
    .lbl { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--nx-text-dim); }
    .lbl.acc { color: var(--nx-orange-400); }
    .hint { font-size: 12px; color: var(--nx-text-dim); }
    .mute { color: var(--nx-text-mute); }
    .neg { color: var(--nx-live); }
    .note { margin: 12px 0 0; font-size: 12px; color: var(--nx-text-mute); }
    .link { background: none; border: none; padding: 0; color: var(--nx-orange-400); font: inherit; font-size: 12.5px; cursor: pointer; text-align: left; }
    .link:hover { color: var(--nx-orange-500); text-decoration: underline; }
    .kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
    .kpis .hl { background: rgba(255, 106, 26, 0.08); border-color: rgba(255, 106, 26, 0.35); }
    .cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
    .src { display: grid; grid-template-columns: 150px minmax(0, 1fr) 104px 48px; gap: 12px; align-items: center; padding: 7px 0; font-size: 13px; }
    .name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .approx { margin-left: 4px; font-family: var(--nx-font-mono); font-size: 11px; color: var(--nx-text-dim); }
    .track { height: 8px; border-radius: var(--nx-r-pill); background: var(--nx-surface-1); overflow: hidden; }
    .fill { display: block; height: 100%; border-radius: var(--nx-r-pill); background: var(--nx-orange-500); }
    .num { font-family: var(--nx-font-mono); font-size: 12.5px; text-align: right; white-space: nowrap; }
    .dim { color: var(--nx-text-dim); font-size: 11px; }
    .empty { margin: 8px 0; font-size: 12.5px; color: var(--nx-text-dim); }
    .bars { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 14px; align-items: end; height: 220px; margin: 6px 0 10px; }
    .col { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 6px; height: 100%; min-width: 0; }
    .v, .k { font-family: var(--nx-font-mono); font-size: 10.5px; color: var(--nx-text-mute); white-space: nowrap; }
    .k { color: var(--nx-text-dim); }
    .bar { display: block; width: 100%; max-width: 54px; border-radius: 6px 6px 2px 2px; background: var(--nx-surface-2); }
    .bar.on { background: var(--nx-orange-500); }
    .bar.neg { background: var(--nx-live); }
    @media (max-width: 1280px) {
      .steps { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .step { border-bottom: 1px solid var(--nx-line); }
      .free { grid-column: 1 / -1; }
      .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .cards { grid-template-columns: minmax(0, 1fr); }
    }
    @media (max-width: 760px) {
      .steps, .kpis { grid-template-columns: minmax(0, 1fr); }
      .step { border-right: none; }
      .src { grid-template-columns: minmax(0, 1fr) 96px 44px; }
      .track { display: none; }
    }
  `,
})
export class CompanyOverviewComponent {
  readonly data = input.required<CompanyFinance>();
  readonly openView = output<CompanyView>();
  readonly openWithdrawals = output<void>();

  protected readonly money = money;
  protected readonly outMoney = outMoney;
  protected readonly signedMoney = signedMoney;
  protected readonly pctLabel = pctLabel;
  protected readonly short = monthShort;
  protected readonly monthName = monthLabel;
  protected readonly sourceLabel = SOURCE_LABEL;
  protected readonly estimated = ESTIMATED_SOURCES;

  protected readonly b = computed(() => this.data().balance);
  /** O mês escolhido é o último da janela. */
  protected readonly current = computed(() => this.data().months.at(-1) ?? null);
  protected readonly revenue = computed(() => (this.current() ? revenueTotal(this.current()!) : 0));
  protected readonly deductions = computed(() => (this.current() ? deductionsTotal(this.current()!) : 0));
  protected readonly costs = computed(() => (this.current() ? costsTotal(this.current()!) : 0));
  protected readonly result = computed(() => (this.current() ? monthResult(this.current()!) : 0));
  protected readonly marginOf = computed(() => (this.current() ? margin(this.current()!) : null));

  protected readonly sources = computed(() => {
    const list = this.current() ? sourcesOf(this.current()!) : [];
    const max = Math.max(1, ...list.map((s) => Math.abs(s.cents)));
    return list.map((s) => ({ ...s, width: Math.max(2, (Math.abs(s.cents) / max) * 100) }));
  });
  protected readonly sourceCount = computed(() => this.sources().length);

  protected readonly bars = computed(() => {
    const months = this.data().months;
    const values = months.map(monthResult);
    const max = Math.max(1, ...values.map(Math.abs));
    return months.map((m, i) => ({
      key: m.key,
      short: monthShort(m.key),
      label: values[i] ? signedMoney(values[i]).replace(/,\d{2}$/, '') : '—',
      height: values[i] ? Math.max(6, Math.round((Math.abs(values[i]) / max) * BAR_MAX_PX)) : 3,
      negative: values[i] < 0,
      current: i === months.length - 1,
    }));
  });
  protected readonly barsAria = computed(() => `Resultado por mês: ${this.bars().map((b) => `${b.short} ${b.label}`).join(', ')}`);

  protected readonly pendingCount = computed(() => {
    const p = this.data().pendingWithdrawals;
    return p.organizer.count + p.arena.count + p.professor.count;
  });
  protected readonly pendingCents = computed(() => {
    const p = this.data().pendingWithdrawals;
    return p.organizer.cents + p.arena.cents + p.professor.cents;
  });

  protected maybe(cents: number | null): string {
    return cents == null ? '—' : signedMoney(cents);
  }

  protected daysSince(d: Date): number {
    return Math.max(0, Math.floor((Date.now() - d.getTime()) / DAY_MS));
  }
}
