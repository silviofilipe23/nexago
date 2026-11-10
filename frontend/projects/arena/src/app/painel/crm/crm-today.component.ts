import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AvatarComponent } from '../ui/avatar.component';
import { PillComponent } from '../ui/pill.component';
import {
  QUEUES,
  contactLine,
  money,
  offerMessage,
  patternLabel,
  queueDetail,
  type CrmCustomer,
  type CrmQueueId,
  type CrmQueueItem,
} from './crm.model';
import { CrmUiService } from './crm-ui.service';
import { CrmStore } from './crm.store';

interface QueueRow {
  item: CrmQueueItem;
  customer: CrmCustomer;
}

/** Aba Hoje: receita recorrente, dinheiro em risco, as 4 filas do time e quem está pronto pra plano. */
@Component({
  selector: 'ar-crm-today',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvatarComponent, PillComponent],
  styleUrls: ['./crm.scss'],
  template: `
    @if (store.overview(); as o) {
      <section class="kpis" aria-label="Resumo">
        <div class="kpi hero">
          <div class="label">Receita recorrente</div>
          <div class="k-v">{{ money(o.kpis.mrrReais) }}<small>/mês</small></div>
          <div class="k-s">
            @if (mrrDelta(); as d) { <span [class.good]="d > 0" [class.warn]="d < 0">{{ d > 0 ? '▲' : '▼' }} {{ pct(d) }}</span> vs. mês passado · }
            {{ o.kpis.members }} mensalista{{ o.kpis.members === 1 ? '' : 's' }}
          </div>
          <div class="spark" aria-hidden="true">
            @for (m of o.kpis.mrrSeries; track m.month; let last = $last) {
              <i [class.last]="last" [style.height.%]="barHeight(m.mrrReais)"></i>
            }
          </div>
        </div>
        <div class="kpi">
          <div class="label">Dinheiro em risco</div>
          <div class="k-v" [class.warn]="o.kpis.atRiskReais > 0">{{ money(o.kpis.atRiskReais) }}</div>
          <div class="k-s">{{ o.kpis.atRiskCount }} cliente{{ o.kpis.atRiskCount === 1 ? '' : 's' }} · atraso, saída ou sumiço</div>
          <div class="meter" aria-hidden="true"><i class="y" [style.width.%]="ratio(o.kpis.atRiskReais, o.kpis.mrrReais)"></i></div>
        </div>
        <div class="kpi">
          <div class="label">Renovação · 90 dias</div>
          <div class="k-v">{{ o.kpis.renewalRate90d === null ? '—' : o.kpis.renewalRate90d + '%' }}</div>
          <div class="k-s">{{ o.kpis.ended90d === 0 ? 'Nenhum contrato terminou ainda' : o.kpis.renewed90d + ' de ' + o.kpis.ended90d + ' contratos renovados' }}</div>
          <div class="meter" aria-hidden="true"><i [style.width.%]="o.kpis.renewalRate90d ?? 0"></i></div>
        </div>
        <div class="kpi">
          <div class="label">Prontos pra plano</div>
          <div class="k-v">{{ o.kpis.convertCount }}</div>
          <div class="k-s"><span class="good">+{{ money(o.kpis.convertPotentialReais) }}/mês</span> se converterem</div>
          <div class="meter" aria-hidden="true"><i class="o" [style.width.%]="ratio(o.kpis.convertPotentialReais, o.kpis.mrrReais + o.kpis.convertPotentialReais)"></i></div>
        </div>
      </section>

      <div class="cols">
        <section class="card" aria-labelledby="fila-t">
          <div class="head-row">
            <div>
              <h2 class="card-title" id="fila-t">Fila do time</h2>
              <p class="card-desc">Quem precisa de uma mensagem hoje. Registrou o contato, o cliente desce na fila.</p>
            </div>
          </div>
          <div class="queues" role="tablist" aria-label="Filas">
            @for (q of queues; track q.id) {
              <button type="button" class="q" role="tab" [class.on]="queue() === q.id" [attr.aria-selected]="queue() === q.id" (click)="queue.set(q.id)">
                <span class="q-top"><span class="q-n">{{ o.queues[q.id].length }}</span><span class="dot" [style.background]="q.color"></span></span>
                <span class="q-t">{{ q.label }}</span>
                <span class="q-s">{{ queueHint(q.id) }}</span>
              </button>
            }
          </div>
          <div class="list">
            @for (r of rows(); track r.customer.key) {
              <div class="row" [class.done]="r.item.contactedRecently">
                <button type="button" class="who" (click)="ui.openCustomer(r.customer.key)">
                  <ar-avatar [name]="r.customer.name" [photoUrl]="r.customer.photoUrl" [size]="40" />
                  <span class="who-t">
                    <span class="name">{{ r.customer.name }}</span>
                    <span class="sub">{{ detail(r) }}</span>
                    <span class="contact">{{ contactLine(r.customer.lastContact, store.today()) }}</span>
                  </span>
                </button>
                <span class="flag">
                  @switch (queue()) {
                    @case ('overdue') { <ar-pill tone="red">{{ r.customer.contract?.daysLate }} dias de atraso</ar-pill> }
                    @case ('absent') { <ar-pill tone="dim">{{ r.customer.daysSinceVisit ?? '—' }} dias sem jogar</ar-pill> }
                    @case ('notRenewed') { <ar-pill tone="orange">Não renovou</ar-pill> }
                    @default { <ar-pill tone="yellow">{{ r.item.kind === 'term_end' ? 'Termina' : 'Vence' }} {{ weekday(r.item.date) }}</ar-pill> }
                  }
                </span>
                <span class="amt">
                  {{ money(r.item.amountReais) }}
                  @if (queue() === 'overdue' && r.customer.contract; as v) {
                    <small>{{ v.overdueCount }} {{ v.overdueCount === 1 ? 'parcela' : 'parcelas' }}</small>
                  }
                </span>
                <span class="acts">
                  <button type="button" class="btn wa" [disabled]="!r.customer.whatsapp" [attr.title]="r.customer.whatsapp ? null : 'Sem telefone cadastrado'" (click)="ui.queueWhatsapp(queue(), r.customer)">WhatsApp</button>
                  @if (ui.canWrite()) {
                    @switch (queue()) {
                      @case ('overdue') {
                        @if (r.customer.contract?.source === 'contract') {
                          <button type="button" class="btn" (click)="ui.paymentFor.set(r.customer)">Registrar pagamento</button>
                        } @else {
                          <button type="button" class="btn" (click)="ui.openCustomer(r.customer.key)">Ver plano</button>
                        }
                      }
                      @case ('notRenewed') { <button type="button" class="btn" (click)="ui.openCustomer(r.customer.key)">Renovar</button> }
                      @default { <button type="button" class="btn" (click)="ui.openCustomer(r.customer.key)">Ficha</button> }
                    }
                  }
                </span>
              </div>
            } @empty {
              <p class="state empty">{{ emptyText() }}</p>
            }
          </div>
          <p class="tip">O WhatsApp abre com a mensagem pronta pra fila: cobrança gentil, convite pra renovar ou "sentimos sua falta". O contato fica registrado na ficha.</p>
        </section>

        <div class="stack">
          <section class="card" aria-labelledby="conv-t">
            <div class="head-row">
              <h2 class="card-title" id="conv-t">Prontos pra virar mensalista</h2>
              @if (o.queues.convert.length > 3) { <span class="label">+{{ o.queues.convert.length - 3 }}</span> }
            </div>
            <p class="card-desc">Avulsos que já jogam no mesmo horário toda semana.</p>
            @for (c of topOpportunities(); track c.key) {
              <div class="opp">
                <button type="button" class="who" (click)="ui.openCustomer(c.key)">
                  <ar-avatar [name]="c.name" [photoUrl]="c.photoUrl" [size]="36" />
                  <span class="who-t">
                    <span class="name">{{ c.name }}</span>
                    <span class="sub">{{ c.conversion?.avulso90d }} reservas em 90 dias · {{ money(c.conversion?.avgMonthlyReais ?? 0) }}/mês</span>
                  </span>
                </button>
                <div class="opp-mid">
                  @if (c.pattern.length) { <span class="pattern">{{ patternLabel(c.pattern) }}</span> }
                  <span class="weeks" [attr.aria-label]="hits(c) + ' das últimas 8 semanas'">
                    @for (w of c.weekHits; track $index) { <i [class.on]="w"></i> }
                  </span>
                </div>
                <div class="opp-f">
                  <span class="sub">
                    @if (c.conversion?.suggestion; as s) {
                      {{ s.planName }}: @if (s.savingsReais > 0) { <b class="good">economiza {{ money(round(s.savingsReais)) }}/mês</b> } @else { garante o horário }
                    } @else { Sem plano de horário parecido }
                  </span>
                  <button type="button" class="btn primary" (click)="offer(c)">Oferecer</button>
                </div>
              </div>
            } @empty {
              <p class="state empty">Ninguém ainda: avulso com 6+ reservas em 90 dias e 4+ semanas ativas aparece aqui.</p>
            }
          </section>

          <section class="card" aria-labelledby="meta-t">
            <h2 class="card-title" id="meta-t">Novos mensalistas em {{ monthName() }}</h2>
            <div class="goal">
              <b>{{ o.kpis.newMembersThisMonth }} <span>de {{ o.kpis.monthlyGoal }}</span></b>
              <span class="sub"><b class="good">+{{ money(o.kpis.newMembersReaisThisMonth) }}/mês</b> recorrente</span>
            </div>
            <div class="steps" aria-hidden="true">
              @for (s of goalSteps(); track $index) { <i [class.on]="s"></i> }
            </div>
            <p class="card-desc">{{ o.kpis.funnel.offered }} ofertas em 90 dias · {{ o.kpis.funnel.converted }} viraram mensalista</p>
            @if (ui.canWrite()) {
              <label class="goal-edit">Meta do mês
                <input type="number" min="0" max="500" [value]="o.kpis.monthlyGoal" (change)="saveGoal($event)" />
              </label>
            }
          </section>
        </div>
      </div>
    }
  `,
  styles: `
    @use 'breakpoints' as ar;
    :host { display: flex; flex-direction: column; gap: 18px; }
    .kpis { display: grid; grid-template-columns: 1.25fr 1fr 1fr 1fr; gap: 14px; }
    .kpi { background: var(--nx-surface-0); border: 1px solid var(--nx-line); border-radius: 16px; padding: 18px 20px; }
    .kpi.hero { background: radial-gradient(120% 140% at 100% 0%, rgba(255,106,26,.2), rgba(255,106,26,0) 60%), var(--nx-surface-0); border-color: rgba(255,106,26,.35); }
    .k-v { font-family: var(--nx-font-display); font-weight: 700; font-size: 30px; margin-top: 8px; letter-spacing: -0.02em; color: var(--nx-text); }
    .k-v small { font-size: 14px; color: var(--nx-text-dim); }
    .k-s { font-size: 12px; color: var(--nx-text-mute); margin-top: 6px; }
    .spark { display: flex; align-items: flex-end; gap: 4px; height: 34px; margin-top: 12px; }
    .spark i { flex: 1; background: rgba(255,106,26,.35); border-radius: 3px; min-height: 3px; }
    .spark i.last { background: var(--nx-orange-500); }
    .meter { height: 6px; border-radius: 6px; background: var(--nx-surface-2); margin-top: 12px; overflow: hidden; }
    .meter i { display: block; height: 100%; background: var(--nx-win); border-radius: 6px; }
    .meter i.y { background: var(--nx-pending); }
    .meter i.o { background: var(--nx-orange-500); }
    .cols { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 18px; align-items: start; }
    .stack { display: flex; flex-direction: column; gap: 18px; }
    .head-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
    .queues { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 16px; }
    .q { display: flex; flex-direction: column; gap: 6px; text-align: left; padding: 14px; border-radius: 12px; background: var(--nx-surface-1); border: 1px solid var(--nx-line); color: var(--nx-text); font: inherit; cursor: pointer; }
    .q.on { border-color: var(--nx-orange-500); background: rgba(255,106,26,.08); }
    .q-top { display: flex; justify-content: space-between; align-items: center; }
    .q-n { font-family: var(--nx-font-display); font-weight: 700; font-size: 26px; }
    .q-t { font-size: 12.5px; font-weight: 600; }
    .q-s { font-family: var(--nx-font-mono); font-size: 10px; color: var(--nx-text-dim); }
    .dot { width: 8px; height: 8px; border-radius: 50%; }
    .list { margin-top: 12px; }
    .row { display: grid; grid-template-columns: minmax(0, 1.6fr) auto 96px auto; gap: 14px; align-items: center; padding: 13px 0; border-top: 1px solid var(--nx-line); }
    .row.done { opacity: .55; }
    .who { display: flex; align-items: center; gap: 12px; min-width: 0; background: none; border: none; padding: 0; color: inherit; font: inherit; text-align: left; cursor: pointer; }
    .who-t { display: flex; flex-direction: column; min-width: 0; }
    .contact { font-size: 11.5px; color: var(--nx-text-dim); margin-top: 5px; }
    .amt { font-family: var(--nx-font-display); font-weight: 700; font-size: 15px; text-align: right; color: var(--nx-text); }
    .amt small { display: block; font-family: var(--nx-font-mono); font-size: 9.5px; color: var(--nx-live); font-weight: 500; }
    .acts { display: flex; gap: 8px; justify-content: flex-end; }
    .empty { padding: 18px 0 4px; }
    .tip { margin: 14px 0 0; padding: 12px 14px; border-radius: 10px; background: var(--nx-surface-1); border: 1px solid var(--nx-line); font-size: 12.5px; color: var(--nx-text-mute); line-height: 1.5; }
    .opp { display: flex; flex-direction: column; gap: 10px; padding: 14px 0; border-top: 1px solid var(--nx-line); margin-top: 12px; }
    .opp + .opp { margin-top: 0; }
    .opp-mid { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .opp-f { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
    .goal { display: flex; justify-content: space-between; align-items: baseline; margin-top: 10px; }
    .goal > b { font-family: var(--nx-font-display); font-size: 28px; color: var(--nx-text); }
    .goal > b span { font-size: 15px; color: var(--nx-text-dim); }
    .steps { display: flex; gap: 6px; margin-top: 12px; }
    .steps i { flex: 1; height: 8px; border-radius: 4px; background: var(--nx-surface-2); }
    .steps i.on { background: var(--nx-orange-500); }
    .goal-edit { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 12px; font-size: 12px; color: var(--nx-text-dim); }
    .goal-edit input { width: 72px; height: 32px; border-radius: 8px; background: var(--nx-surface-1); border: 1px solid var(--nx-line-strong); color: var(--nx-text); font-family: var(--nx-font-mono); padding: 0 8px; }
    @include ar.below(lg) {
      .kpis { grid-template-columns: 1fr 1fr; }
      .cols { grid-template-columns: minmax(0, 1fr); }
    }
    @include ar.below(md) {
      .kpis, .queues { grid-template-columns: 1fr 1fr; }
      .k-v { font-size: 22px; }
      .k-v small { display: none; }
      .row { grid-template-columns: minmax(0, 1fr) auto; }
      .flag { display: none; }
      .acts { grid-column: 1 / -1; justify-content: flex-start; }
    }
  `,
})
export class CrmTodayComponent {
  protected readonly store = inject(CrmStore);
  protected readonly ui = inject(CrmUiService);

  protected readonly queues = QUEUES;
  protected readonly money = money;
  protected readonly patternLabel = patternLabel;
  protected readonly contactLine = contactLine;
  protected readonly round = Math.round;

  protected readonly queue = signal<CrmQueueId>(this.firstNonEmptyQueue());

  protected readonly rows = computed<QueueRow[]>(() => {
    const o = this.store.overview();
    const byKey = this.store.byKey();
    return (o?.queues[this.queue()] ?? [])
      .map((item) => ({ item, customer: byKey.get(item.key)! }))
      .filter((r) => !!r.customer);
  });

  protected readonly topOpportunities = computed(() => {
    const byKey = this.store.byKey();
    return (this.store.overview()?.queues.convert ?? []).slice(0, 3).map((i) => byKey.get(i.key)).filter((c): c is CrmCustomer => !!c);
  });

  protected readonly mrrDelta = computed(() => {
    const s = this.store.overview()?.kpis.mrrSeries ?? [];
    const prev = s.at(-2)?.mrrReais ?? 0;
    const cur = s.at(-1)?.mrrReais ?? 0;
    return prev > 0 && cur !== prev ? (cur - prev) / prev : null;
  });

  protected readonly goalSteps = computed(() => {
    const k = this.store.overview()?.kpis;
    const goal = Math.min(Math.max(k?.monthlyGoal ?? 0, 1), 20);
    return Array.from({ length: goal }, (_, i) => i < (k?.newMembersThisMonth ?? 0));
  });

  protected readonly monthName = computed(() =>
    new Date(`${this.store.today()}T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'long', timeZone: 'UTC' }),
  );

  protected readonly emptyText = computed(() => {
    switch (this.queue()) {
      case 'overdue': return 'Ninguém em atraso. Caixa em dia!';
      case 'dueThisWeek': return 'Nenhuma mensalidade ou contrato vencendo nos próximos 7 dias.';
      case 'notRenewed': return 'Nenhum contrato terminou sem renovação nos últimos 60 dias.';
      default: return 'Todos os mensalistas jogaram nos últimos 14 dias.';
    }
  });

  private firstNonEmptyQueue(): CrmQueueId {
    const q = this.store.overview()?.queues;
    if (!q) return 'overdue';
    return (['overdue', 'dueThisWeek', 'notRenewed', 'absent'] as const).find((id) => q[id].length > 0) ?? 'overdue';
  }

  protected queueHint(id: CrmQueueId): string {
    const items = this.store.overview()?.queues[id] ?? [];
    const total = items.reduce((s, i) => s + i.amountReais, 0);
    switch (id) {
      case 'dueThisWeek': return `${money(total)} a receber`;
      case 'notRenewed': return `${money(total)}/mês saindo`;
      case 'overdue': return `${money(total)} em atraso`;
      default: return '14+ dias sem jogar';
    }
  }

  protected detail(r: QueueRow): string {
    return queueDetail(this.queue(), r.customer, r.item);
  }

  protected weekday(date: string | null | undefined): string {
    if (!date) return '';
    if (date === this.store.today()) return 'hoje';
    return new Date(`${date}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'UTC' }).replace('.', '');
  }

  protected barHeight(v: number): number {
    const max = Math.max(...(this.store.overview()?.kpis.mrrSeries.map((m) => m.mrrReais) ?? [0]), 1);
    return Math.max(6, (v / max) * 100);
  }

  protected ratio(part: number, whole: number): number {
    return whole > 0 ? Math.min(100, (part / whole) * 100) : 0;
  }

  protected pct(d: number): string {
    return `${Math.abs(d * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
  }

  protected hits(c: CrmCustomer): number {
    return c.weekHits.filter(Boolean).length;
  }

  protected offer(c: CrmCustomer): void {
    // Sem telefone, a ficha mostra o contrato pronto para fechar no balcão.
    if (!c.whatsapp) return this.ui.openCustomer(c.key);
    void this.ui.whatsapp(c, offerMessage(c, this.store.arenaName(), 'savings'), 'offer');
  }

  protected async saveGoal(event: Event): Promise<void> {
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(value) || value < 0) return;
    try {
      await this.store.saveGoal(Math.round(value));
      this.ui.flash('Meta atualizada.');
    } catch (err) {
      this.ui.flash(err instanceof Error ? err.message : 'Não foi possível salvar a meta.');
    }
  }
}
