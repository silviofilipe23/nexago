import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { formatCount, sourceLabel, type BenefitEvent } from './data/benefit-metrics';
import { formatCents, type BenefitRedemption } from './data/benefit-redemption';
import { clubErrorMessage } from './data/club-errors';
import { ClubRepository } from './data/club.repository';
import type { Partner } from './data/partner';
import { dateInputValue } from './data/partner-premium';
import { partnerReport, reportRange, shortDay, type PartnerReport } from './data/partner-report';

type LoadState = 'loading' | 'ok' | 'missing' | 'error';

const PRESETS = [
  { days: 30, label: '30 dias' },
  { days: 90, label: '90 dias' },
  { days: 180, label: '6 meses' },
] as const;

/**
 * Relatório do patrocinador (`/painel/clube/parceiros/:id/relatorio`): alcance, visualizações,
 * cliques, cupom copiado, leads e resgates confirmados num período, com série por semana e origens.
 * "Imprimir / salvar PDF" usa o diálogo do navegador; na impressão só a folha aparece, em claro.
 */
@Component({
  selector: 'bo-partner-report',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, NgTemplateOutlet, PanelShellComponent, PageHeaderComponent, IconComponent],
  template: `
    <bo-panel-shell>
      <bo-page-header title="Relatório do patrocinador" [subtitle]="'Clube de Vantagens › ' + (partner()?.name ?? partnerId)">
        <a class="bo-mini-btn" [routerLink]="['/painel/clube/parceiros', partnerId]">Voltar ao parceiro</a>
        <button type="button" class="bo-mini-btn bo-mini-btn-primary" [disabled]="state() !== 'ok'" (click)="print()">
          <bo-icon name="printer" [size]="13" /> Imprimir / salvar PDF
        </button>
      </bo-page-header>

      <div class="body">
        <div class="bar">
          <div class="chips" role="group" aria-label="Período rápido">
            @for (p of presets; track p.days) {
              <button type="button" class="bo-chip" [class.active]="preset() === p.days" [attr.aria-pressed]="preset() === p.days" (click)="usePreset(p.days)">
                {{ p.label }}
              </button>
            }
          </div>
          <label class="date">De <input type="date" class="bo-input" [value]="from()" [max]="to()" (change)="setFrom(value($event))" /></label>
          <label class="date">até <input type="date" class="bo-input" [value]="to()" [min]="from()" (change)="setTo(value($event))" /></label>
        </div>
        @if (rangeError(); as e) {
          <div class="bo-alert" role="alert"><bo-icon name="alert" [size]="16" /><span>{{ e }}</span></div>
        }

        @switch (state()) {
          @case ('loading') {
            <div class="skeleton" aria-hidden="true"></div>
          }
          @case ('missing') {
            <div class="empty">
              <p>Parceiro não encontrado</p>
              <a class="bo-mini-btn" routerLink="/painel/clube">Voltar ao clube</a>
            </div>
          }
          @case ('error') {
            <div class="bo-alert" role="alert">
              <bo-icon name="alert" [size]="16" />
              <span>{{ error() }}</span>
              <button type="button" class="bo-mini-btn push" (click)="load()">Tentar de novo</button>
            </div>
          }
          @default {
            <ng-container [ngTemplateOutlet]="sheet" />
          }
        }
      </div>
    </bo-panel-shell>

    @if (state() === 'ok') {
      <div class="print-only"><ng-container [ngTemplateOutlet]="sheet" /></div>
    }

    <ng-template #sheet>
      @if (report(); as r) {
        <article class="sheet">
          <header class="sheet-head">
            <div>
              <div class="kicker">NexaGO · Clube de Vantagens</div>
              <h1>{{ partner()?.name }}</h1>
              <div class="period">{{ periodLabel() }}</div>
            </div>
            @if (partner()?.brandColor; as color) {
              <span class="brand" [style.background]="color" aria-hidden="true"></span>
            }
          </header>

          <section class="kpis" aria-label="Resumo">
            <div class="kpi"><strong>{{ n(r.reach) }}</strong><span>Alcance</span><small>atletas únicos que viram</small></div>
            <div class="kpi"><strong>{{ n(r.views) }}</strong><span>Visualizações</span><small>aberturas da página do parceiro</small></div>
            <div class="kpi"><strong>{{ n(r.clicks) }}</strong><span>Cliques no botão</span><small>{{ n(r.clickers) }} atleta{{ r.clickers === 1 ? '' : 's' }}</small></div>
            <div class="kpi"><strong>{{ n(r.codeCopies) }}</strong><span>Cupom copiado</span><small>toques em copiar</small></div>
            <div class="kpi"><strong>{{ n(r.leads) }}</strong><span>Leads</span><small>com consentimento, 1 por atleta</small></div>
            <div class="kpi accent">
              <strong>{{ n(r.confirmedRedemptions) }}</strong><span>Resgates confirmados</span>
              <small>{{ r.confirmedRedemptions > 0 ? money(r.confirmedDiscountCents) + ' em desconto' : 'informados pelo parceiro' }}</small>
            </div>
          </section>

          <section class="block">
            <h2>Por semana</h2>
            <div class="chart" role="img" [attr.aria-label]="'Visualizações por semana, de ' + periodLabel()">
              @for (w of r.weeks; track w.start.getTime()) {
                <div class="col">
                  <span class="val">{{ w.views > 0 ? n(w.views) : '' }}</span>
                  <span class="barwrap"><span class="bar-fill" [style.height.%]="barHeight(w.views)"></span></span>
                  <span class="lbl">{{ day(w.start) }}</span>
                </div>
              }
            </div>
            <div class="wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Semana de</th>
                    <th scope="col" class="n">Alcance</th>
                    <th scope="col" class="n">Visualizações</th>
                    <th scope="col" class="n">Cliques</th>
                    <th scope="col" class="n">Cupom copiado</th>
                    <th scope="col" class="n">Leads</th>
                    <th scope="col" class="n">Resgates</th>
                  </tr>
                </thead>
                <tbody>
                  @for (w of r.weeks; track w.start.getTime()) {
                    <tr>
                      <td>{{ day(w.start) }}</td>
                      <td class="n">{{ n(w.reach) }}</td>
                      <td class="n">{{ n(w.views) }}</td>
                      <td class="n">{{ n(w.clicks) }}</td>
                      <td class="n">{{ n(w.codeCopies) }}</td>
                      <td class="n">{{ n(w.leads) }}</td>
                      <td class="n">{{ n(w.redemptions) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <p class="foot">Alcance e leads da semana são atletas únicos naquela semana (a soma das semanas pode passar do total do período).</p>
          </section>

          <section class="block">
            <h2>De onde vieram</h2>
            @if (r.sources.length === 0) {
              <p class="foot">Nenhuma visita no período.</p>
            } @else {
              <table>
                <thead>
                  <tr>
                    <th scope="col">Origem</th>
                    <th scope="col" class="n">Visualizações</th>
                    <th scope="col" class="n">Cliques</th>
                    <th scope="col" class="n">Atletas</th>
                  </tr>
                </thead>
                <tbody>
                  @for (s of r.sources; track s.source) {
                    <tr>
                      <td>{{ source(s.source) }}</td>
                      <td class="n">{{ n(s.views) }}</td>
                      <td class="n">{{ n(s.clicks) }}</td>
                      <td class="n">{{ n(s.athletes) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            }
          </section>

          <p class="method">
            Números gravados pelo servidor da NexaGO, com o atleta identificado: o mesmo toque repetido em 30 segundos conta uma vez.
            Resgates confirmados são os pedidos que o parceiro informou e que a NexaGO ligou ao código de um atleta. Gerado em
            {{ generatedAt() }}.
          </p>
        </article>
      }
    </ng-template>
  `,
  styles: `
    .body { padding: 20px 32px 40px; display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    @media (max-width: 760px) { .body { padding: 16px; } }
    .bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .chips { display: flex; gap: 8px; flex-wrap: wrap; margin-right: auto; }
    .date { display: inline-flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--nx-text-mute); }
    .date .bo-input { width: auto; height: 36px; }
    .bo-alert { margin: 0; align-items: center; }
    .push { margin-left: auto; flex: none; }
    .skeleton { height: 420px; border-radius: var(--nx-r-4); background: var(--nx-surface-1); opacity: 0.5; }
    .empty { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 60px 0; color: var(--nx-text); }
    .sheet { display: flex; flex-direction: column; gap: 18px; padding: 22px 24px; border-radius: var(--nx-r-4); border: 1px solid var(--nx-line); background: var(--nx-surface-0); }
    .sheet-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
    .kicker { font-family: var(--nx-font-mono); font-size: 10px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    h1 { margin: 4px 0 2px; font-family: var(--nx-font-display); font-weight: 800; font-size: 24px; color: var(--nx-text); }
    .period { font-size: 13px; color: var(--nx-text-mute); }
    .brand { width: 44px; height: 44px; border-radius: 12px; flex: none; }
    .kpis { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 10px; }
    @media (max-width: 1100px) { .kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
    @media (max-width: 560px) { .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    .kpi { display: flex; flex-direction: column; gap: 2px; padding: 12px 14px; border-radius: var(--nx-r-3); border: 1px solid var(--nx-line); background: var(--nx-surface-1); }
    .kpi strong { font-family: var(--nx-font-display); font-size: 24px; color: var(--nx-text); }
    .kpi span { font-size: 12.5px; color: var(--nx-text); }
    .kpi small { font-size: 11px; color: var(--nx-text-dim); }
    .kpi.accent { border-color: rgba(43, 209, 126, 0.45); }
    .block { display: flex; flex-direction: column; gap: 10px; }
    h2 { margin: 0; font-family: var(--nx-font-display); font-weight: 700; font-size: 15px; color: var(--nx-text); }
    .chart { display: flex; align-items: flex-end; gap: 6px; height: 150px; padding: 8px 0; border-bottom: 1px solid var(--nx-line); overflow-x: auto; }
    .col { flex: 1; min-width: 28px; height: 100%; display: flex; flex-direction: column; align-items: center; gap: 4px; }
    .val { font-family: var(--nx-font-mono); font-size: 10px; color: var(--nx-text-mute); height: 12px; }
    .barwrap { flex: 1; width: 100%; max-width: 36px; display: flex; align-items: flex-end; }
    .bar-fill { display: block; width: 100%; min-height: 2px; border-radius: 4px 4px 0 0; background: var(--nx-orange-500); }
    .lbl { font-family: var(--nx-font-mono); font-size: 9.5px; color: var(--nx-text-dim); }
    .wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); padding: 8px 10px; border-bottom: 1px solid var(--nx-line); white-space: nowrap; }
    td { padding: 9px 10px; border-bottom: 1px solid var(--nx-line); font-size: 12.5px; color: var(--nx-text-mute); }
    tr:last-child td { border-bottom: none; }
    .n { text-align: right; font-family: var(--nx-font-mono); }
    .foot, .method { margin: 0; font-size: 11.5px; line-height: 1.5; color: var(--nx-text-dim); }

    .print-only { display: none; }
    @media print {
      bo-panel-shell { display: none !important; }
      .print-only {
        display: block;
        --nx-text: #0a0a0a;
        --nx-text-mute: #333;
        --nx-text-dim: #666;
        --nx-line: #d4d4d8;
        --nx-surface-0: #fff;
        --nx-surface-1: #f6f6f7;
        background: #fff;
      }
      .sheet { border: none; padding: 0; gap: 14px; }
      .kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .block, .kpi, tr { break-inside: avoid; }
      .bar-fill { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .brand { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  `,
})
export class PartnerReportComponent {
  private readonly repository = inject(ClubRepository);

  protected readonly partnerId = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';
  protected readonly presets = PRESETS;

  protected readonly state = signal<LoadState>('loading');
  protected readonly error = signal('');
  protected readonly partner = signal<Partner | null>(null);
  private readonly events = signal<BenefitEvent[]>([]);
  private readonly redemptions = signal<BenefitRedemption[]>([]);
  /** Início que os eventos carregados cobrem: período que começa antes pede nova leitura. */
  private loadedFrom: Date | null = null;
  private requestId = 0;

  protected readonly preset = signal<number | null>(30);
  protected readonly from = signal(dateInputValue(daysAgo(30)));
  protected readonly to = signal(dateInputValue(new Date()));
  protected readonly generatedAt = signal(new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }));

  protected readonly range = computed(() => reportRange(this.from(), this.to()));
  protected readonly rangeError = computed(() => {
    const r = this.range();
    return 'error' in r ? r.error : null;
  });
  protected readonly report = computed<PartnerReport | null>(() => {
    const r = this.range();
    if ('error' in r || this.state() !== 'ok') return null;
    return partnerReport(this.events(), this.redemptions(), this.partnerId, r.from, r.to);
  });
  private readonly maxViews = computed(() => Math.max(1, ...(this.report()?.weeks.map((w) => w.views) ?? [])));
  protected readonly periodLabel = computed(() => {
    const r = this.range();
    if ('error' in r) return '';
    const fmt = (d: Date) => d.toLocaleDateString('pt-BR');
    return `${fmt(r.from)} a ${fmt(r.to)}`;
  });

  protected readonly n = formatCount;
  protected readonly money = formatCents;
  protected readonly source = sourceLabel;
  protected readonly day = shortDay;

  constructor() {
    void this.load();
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected barHeight(views: number): number {
    return Math.round((views / this.maxViews()) * 100);
  }

  protected usePreset(days: number): void {
    this.preset.set(days);
    this.from.set(dateInputValue(daysAgo(days)));
    this.to.set(dateInputValue(new Date()));
    this.reloadIfNeeded();
  }

  protected setFrom(raw: string): void {
    this.preset.set(null);
    this.from.set(raw);
    this.reloadIfNeeded();
  }

  protected setTo(raw: string): void {
    this.preset.set(null);
    this.to.set(raw);
  }

  protected print(): void {
    this.generatedAt.set(new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }));
    window.print();
  }

  /** Eventos são lidos desde o início do período; encurtar o período não relê, alongar relê. */
  private reloadIfNeeded(): void {
    const r = this.range();
    if ('error' in r) return;
    if (!this.loadedFrom || r.from.getTime() < this.loadedFrom.getTime()) void this.load();
  }

  async load(): Promise<void> {
    const r = this.range();
    if ('error' in r) return;
    const id = ++this.requestId;
    this.state.set('loading');
    this.error.set('');
    try {
      const [partner, events, redemptions] = await Promise.all([
        this.repository.partner(this.partnerId),
        this.repository.events(r.from),
        this.repository.redemptions({ partnerId: this.partnerId, status: 'matched' }),
      ]);
      if (id !== this.requestId) return;
      if (!partner) {
        this.state.set('missing');
        return;
      }
      this.partner.set(partner);
      this.events.set(events.filter((e) => e.partnerId === this.partnerId));
      this.redemptions.set(redemptions);
      this.loadedFrom = r.from;
      this.state.set('ok');
    } catch (error) {
      if (id !== this.requestId) return;
      this.error.set(clubErrorMessage(error));
      this.state.set('error');
    }
  }
}

function daysAgo(days: number): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1);
}
