import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CenterContextService } from '../../core/center-context.service';
import { writeErrorMessage } from '../../data/actions/actor';
import { CenterStore } from '../../data/center-store.service';
import { formatDayKey, formatInstant } from '../../domain/dates';
import { formatBRL } from '../../domain/money';
import type { BillingRun } from '../../domain/models';
import { IconComponent } from '../../ui/icon.component';
import { BannerComponent, PageHeaderComponent, SegmentedComponent } from '../../ui/kit';
import { BillingRunsService } from './billing-runs.service';
import { RUN_KIND_LABEL, cycleProgress, issueFailReasons, runBar, runDueDate, runLines } from './subscription-view';

const STEPS: [string, string][] = [
  ['D−3', 'Gera a cobrança do ciclo com o preço do contrato e avisa o pagador com o link'],
  ['D0', 'Vencimento · o pagamento confirmado pelo provedor aprova a cobrança'],
  ['D+1 →', 'Régua: avisos, pendência no check-in e suspensão conforme a política'],
  ['06:00', 'Todo dia: pausas que terminam, cancelamentos no fim do ciclo e pacotes concluídos'],
];

/** R5 — Rodada de cobrança: o que a execução diária das 06:00 fez em cada dia. */
@Component({
  selector: 'ct-billing-run',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, BannerComponent, SegmentedComponent, IconComponent, RouterLink, NgTemplateOutlet],
  template: `
    <ct-page-header [title]="run() ? 'Rodada de cobrança · ' + formatDayKey(run()!.date) : 'Rodada de cobrança'" [subtitle]="subtitle()">
      <a class="ct-ghost-btn" [routerLink]="['/centro', cid(), 'assinaturas']"><ct-icon name="chevron-left" [size]="14" /> Assinaturas</a>
      @if (tabs().length > 1) {
        <ct-segmented [options]="tabs()" [(value)]="picked" />
      }
    </ct-page-header>

    <div class="page">
      @if (run(); as r) {
        @if (!r.online) {
          <ct-banner tone="yellow" [inline]="true" title="Sem conta de recebimento conectada">
            Nesta rodada as cobranças nasceram sem link de pagamento. O pagamento é combinado com o aluno e a baixa é feita à mão no Financeiro.
          </ct-banner>
        }
        <div class="grid">
          <div class="ct-col">
            <div class="ct-card">
              <div class="ct-card-head"><div class="ct-grow"><div class="ct-kick">Idempotente · {{ r.runs === 1 ? '1 execução' : r.runs + ' execuções' }}</div><div class="ct-card-title">Resultado</div></div></div>
              @if (bar().length) {
                <div class="bar" role="img" [attr.aria-label]="barLabel()">
                  @for (b of bar(); track b.label) {
                    <span [class]="'seg ' + b.tone" [style.flex]="b.count" [attr.title]="b.label + ' · ' + b.count"></span>
                  }
                </div>
              }
              @for (l of lines(); track l.key) {
                <div class="ln" [class.zero]="l.count === 0">
                  <span [class]="'sw ' + l.tone"></span>
                  <span class="ct-grow ct-disp">{{ l.label }}</span>
                  <span class="n">{{ l.count }}</span>
                  <span class="c">{{ l.cents != null ? formatBRL(l.cents) : '—' }}</span>
                </div>
              }
              @if (reasons().length) {
                <div class="ct-kick" style="margin: 16px 0 8px">Motivos de “sem fatura online”</div>
                <div class="ct-filter-bar">
                  @for (m of reasons(); track m.reason) {
                    <span class="ct-chip">{{ m.reason }} · {{ m.count }}</span>
                  }
                </div>
              }
            </div>

            <div class="ct-card flush">
              <div class="ct-card-head"><div class="ct-grow"><div class="ct-kick">Por assinatura</div><div class="ct-card-title">O que aconteceu</div></div></div>
              @for (it of r.items; track $index) {
                <div class="it">
                  <span [class]="'ct-tag ' + KIND[it.kind][1]">{{ KIND[it.kind][0] }}</span>
                  <div class="ct-grow">
                    @if (subIds().has(it.subscriptionId)) {
                      <a class="nm" [routerLink]="['/centro', cid(), 'assinaturas', it.subscriptionId]">{{ it.name || 'Assinatura' }}</a>
                    } @else {
                      <span class="nm">{{ it.name || '—' }}</span>
                    }
                    @if (it.detail) {
                      <div class="ct-mono ct-ellipsis">{{ it.detail }}</div>
                    }
                  </div>
                  <span class="c">{{ it.cents ? formatBRL(it.cents) : '' }}</span>
                </div>
              } @empty {
                <div class="ct-empty">Nada a fazer nesta rodada.</div>
              }
            </div>
          </div>

          <div class="ct-col">
            <div class="ct-card">
              <div class="ct-card-head"><div class="ct-grow"><div class="ct-kick">Ao vivo · vencimento {{ formatDayKey(due()) }}</div><div class="ct-card-title">Cobranças do ciclo</div></div></div>
              <div class="ct-kv"><span>Aprovadas</span><span>{{ progress().approved }} · {{ formatBRL(progress().approvedCents) }}</span></div>
              <div class="ct-kv"><span>Pendentes</span><span>{{ progress().pending }}</span></div>
              @if (progress().other) {
                <div class="ct-kv"><span>Outras situações</span><span>{{ progress().other }}</span></div>
              }
              <div class="ct-kv"><span>Total do ciclo</span><span>{{ formatBRL(progress().totalCents) }}</span></div>
              <div class="ct-dim" style="margin-top: 8px">Atualiza sozinho quando o provedor confirma um pagamento ou alguém dá baixa no Financeiro.</div>
            </div>
            <ng-container *ngTemplateOutlet="aside" />
          </div>
        </div>
      } @else {
        <div class="grid">
          <div class="ct-card">
            <div class="ct-empty">
              @if (loading()) {
                <span class="ct-spinner light" aria-hidden="true"></span>
              } @else if (error()) {
                <span class="ct-error-text">{{ error() }}</span>
              } @else {
                Nenhuma rodada registrada ainda. A primeira rodada roda amanhã às 06:00.
              }
            </div>
          </div>
          <div class="ct-col"><ng-container *ngTemplateOutlet="aside" /></div>
        </div>
      }
    </div>

    <ng-template #aside>
      <div class="ct-card">
        <div class="ct-card-head"><div class="ct-grow"><div class="ct-kick">O que o sistema faz</div><div class="ct-card-title">Antes da rodada</div></div></div>
        @for (s of steps; track $index) {
          <div class="st"><span class="sd">{{ s[0] }}</span><span class="ct-grow ct-muted">{{ s[1] }}</span></div>
        }
      </div>
      <ct-banner tone="blue" [inline]="true" title="Cobrança duplicada é impossível">
        Cada cobrança tem um id único por assinatura e ciclo. Repetir a rodada ou receber o mesmo webhook duas vezes não gera segunda cobrança.
      </ct-banner>
    </ng-template>
  `,
  styles: `
    .page { padding: 20px var(--ct-gutter) 26px; display: flex; flex-direction: column; gap: 16px; }
    .grid { display: grid; grid-template-columns: minmax(0, 1fr) 400px; gap: 16px; align-items: start; }
    @media (max-width: 1100px) { .grid { grid-template-columns: 1fr; } }
    .bar { display: flex; height: 12px; gap: 2px; border-radius: 6px; overflow: hidden; margin-bottom: 10px; }
    .seg, .sw { background: var(--nx-surface-2); }
    .sw { width: 9px; height: 9px; border-radius: 3px; flex: none; }
    .green { background: var(--nx-win); } .yellow { background: var(--nx-pending); } .red { background: var(--nx-live); }
    .blue { background: var(--nx-blue); } .orange { background: var(--nx-orange-500); }
    .ln { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-top: 1px solid var(--nx-line); }
    .ln.zero { opacity: 0.5; }
    .n, .c { font-family: var(--nx-font-mono); font-size: 12px; font-weight: 700; color: var(--nx-text); text-align: right; white-space: nowrap; }
    .n { width: 40px; }
    .c { min-width: 90px; color: var(--nx-text-mute); }
    .it { display: flex; align-items: center; gap: 12px; padding: 10px 16px; border-top: 1px solid var(--nx-line); }
    .nm { font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; color: var(--nx-text); text-decoration: none; }
    a.nm:hover { color: var(--nx-orange-400); }
    .st { display: flex; gap: 12px; padding: 9px 0; border-top: 1px solid var(--nx-line); }
    .st:first-of-type { border-top: none; }
    .sd { width: 56px; flex: none; font-family: var(--nx-font-mono); font-size: 10.5px; font-weight: 700; color: var(--nx-orange-400); }
  `,
})
export class BillingRunComponent {
  readonly centerId = input('');

  protected readonly ctx = inject(CenterContextService);
  protected readonly store = inject(CenterStore);
  private readonly service = inject(BillingRunsService);

  protected readonly KIND = RUN_KIND_LABEL;
  protected readonly steps = STEPS;
  protected readonly formatBRL = formatBRL;
  protected readonly formatDayKey = formatDayKey;

  protected readonly cid = computed(() => this.centerId() || this.ctx.activeCenterId() || '');
  protected readonly runs = signal<BillingRun[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly picked = signal('');

  protected readonly tabs = computed(() =>
    [...this.runs()].reverse().map((r) => ({ value: r.id, label: formatDayKey(r.date) })),
  );
  protected readonly run = computed(() => this.runs().find((r) => r.id === this.picked()) ?? this.runs()[0] ?? null);
  protected readonly lines = computed(() => (this.run() ? runLines(this.run()!) : []));
  protected readonly bar = computed(() => (this.run() ? runBar(this.run()!) : []));
  protected readonly barLabel = computed(() => this.bar().map((b) => `${b.label}: ${b.count}`).join(', '));
  protected readonly reasons = computed(() => (this.run() ? issueFailReasons(this.run()!) : []));
  protected readonly due = computed(() => (this.run() ? runDueDate(this.run()!.date) : ''));
  protected readonly progress = computed(() => cycleProgress(this.store.invoices(), this.due()));
  protected readonly subIds = computed(() => new Set(this.store.subscriptions().map((s) => s.id)));
  protected readonly subtitle = computed(() => {
    const r = this.run();
    if (!r) {
      return 'Execução automática todo dia às 06:00';
    }
    return `Execução automática 06:00 · rodou ${formatInstant(r.ranAt, this.ctx.center()?.timezone)} · ciclos que vencem em ${formatDayKey(this.due())}`;
  });

  constructor() {
    effect(() => {
      const id = this.cid();
      if (id) {
        untracked(() => void this.load(id));
      }
    });
  }

  private async load(centerId: string): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const runs = await this.service.latest(centerId);
      this.runs.set(runs);
      this.picked.set(runs[0]?.id ?? '');
    } catch (err) {
      this.error.set(writeErrorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }
}
