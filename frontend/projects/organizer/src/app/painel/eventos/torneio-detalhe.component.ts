import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { listInscriptions, type TournamentInscription } from '../data/inscriptions-repository';
import { listMatches, type TournamentMatch } from '../data/matches-repository';
import type { OrganizerTournament, OrganizerTournamentStatus } from '../data/tournament.model';
import { getTournament } from '../data/tournaments-repository';
import { OgCardComponent } from '../ui/card.component';
import { OgChartTabsComponent } from '../ui/chart-tabs.component';
import { OgIconComponent } from '../ui/icon.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { OgPillComponent } from '../ui/pill.component';

type Tab = 'categorias' | 'inscritos' | 'jogos';
type Tone = 'orange' | 'green' | 'yellow' | 'red' | 'dim';

const STATUS_LABEL: Record<OrganizerTournamentStatus, string> = {
  inscricoes: 'Inscrições abertas',
  andamento: 'Em andamento',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

const SHORT_DATE = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });
const TIME = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

interface CategoriaRow {
  id: string;
  name: string;
  taken: number;
  total: number | null;
  pagas: number;
  pend: number;
  full: boolean;
}

interface JogosGrupo {
  categoryId: string;
  categoryName: string;
  matches: TournamentMatch[];
}

/** Detalhe do torneio — categorias com progresso de inscrição, inscritos e jogos reais. */
@Component({
  selector: 'og-torneio-detalhe',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, OgPageHeaderComponent, OgCardComponent, OgChartTabsComponent, OgIconComponent, OgPillComponent],
  template: `
    <og-page-header [title]="tournament()?.name ?? 'Torneio'" [subtitle]="headerSubtitle()">
      <button type="button" class="og-ghost-btn"><og-icon name="download" [size]="14" />Compartilhar</button>
      <button type="button" class="og-mini-btn"><og-icon name="edit" [size]="14" />Editar torneio</button>
    </og-page-header>

    <div class="og-content">
      @if (loading()) {
        <div class="og-card" style="color:var(--nx-text-dim);font-family:var(--nx-font-ui);font-size:13px">Carregando torneio…</div>
      } @else if (!tournament()) {
        <div class="og-card" style="color:var(--nx-text-dim);font-family:var(--nx-font-ui);font-size:13px">Torneio não encontrado.</div>
      } @else {
        <div class="og-kpi-row">
          <div class="og-card og-card-pad-sm" style="flex:1">
            <div class="og-kpi-label">Inscritos</div>
            <div class="og-kpi-value sm">{{ inscritosCount() }}</div>
          </div>
          <div class="og-card og-card-pad-sm" style="flex:1">
            <div class="og-kpi-label">Pendentes</div>
            <div class="og-kpi-value sm" style="color:var(--nx-pending)">{{ pendentesCount() }}</div>
          </div>
          <div class="og-card og-card-pad-sm" style="flex:1">
            <div class="og-kpi-label">Categorias</div>
            <div class="og-kpi-value sm">{{ categoriasCount() }}</div>
          </div>
          <div class="og-card og-card-pad-sm" style="flex:1">
            <div class="og-kpi-label">Arrecadado</div>
            <!-- mock (fase 2): arrecadação por torneio fica no Financeiro (Task O7); sem dado real aqui ainda -->
            <div class="og-kpi-value sm" style="color:var(--nx-win)">—</div>
          </div>
        </div>

        <div class="og-torneio-tabs-row">
          <og-chart-tabs [tabs]="tabs" [active]="tab()" (changed)="tab.set($any($event))" />
          <div class="og-page-header-spacer"></div>
          @if (tab() === 'categorias') {
            <button type="button" class="og-ghost-btn"><og-icon name="plus" [size]="13" />Adicionar categoria</button>
          }
        </div>

        @if (tab() === 'categorias') {
          <div class="og-torneio-cats-grid">
            @for (c of categoriaRows(); track c.id) {
              <div class="og-torneio-cat" [class.highlight]="c.full">
                <div class="og-torneio-cat-body">
                  <div class="og-torneio-cat-top">
                    <div class="og-torneio-cat-name">{{ c.name }}</div>
                    <og-pill [tone]="c.total == null ? 'dim' : c.full ? 'green' : 'orange'">
                      {{ c.total == null ? 'Sem limite' : c.full ? 'Lotado' : 'Abertas' }}
                    </og-pill>
                  </div>
                  @if (c.total != null) {
                    <div class="og-torneio-cat-progress">
                      <div class="row">
                        <span class="frac">{{ c.taken }}<em>/{{ c.total }} duplas</em></span>
                        <span class="pct" [style.color]="c.full ? 'var(--nx-win)' : 'var(--nx-orange-500)'">{{ pct(c) }}%</span>
                      </div>
                      <div class="og-progress" [class.win]="c.full"><span [style.width.%]="pct(c)"></span></div>
                    </div>
                  } @else {
                    <div class="og-torneio-cat-progress">
                      <div class="row"><span class="frac">{{ c.taken }}<em> duplas inscritas</em></span></div>
                    </div>
                  }
                  <div class="og-torneio-cat-footer">
                    <span class="paid">{{ c.pagas }} pagas</span>
                    @if (c.pend > 0) {
                      <span class="pend">{{ c.pend }} pend.</span>
                    }
                    <!-- mock (fase 2): arrecadação por categoria fica no Financeiro (Task O7) -->
                    <span class="rev">—</span>
                    <div class="og-page-header-spacer"></div>
                    <a class="og-ghost-btn" [routerLink]="['/painel/eventos', id(), 'categorias', c.id]">Abrir</a>
                  </div>
                </div>
                @if (c.full) {
                  <div class="og-torneio-cat-hint">
                    <og-icon name="bracket" [size]="16" style="color:var(--nx-orange-500)" />
                    <span>Inscrições lotadas · pronto pra sortear a chave</span>
                    <a class="og-mini-btn og-mini-btn-primary" [routerLink]="['/painel/eventos', id(), 'categorias', c.id, 'seeds']">Gerar chave</a>
                  </div>
                }
              </div>
            } @empty {
              <p class="og-empty">Nenhuma categoria cadastrada ainda</p>
            }
          </div>
        } @else if (tab() === 'inscritos') {
          <og-card pad="0" flex="1">
            <div class="og-table-head">
              <span style="flex:1.4">Equipe / Participantes</span>
              <span style="flex:1">Categoria</span>
              <span style="width:110px">Pagamento</span>
              <span style="width:80px">Data</span>
            </div>
            <div class="og-table-body">
              @for (i of inscriptions(); track i.id) {
                <div class="og-row">
                  <span style="flex:1.4;min-width:0">
                    <div class="og-torneio-insc-name">{{ i.teamName }}</div>
                    @if (i.participantNames.length) {
                      <div class="og-torneio-insc-meta">{{ i.participantNames.join(' · ') }}</div>
                    }
                  </span>
                  <span style="flex:1" class="og-torneio-insc-meta">{{ categoryName(i.categoryId) }}</span>
                  <span style="width:110px"><og-pill [tone]="i.paid ? 'green' : 'yellow'">{{ i.paid ? 'Pago' : 'Pendente' }}</og-pill></span>
                  <span style="width:80px" class="og-torneio-insc-meta">{{ i.createdAt ? shortDate(i.createdAt) : '—' }}</span>
                </div>
              } @empty {
                <p class="og-empty">Nenhuma inscrição ainda</p>
              }
            </div>
          </og-card>
        } @else {
          @if (matches().length === 0) {
            <div class="og-card" style="color:var(--nx-text-dim);font-family:var(--nx-font-ui);font-size:13px">Chaves ainda não geradas</div>
          } @else {
            @for (grupo of jogosPorCategoria(); track grupo.categoryId) {
              <og-card [kicker]="grupo.categoryName" pad="0">
                <div class="og-table-head">
                  <span style="width:120px">Rodada</span>
                  <span style="flex:1">Confronto</span>
                  <span style="width:100px;text-align:center">Placar</span>
                  <span style="width:100px">Quadra</span>
                  <span style="width:70px">Horário</span>
                </div>
                <div class="og-table-body">
                  @for (m of grupo.matches; track m.id) {
                    <div class="og-row">
                      <span style="width:120px" class="og-torneio-insc-meta">{{ m.round ?? '—' }}</span>
                      <span style="flex:1;display:flex;align-items:center;gap:8px;min-width:0">
                        <span class="og-torneio-jogo-team">{{ m.team1Label }}</span>
                        <span class="og-torneio-insc-meta">×</span>
                        <span class="og-torneio-jogo-team">{{ m.team2Label }}</span>
                      </span>
                      <span style="width:100px;text-align:center" class="og-torneio-jogo-score">{{ m.score ?? 'Não jogado' }}</span>
                      <span style="width:100px" class="og-torneio-insc-meta">{{ m.court ?? '—' }}</span>
                      <span style="width:70px" class="og-torneio-insc-meta">{{ m.scheduledAt ? timeLabel(m.scheduledAt) : '—' }}</span>
                    </div>
                  }
                </div>
              </og-card>
            }
          }
        }
      }
    </div>
  `,
  styles: `
    .og-torneio-tabs-row {
      display: flex;
      align-items: center;
      gap: 10px;
      flex: none;
    }
    .og-torneio-cats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
    }
    .og-torneio-cat {
      border-radius: var(--nx-r-3);
      overflow: hidden;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
    }
    .og-torneio-cat.highlight {
      background: var(--nx-orange-tint);
      border-color: rgba(255, 106, 26, 0.3);
    }
    .og-torneio-cat-body {
      padding: 16px;
    }
    .og-torneio-cat-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }
    .og-torneio-cat-name {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 16px;
      color: var(--nx-text);
    }
    .og-torneio-cat-progress {
      margin-top: 14px;
    }
    .og-torneio-cat-progress .row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 6px;
    }
    .og-torneio-cat-progress .frac {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 13.5px;
      color: var(--nx-text);
    }
    .og-torneio-cat-progress .frac em {
      font-style: normal;
      color: var(--nx-text-dim);
    }
    .og-torneio-cat-progress .pct {
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      font-weight: 700;
    }
    .og-torneio-cat-footer {
      margin-top: 14px;
      padding-top: 13px;
      border-top: 1px solid var(--nx-line);
      display: flex;
      align-items: center;
      gap: 16px;
      font-family: var(--nx-font-mono);
      font-size: 11.5px;
      font-weight: 700;
    }
    .og-torneio-cat-footer .paid {
      color: var(--nx-win);
    }
    .og-torneio-cat-footer .pend {
      color: var(--nx-pending);
    }
    .og-torneio-cat-footer .rev {
      color: var(--nx-text-mute);
    }
    .og-torneio-cat-hint {
      padding: 11px 16px;
      display: flex;
      align-items: center;
      gap: 11px;
      background: var(--nx-orange-tint);
      border-top: 1px solid rgba(255, 106, 26, 0.2);
    }
    .og-torneio-cat-hint span {
      flex: 1;
      font-family: var(--nx-font-ui);
      font-size: 11.5px;
      color: var(--nx-text-mute);
      line-height: 1.35;
    }
    .og-torneio-insc-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13.5px;
      color: var(--nx-text);
    }
    .og-torneio-insc-meta {
      font-family: var(--nx-font-ui);
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .og-torneio-jogo-team {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      color: var(--nx-text);
    }
    .og-torneio-jogo-score {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 13px;
      color: var(--nx-text);
    }
    .og-empty {
      font-family: var(--nx-font-ui);
      font-size: 13px;
      color: var(--nx-text-mute);
      padding: 8px 0;
      margin: 0;
    }
  `,
})
export class TorneioDetalheComponent {
  readonly id = input<string>('');

  protected readonly tabs: Tab[] = ['categorias', 'inscritos', 'jogos'];
  protected readonly tab = signal<Tab>('categorias');

  protected readonly loading = signal(true);
  protected readonly tournament = signal<OrganizerTournament | null>(null);
  protected readonly inscriptions = signal<TournamentInscription[]>([]);
  protected readonly matches = signal<TournamentMatch[]>([]);

  protected readonly headerSubtitle = computed(() => {
    const t = this.tournament();
    if (!t) return '';
    const local = t.location ?? t.city ?? 'Local a definir';
    return `Torneio · ${local} · ${this.dateRangeLabel(t.startAt, t.endAt)} · ${STATUS_LABEL[t.status]}`;
  });

  protected readonly inscritosCount = computed(() => this.inscriptions().length);
  protected readonly pendentesCount = computed(() => this.inscriptions().filter((i) => !i.paid).length);
  protected readonly categoriasCount = computed(() => this.tournament()?.categories.length ?? 0);

  protected readonly categoriaRows = computed<CategoriaRow[]>(() => {
    const t = this.tournament();
    if (!t) return [];
    const insc = this.inscriptions();
    return t.categories.map((c) => {
      const rows = insc.filter((i) => i.categoryId === c.id);
      const pagas = rows.filter((r) => r.paid).length;
      return {
        id: c.id,
        name: c.name,
        taken: rows.length,
        total: c.maxTeams,
        pagas,
        pend: rows.length - pagas,
        full: c.maxTeams != null && rows.length >= c.maxTeams,
      };
    });
  });

  protected readonly jogosPorCategoria = computed<JogosGrupo[]>(() => {
    const t = this.tournament();
    const ms = this.matches();
    if (!t) return [];
    const nameOf = new Map(t.categories.map((c) => [c.id, c.name]));
    const groups = new Map<string, TournamentMatch[]>();
    for (const m of ms) {
      const key = m.categoryId ?? '_sem-categoria';
      const list = groups.get(key) ?? [];
      list.push(m);
      groups.set(key, list);
    }
    return [...groups.entries()].map(([categoryId, matches]) => ({
      categoryId,
      categoryName: categoryId === '_sem-categoria' ? 'Sem categoria' : (nameOf.get(categoryId) ?? 'Categoria'),
      matches,
    }));
  });

  constructor() {
    effect(() => {
      const tid = this.id();
      this.tournament.set(null);
      this.inscriptions.set([]);
      this.matches.set([]);
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
      const [tournament, inscriptions, matches] = await Promise.all([getTournament(tid), listInscriptions(tid), listMatches(tid)]);
      this.tournament.set(tournament);
      this.inscriptions.set(inscriptions);
      this.matches.set(matches);
    } finally {
      this.loading.set(false);
    }
  }

  protected pct(c: CategoriaRow): number {
    if (!c.total) return 0;
    return Math.round((c.taken / c.total) * 100);
  }

  protected categoryName(categoryId: string | null): string {
    if (!categoryId) return 'Sem categoria';
    return this.tournament()?.categories.find((c) => c.id === categoryId)?.name ?? 'Categoria';
  }

  protected dateRangeLabel(start: Date | null, end: Date | null): string {
    if (!start) return 'data a definir';
    if (!end || end.getTime() === start.getTime()) return SHORT_DATE.format(start);
    return `${SHORT_DATE.format(start)} – ${SHORT_DATE.format(end)}`;
  }

  protected shortDate(d: Date): string {
    return SHORT_DATE.format(d);
  }

  protected timeLabel(d: Date): string {
    return TIME.format(d);
  }
}
