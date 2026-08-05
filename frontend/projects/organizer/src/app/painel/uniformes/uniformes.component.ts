import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { listInscriptions, type TournamentInscription } from '../data/inscriptions-repository';
import { initialsOf, truncateName, type PillTone } from '../data/mock-data';
import type { OrganizerTournament } from '../data/tournament.model';
import { getTournament } from '../data/tournaments-repository';
import {
  buildUniformsCsv,
  filterUniformRows,
  tournamentUsesUniform,
  uniformCategoryChips,
  uniformCategoryConfigs,
  uniformRowsFromInscriptions,
  uniformSizeOrder,
  uniformSummary,
  type UniformRow,
  type UniformStatus,
} from '../data/uniforms';
import { OgAvatarComponent } from '../ui/avatar.component';
import { OgCardComponent } from '../ui/card.component';
import { OgChartTabsComponent } from '../ui/chart-tabs.component';
import { OgIconComponent } from '../ui/icon.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { OgPillComponent } from '../ui/pill.component';

type Tab = 'todos' | UniformStatus;

const STATUS_TONE: Record<UniformStatus, PillTone> = { confirmado: 'green', pendente: 'yellow' };
const STATUS_LABEL: Record<UniformStatus, string> = { confirmado: 'Confirmado', pendente: 'Pendente' };

/** Uniformes do torneio em contexto (nível 2 da cascata) — paridade com
 *  `organizer_tournament_uniforms_page.dart`: consolida o que os atletas escolheram no app
 *  (tamanho, nome e número da camisa) pro organizador fechar o pedido com o fornecedor.
 *
 *  Tela de LEITURA: quem edita o uniforme é o atleta (callable `setRegistrationUniform`), então
 *  aqui não existe ação de escrita — só filtro, busca e exportação.
 *
 *  Duas coisas do protótipo ficaram de fora por não existirem no schema, mesma régua da tela de
 *  Inscrições: a aba/KPI "entregue" (não há campo de entrega em `inscriptions` — dá pra fazer,
 *  mas exige campo novo + rules + CF) e a coluna "Evento", que aqui é sempre o torneio da rota. */
@Component({
  selector: 'og-uniformes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, OgPageHeaderComponent, OgCardComponent, OgChartTabsComponent, OgIconComponent, OgPillComponent, OgAvatarComponent],
  template: `
    <og-page-header title="Uniformes" [subtitle]="headerSubtitle()">
      @if (usesUniform()) {
        <input
          type="search"
          class="og-uniformes-search"
          placeholder="Buscar atleta, nome ou nº…"
          aria-label="Buscar atleta, nome ou número da camisa"
          [value]="term()"
          (input)="term.set($any($event.target).value)"
        />
        <button
          type="button"
          class="og-mini-btn"
          title="Baixa o pedido completo do torneio em CSV"
          [disabled]="rows().length === 0"
          (click)="exportCsv()"
        >
          <og-icon name="download" [size]="14" />Exportar p/ fornecedor
        </button>
      }
    </og-page-header>

    <div class="og-content">
      @if (loading()) {
        <og-card pad="sm">
          <div class="og-skeleton-line" style="width:100%"></div>
        </og-card>
      } @else if (!usesUniform()) {
        <og-card>
          <div class="og-uniformes-empty">
            <og-icon name="shirt" [size]="26" />
            <h2>Este torneio não usa uniforme na inscrição</h2>
            <p>
              Ligue o uniforme na edição do torneio para que os atletas escolham tamanho, nome e número da
              camisa no app — os pedidos aparecem aqui.
            </p>
            <a class="og-mini-btn" routerLink="/painel/novo-torneio" [queryParams]="{ editar: id() }">
              <og-icon name="edit" [size]="14" />Editar torneio
            </a>
          </div>
        </og-card>
      } @else {
        <div class="og-kpi-row">
          <og-card pad="sm" flex="1">
            <div class="og-kpi-label">Uniformes cadastrados</div>
            <div class="og-kpi-value sm">{{ summary().confirmed }} / {{ summary().total }}</div>
            <div class="og-kpi-sub">{{ summary().confirmedPercent }}% da lista</div>
          </og-card>
          <og-card pad="sm" flex="1">
            <div class="og-kpi-label">Pendentes de cadastro</div>
            <div class="og-kpi-value sm" style="color:var(--nx-pending)">{{ summary().pending }}</div>
            <button type="button" class="og-uniformes-kpi-btn" [class.active]="tab() === 'pendente'" (click)="togglePending()">
              {{ tab() === 'pendente' ? 'filtro ativo ×' : 'ver só pendentes' }}
            </button>
          </og-card>
          <og-card pad="sm" flex="1.9">
            <div class="og-uniformes-grade-head">
              <div class="og-kpi-label">Grade de tamanhos</div>
              @if (sizeFilter()) {
                <button type="button" class="og-ghost-btn" (click)="sizeFilter.set(null)">limpar ×</button>
              }
            </div>
            <div class="og-uniformes-grade">
              @for (s of sizeBars(); track s.size) {
                <button
                  type="button"
                  class="og-uniformes-bar"
                  [class.active]="sizeFilter() === s.size"
                  [attr.aria-pressed]="sizeFilter() === s.size"
                  [title]="s.count + ' atleta(s) no tamanho ' + s.size"
                  (click)="toggleSize(s.size)"
                >
                  <span class="track"><span class="fill" [style.width.%]="s.pct"></span></span>
                  <span class="legend">{{ s.size }} <em>{{ s.count }}</em></span>
                </button>
              }
            </div>
          </og-card>
        </div>

        @if (chips().length > 1) {
          <div class="og-filter-bar">
            <button type="button" class="og-chip" [class.active]="categoryFilter() === null" (click)="selectCategory(null)">
              Todas ({{ rows().length }})
            </button>
            @for (c of chips(); track c.categoryId) {
              <button type="button" class="og-chip" [class.active]="categoryFilter() === c.categoryId" (click)="selectCategory(c.categoryId)">
                {{ c.label }} · {{ c.count }}
              </button>
            }
          </div>
        }

        <og-chart-tabs [tabs]="tabs" [active]="tab()" (changed)="tab.set($any($event))" />

        <og-card pad="0" flex="1">
          <div class="og-table-head">
            <span style="flex:1.6">Atleta</span>
            <span style="flex:1">Categoria</span>
            <span style="width:112px">Tamanho</span>
            <span style="width:150px">Nome / Nº</span>
            <span style="width:118px">Modelo</span>
            <span style="width:104px">Status</span>
          </div>
          <div class="og-table-body">
            @for (r of filtered(); track r.key) {
              <div class="og-row">
                <og-avatar [initials]="initialsOf(r.athleteName)" [photoUrl]="r.photoUrl" [size]="40" />
                <span style="flex:1.6;min-width:0">
                  <div class="og-uniformes-name" [title]="r.athleteName">{{ truncate(r.athleteName, 26) }}</div>
                  <div class="og-uniformes-partner">{{ r.partnerLabel }}</div>
                </span>
                <span style="flex:1" class="og-uniformes-cat">{{ r.categoryLabel }}</span>
                <span style="width:112px" class="og-uniformes-sizes">
                  @if (r.sizeTop) {
                    <span class="og-uniformes-size">{{ r.sizeTop }}</span>
                    @if (r.requiresShorts) {
                      <span class="og-uniformes-shorts" title="Tamanho do shorts">shorts {{ r.sizeShorts ?? '—' }}</span>
                    }
                  } @else {
                    <span class="og-uniformes-dash">—</span>
                  }
                </span>
                <span style="width:150px" class="og-uniformes-jersey">
                  @if (!r.nameOnShirt && !r.numberOnShirt) {
                    <span class="og-uniformes-dash">sem personalização</span>
                  } @else {
                    @if (r.nameOnShirt) {
                      <span class="name">{{ r.jerseyName ?? '—' }}</span>
                    }
                    @if (r.numberOnShirt) {
                      @if (r.jerseyNumber != null) {
                        <span class="number">#{{ r.jerseyNumber }}</span>
                      } @else if (!r.nameOnShirt) {
                        <span class="og-uniformes-dash">—</span>
                      }
                    }
                  }
                </span>
                <span style="width:118px" class="og-uniformes-cat">{{ r.modelLabel }}</span>
                <span style="width:104px"><og-pill [tone]="statusTone[r.status]">{{ statusLabel[r.status] }}</og-pill></span>
              </div>
            } @empty {
              <p class="og-empty">{{ rows().length === 0 ? 'Nenhum atleta inscrito nas categorias com uniforme.' : 'Nenhum atleta neste filtro.' }}</p>
            }
          </div>
        </og-card>
      }
    </div>
  `,
  styles: `
    .og-uniformes-search {
      width: 250px;
      height: 38px;
      padding: 0 12px;
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-line);
      background: var(--nx-surface-0);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 13px;
    }
    .og-uniformes-search:focus-visible {
      outline: none;
      border-color: var(--nx-line-strong);
    }
    .og-uniformes-kpi-btn {
      align-self: flex-start;
      margin-top: 6px;
      padding: 0;
      border: none;
      background: none;
      cursor: pointer;
      font-family: var(--nx-font-ui);
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .og-uniformes-kpi-btn:hover,
    .og-uniformes-kpi-btn.active {
      color: var(--nx-pending);
    }
    .og-uniformes-grade-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .og-uniformes-grade {
      display: flex;
      align-items: flex-end;
      gap: 10px;
      margin-top: 14px;
    }
    .og-uniformes-bar {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 7px;
      padding: 0;
      border: none;
      background: none;
      cursor: pointer;
      text-align: left;
    }
    .og-uniformes-bar .track {
      display: block;
      height: 10px;
      border-radius: 5px;
      background: var(--nx-surface-1);
      overflow: hidden;
    }
    .og-uniformes-bar .fill {
      display: block;
      height: 100%;
      border-radius: 5px;
      background: var(--nx-orange-500);
      opacity: 0.45;
      transition: opacity 140ms var(--nx-ease-out);
    }
    .og-uniformes-bar:hover .fill,
    .og-uniformes-bar.active .fill {
      opacity: 1;
    }
    .og-uniformes-bar .legend {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      letter-spacing: 0.08em;
      color: var(--nx-text-dim);
    }
    .og-uniformes-bar.active .legend {
      color: var(--nx-orange-500);
    }
    .og-uniformes-bar .legend em {
      font-style: normal;
      font-weight: 700;
      color: var(--nx-text);
      margin-left: 3px;
    }
    .og-uniformes-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13.5px;
      color: var(--nx-text);
    }
    .og-uniformes-partner {
      font-family: var(--nx-font-ui);
      font-size: 11.5px;
      color: var(--nx-text-dim);
      margin-top: 2px;
    }
    .og-uniformes-cat {
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-text-mute);
      min-width: 0;
    }
    .og-uniformes-sizes {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .og-uniformes-size {
      min-width: 34px;
      height: 28px;
      padding: 0 7px;
      border-radius: var(--nx-r-1);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line-strong);
      display: inline-grid;
      place-items: center;
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 12px;
      color: var(--nx-text);
    }
    .og-uniformes-shorts {
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      color: var(--nx-text-dim);
    }
    .og-uniformes-jersey {
      display: flex;
      align-items: baseline;
      gap: 8px;
      min-width: 0;
    }
    .og-uniformes-jersey .name {
      font-family: var(--nx-font-mono);
      font-size: 12px;
      letter-spacing: 0.06em;
      color: var(--nx-text);
      text-transform: uppercase;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .og-uniformes-jersey .number {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 12px;
      color: var(--nx-orange-500);
      flex: none;
    }
    .og-uniformes-dash {
      font-family: var(--nx-font-ui);
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .og-uniformes-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      padding: 32px 16px;
      text-align: center;
    }
    .og-uniformes-empty og-icon {
      color: var(--nx-text-dim);
    }
    .og-uniformes-empty h2 {
      margin: 0;
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 16px;
      color: var(--nx-text);
    }
    .og-uniformes-empty p {
      margin: 0;
      max-width: 460px;
      font-size: 13px;
      line-height: 1.5;
      color: var(--nx-text-mute);
    }
    .og-uniformes-empty a {
      margin-top: 6px;
    }
    .og-empty {
      font-family: var(--nx-font-ui);
      font-size: 13px;
      color: var(--nx-text-mute);
      padding: 16px;
      margin: 0;
    }
    .og-skeleton-line {
      height: 34px;
      border-radius: 6px;
      background: var(--nx-surface-1);
      position: relative;
      overflow: hidden;
    }
    .og-skeleton-line::after {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(90deg, transparent, var(--nx-surface-2), transparent);
      animation: og-shimmer 1.2s infinite;
    }
    @keyframes og-shimmer {
      from {
        transform: translateX(-100%);
      }
      to {
        transform: translateX(100%);
      }
    }
  `,
})
export class UniformesComponent {
  readonly id = input<string>('');

  protected readonly tabs = ['todos', 'confirmado', 'pendente'];
  protected readonly tab = signal<Tab>('todos');
  protected readonly categoryFilter = signal<string | null>(null);
  protected readonly sizeFilter = signal<string | null>(null);
  protected readonly term = signal('');
  protected readonly statusTone = STATUS_TONE;
  protected readonly statusLabel = STATUS_LABEL;
  protected readonly initialsOf = initialsOf;
  protected readonly truncate = truncateName;

  protected readonly loading = signal(true);
  private readonly tournament = signal<OrganizerTournament | null>(null);
  private readonly inscriptions = signal<TournamentInscription[]>([]);

  private readonly configs = computed(() => uniformCategoryConfigs(this.tournament()));

  protected readonly usesUniform = computed(() => tournamentUsesUniform(this.tournament()));

  /** Uma linha por atleta das categorias com uniforme (lista de espera fora). */
  protected readonly rows = computed<UniformRow[]>(() =>
    uniformRowsFromInscriptions({ inscriptions: this.inscriptions(), configs: this.configs() }),
  );

  protected readonly chips = computed(() => uniformCategoryChips(this.rows()));

  /** KPIs e grade seguem o filtro de CATEGORIA (grade de tamanhos é por categoria), mas não os
   *  de status/tamanho/busca — esses só recortam a lista. Mesma regra do app. */
  private readonly scopedRows = computed(() => filterUniformRows(this.rows(), { categoryId: this.categoryFilter() }));

  protected readonly summary = computed(() =>
    uniformSummary(this.scopedRows(), uniformSizeOrder(this.configs(), this.categoryFilter())),
  );

  protected readonly sizeBars = computed(() => {
    const summary = this.summary();
    const max = Math.max(1, ...summary.sizeOrder.map((size) => summary.countBySize[size] ?? 0));
    return summary.sizeOrder.map((size) => {
      const count = summary.countBySize[size] ?? 0;
      return { size, count, pct: Math.round((count / max) * 100) };
    });
  });

  protected readonly filtered = computed(() => {
    const tab = this.tab();
    return filterUniformRows(this.rows(), {
      categoryId: this.categoryFilter(),
      sizeTop: this.sizeFilter(),
      status: tab === 'todos' ? null : tab,
      term: this.term(),
    });
  });

  protected readonly headerSubtitle = computed(() => {
    const t = this.tournament();
    if (!t) return '';
    if (!this.usesUniform()) return t.name;
    const { confirmed, total, pending } = this.summary();
    return `${t.name} · ${confirmed} de ${total} cadastrados${pending > 0 ? ` · ${pending} pendentes` : ''}`;
  });

  constructor() {
    effect(() => {
      const tid = this.id();
      this.tournament.set(null);
      this.inscriptions.set([]);
      this.categoryFilter.set(null);
      this.sizeFilter.set(null);
      this.tab.set('todos');
      this.term.set('');
      if (!tid) {
        this.loading.set(false);
        return;
      }
      this.loading.set(true);
      void this.load(tid);
    });
  }

  private async load(tid: string): Promise<void> {
    try {
      const [tournament, inscriptions] = await Promise.all([getTournament(tid), listInscriptions(tid)]);
      this.tournament.set(tournament);
      this.inscriptions.set(inscriptions);
    } finally {
      this.loading.set(false);
    }
  }

  protected selectCategory(categoryId: string | null): void {
    this.categoryFilter.set(categoryId);
    // Grade muda com a categoria (grades diferentes por gênero) — tamanho selecionado sai.
    this.sizeFilter.set(null);
  }

  protected togglePending(): void {
    this.tab.update((tab) => (tab === 'pendente' ? 'todos' : 'pendente'));
    this.sizeFilter.set(null);
  }

  protected toggleSize(size: string): void {
    this.sizeFilter.update((current) => (current === size ? null : size));
    // Tamanho só existe em cadastro confirmado; a aba "pendente" esvaziaria a lista.
    if (this.tab() === 'pendente') this.tab.set('todos');
  }

  protected exportCsv(): void {
    const rows = this.rows();
    if (rows.length === 0) return;
    const tournamentName = this.tournament()?.name ?? 'Torneio';
    const csv = buildUniformsCsv({
      tournamentName,
      summary: uniformSummary(rows, uniformSizeOrder(this.configs())),
      rows,
      anyRequiresShorts: rows.some((r) => r.requiresShorts),
    });
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `uniformes-${slugify(tournamentName)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

function slugify(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'torneio'
  );
}
