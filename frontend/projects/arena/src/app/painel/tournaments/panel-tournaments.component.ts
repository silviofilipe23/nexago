import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { ChartTabsComponent } from '../ui/chart-tabs.component';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';
import type { ArenaLeagueSummary } from './league.model';
import { fetchArenaLeagues } from './leagues-repository';
import type { ArenaTournament, ArenaTournamentStatus } from './tournament.model';
import { fetchArenaTournaments } from './tournaments-repository';
import { environment } from '../../../environments/environment';

type TournamentTab = 'ativos' | 'encerrados';

const STATUS_LABEL: Record<ArenaTournamentStatus, string> = {
  inscricoes: 'Inscrições abertas',
  andamento: 'Em andamento',
  concluido: 'Concluído',
};

const STATUS_TONE: Record<ArenaTournamentStatus, PillTone> = {
  inscricoes: 'orange',
  andamento: 'green',
  concluido: 'dim',
};

function formatBRL(n: number): string {
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

/** Tela Torneios & ligas do painel: torneios reais sediados nesta arena (`tournaments` filtrado
 *  por `arenaId`) + ligas que têm ao menos uma etapa aqui (achadas indiretamente via esses
 *  torneios, já que `leagues` não guarda referência de arena). Sem "Criar torneio"/"Gerenciar" —
 *  torneios e ligas só podem ser criados/editados por contas organizador (rules exigem
 *  `managerId == uid` + role `organizer`); a arena só sedia e acompanha. */
@Component({
  selector: 'ar-panel-tournaments',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, ChartTabsComponent, PillComponent, IconComponent],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Torneios & ligas" [subtitle]="arenaName() + ' · competições sediadas na casa'" />

      <div class="body">
        @if (arenaNotFound()) {
          <p class="state-text">Nenhuma arena vinculada à sua conta ainda.</p>
        } @else if (arenaLoading() || loading()) {
          <p class="state-text">Carregando torneios…</p>
        } @else if (loadError(); as err) {
          <p class="state-text">{{ err }}</p>
        } @else {
          <div class="kpi-row">
            <ar-panel-card pad="sm" class="kpi-card">
              <div class="kpi-label">Torneios ativos</div>
              <div class="kpi-value">{{ activeCount() }}</div>
            </ar-panel-card>
            <ar-panel-card pad="sm" class="kpi-card">
              <div class="kpi-label">Inscritos no total</div>
              <div class="kpi-value">{{ totalEnrolled() }}</div>
            </ar-panel-card>
            <ar-panel-card pad="sm" class="kpi-card">
              <div class="kpi-label">Arrecadado (ano)</div>
              <div class="kpi-value">{{ formatBRL(totalRevenueYear()) }}</div>
            </ar-panel-card>
          </div>

          <ar-chart-tabs [tabs]="tabs" [active]="tab()" (change)="tab.set($any($event))" />

          <div class="grid-wrap">
            <div class="grid">
              @for (t of list(); track t.id) {
                <div class="card">
                  <div class="card-head">
                    <div class="card-icon">
                      <ar-icon name="trophy" [size]="19" />
                    </div>
                    <ar-pill [tone]="statusTone[t.status]">{{ statusLabel[t.status] }}</ar-pill>
                  </div>
                  <div>
                    <div class="card-title">{{ t.name }}</div>
                    <div class="card-meta">{{ t.sport }} · {{ t.dateLabel }}</div>
                  </div>
                  <div>
                    <div class="progress-head">
                      <span>Inscritos</span>
                      <span class="progress-count">{{ t.enrolledCount }}/{{ t.capacity || '—' }}</span>
                    </div>
                    <div class="progress-track">
                      <div class="progress-fill" [style.width.%]="pct(t)"></div>
                    </div>
                  </div>
                  <div class="card-foot">
                    <div class="foot-label">Arrecadado</div>
                    <div class="foot-value">{{ formatBRL(t.collectedReais) }}</div>
                  </div>
                </div>
              } @empty {
                <p class="state-text">Nenhum torneio {{ tab() === 'ativos' ? 'ativo' : 'encerrado' }} nesta arena ainda.</p>
              }
            </div>
          </div>

          @if (leagues().length > 0) {
            <div class="leagues-section">
              <h2 class="section-title">Ligas com etapa nesta arena</h2>
              <div class="grid">
                @for (l of leagues(); track l.id) {
                  <div class="card">
                    <div class="card-head">
                      <div class="card-icon">
                        <ar-icon name="ranking" [size]="19" />
                      </div>
                    </div>
                    <div>
                      <div class="card-title">{{ l.name }}</div>
                      <div class="card-meta">{{ l.sport }} · {{ l.city }}</div>
                    </div>
                    <div class="foot-label">Etapas nesta arena</div>
                    <div class="foot-value">{{ l.stagesHereCount }} de {{ l.stagesTotalCount }}</div>
                  </div>
                }
              </div>
            </div>
          }
        }
      </div>
    </ar-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      overflow: hidden;
      overflow-y: auto;
      scrollbar-width: none;
    }

    .body::-webkit-scrollbar {
      display: none;
    }

    .state-text {
      font-size: 13.5px;
      color: var(--nx-text-mute);
    }

    .kpi-row {
      display: flex;
      gap: 16px;
      flex: none;
    }

    .kpi-card {
      flex: 1;
    }

    .kpi-label {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .kpi-value {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 28px;
      color: var(--nx-text);
      margin-top: 8px;
    }

    .grid-wrap {
      flex: none;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
    }

    .card {
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-4);
      padding: 18px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .card-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
    }

    .card-icon {
      width: 42px;
      height: 42px;
      border-radius: var(--nx-r-2);
      flex: none;
      background: var(--nx-orange-tint);
      color: var(--nx-orange-500);
      display: grid;
      place-items: center;
    }

    .card-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 16px;
      color: var(--nx-text);
    }

    .card-meta {
      font-size: 12.5px;
      color: var(--nx-text-dim);
      margin-top: 3px;
    }

    .progress-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin-bottom: 6px;
    }

    .progress-head span {
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      color: var(--nx-text-dim);
    }

    .progress-count {
      font-weight: 700;
      font-size: 12.5px;
      color: var(--nx-text);
    }

    .progress-track {
      height: 6px;
      border-radius: 3px;
      background: var(--nx-surface-1);
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      border-radius: 3px;
      background: var(--nx-orange-500);
    }

    .card-foot {
      padding-top: 10px;
      border-top: 1px solid var(--nx-line);
    }

    .foot-label {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      color: var(--nx-text-dim);
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }

    .foot-value {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 15px;
      color: var(--nx-text);
      margin-top: 2px;
    }

    .leagues-section {
      flex: none;
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding-top: 8px;
    }

    .section-title {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 16px;
      color: var(--nx-text);
      margin: 0;
    }

    @media (max-width: 1180px) {
      .grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    @media (max-width: 720px) {
      .grid {
        grid-template-columns: 1fr;
      }

      .kpi-row {
        flex-wrap: wrap;
      }
    }
  `,
})
export class PanelTournamentsComponent {
  private readonly arenaContext = inject(ArenaContextService);

  protected readonly statusLabel = STATUS_LABEL;
  protected readonly statusTone = STATUS_TONE;
  protected readonly tabs: TournamentTab[] = ['ativos', 'encerrados'];
  protected readonly tab = signal<TournamentTab>('ativos');
  protected readonly formatBRL = formatBRL;

  protected readonly arenaLoading = computed(() => this.arenaContext.loading());
  protected readonly arenaNotFound = computed(() => this.arenaContext.notFound());
  protected readonly arenaName = computed(() => this.arenaContext.arenaName() ?? 'Arena');

  protected readonly tournaments = signal<ArenaTournament[]>([]);
  protected readonly leagues = signal<ArenaLeagueSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  protected readonly list = computed(() =>
    this.tab() === 'ativos'
      ? this.tournaments().filter((t) => t.status !== 'concluido')
      : this.tournaments().filter((t) => t.status === 'concluido'),
  );

  protected readonly activeCount = computed(() => this.tournaments().filter((t) => t.status !== 'concluido').length);
  protected readonly totalEnrolled = computed(() => this.tournaments().reduce((sum, t) => sum + t.enrolledCount, 0));
  protected readonly totalRevenueYear = computed(() => {
    const year = new Date().getFullYear();
    return this.tournaments()
      .filter((t) => (t.startAt?.getFullYear() ?? year) === year)
      .reduce((sum, t) => sum + t.collectedReais, 0);
  });

  constructor() {
    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      if (!arenaId) return;
      void this.load(arenaId);
    });
  }

  private async load(arenaId: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const db = arenaFirestore();
      const tournaments = await fetchArenaTournaments(db, environment.firebase.projectId!, arenaId);
      this.tournaments.set(tournaments);
      this.leagues.set(await fetchArenaLeagues(db, tournaments));
    } catch {
      this.loadError.set('Não foi possível carregar os torneios.');
    } finally {
      this.loading.set(false);
    }
  }

  protected pct(t: ArenaTournament): number {
    return t.capacity > 0 ? Math.round((t.enrolledCount / t.capacity) * 100) : 0;
  }
}
