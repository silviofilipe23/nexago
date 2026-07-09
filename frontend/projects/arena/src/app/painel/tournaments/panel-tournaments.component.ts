import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../auth/auth.service';
import { ChartTabsComponent } from '../ui/chart-tabs.component';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';

type TournamentStatus = 'inscricoes' | 'andamento' | 'concluido';
type TournamentTab = 'ativos' | 'encerrados';

interface Tournament {
  name: string;
  sport: string;
  date: string;
  status: TournamentStatus;
  inscritos: number;
  vagas: number;
  receita: number;
}

const STATUS_LABEL: Record<TournamentStatus, string> = {
  inscricoes: 'Inscrições abertas',
  andamento: 'Em andamento',
  concluido: 'Concluído',
};

const STATUS_TONE: Record<TournamentStatus, PillTone> = {
  inscricoes: 'orange',
  andamento: 'green',
  concluido: 'dim',
};

const TOURNAMENTS: Tournament[] = [
  { name: 'Etapa garden', sport: 'Beach Tennis', date: '21 Jul', status: 'inscricoes', inscritos: 18, vagas: 24, receita: 1080 },
  { name: 'Copa Goiás Beach', sport: 'Vôlei de praia', date: '04 Ago', status: 'inscricoes', inscritos: 20, vagas: 32, receita: 1400 },
  { name: 'Desafio de Verão', sport: 'Beach Soccer', date: '14 Jun', status: 'concluido', inscritos: 16, vagas: 16, receita: 960 },
  { name: 'Torneio de Abertura', sport: 'Beach Tennis', date: '02 Mai', status: 'concluido', inscritos: 12, vagas: 16, receita: 720 },
];

/** Tela Torneios do painel (protótipo ArTorneiosScreen): KPIs, abas e grid de cards. */
@Component({
  selector: 'ar-panel-tournaments',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, ChartTabsComponent, PillComponent, IconComponent],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Torneios & eventos" [subtitle]="arenaName() + ' · competições organizadas na casa'">
        <button type="button" class="ar-mini-btn ar-mini-btn-primary">
          <ar-icon name="plus" [size]="14" />
          Criar torneio
        </button>
      </ar-page-header>

      <div class="body">
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
            <div class="kpi-value">R$ {{ totalRevenue().toLocaleString('pt-BR') }}</div>
          </ar-panel-card>
        </div>

        <ar-chart-tabs [tabs]="tabs" [active]="tab()" (change)="tab.set($any($event))" />

        <div class="grid-wrap">
          <div class="grid">
            @for (t of list(); track t.name) {
              <div class="card">
                <div class="card-head">
                  <div class="card-icon">
                    <ar-icon name="trophy" [size]="19" />
                  </div>
                  <ar-pill [tone]="statusTone[t.status]">{{ statusLabel[t.status] }}</ar-pill>
                </div>
                <div>
                  <div class="card-title">{{ t.name }}</div>
                  <div class="card-meta">{{ t.sport }} · {{ t.date }}</div>
                </div>
                <div>
                  <div class="progress-head">
                    <span>Inscritos</span>
                    <span class="progress-count">{{ t.inscritos }}/{{ t.vagas }}</span>
                  </div>
                  <div class="progress-track">
                    <div class="progress-fill" [style.width.%]="pct(t)"></div>
                  </div>
                </div>
                <div class="card-foot">
                  <div>
                    <div class="foot-label">Arrecadado</div>
                    <div class="foot-value">R$ {{ t.receita.toLocaleString('pt-BR') }}</div>
                  </div>
                  <button type="button" class="ar-ghost-btn">Gerenciar</button>
                </div>
              </div>
            }
          </div>
        </div>
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
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      scrollbar-width: none;
    }

    .grid-wrap::-webkit-scrollbar {
      display: none;
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
      display: flex;
      align-items: center;
      justify-content: space-between;
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
  private readonly auth = inject(AuthService);

  protected readonly statusLabel = STATUS_LABEL;
  protected readonly statusTone = STATUS_TONE;
  protected readonly tabs: TournamentTab[] = ['ativos', 'encerrados'];
  protected readonly tab = signal<TournamentTab>('ativos');

  private readonly tournaments = TOURNAMENTS;

  protected readonly list = computed(() =>
    this.tab() === 'ativos'
      ? this.tournaments.filter((t) => t.status !== 'concluido')
      : this.tournaments.filter((t) => t.status === 'concluido'),
  );

  protected readonly activeCount = computed(() => this.tournaments.filter((t) => t.status !== 'concluido').length);
  protected readonly totalEnrolled = computed(() => this.tournaments.reduce((sum, t) => sum + t.inscritos, 0));
  protected readonly totalRevenue = computed(() => this.tournaments.reduce((sum, t) => sum + t.receita, 0));

  protected readonly arenaName = computed(() => this.auth.displayName() || 'Arena');

  protected pct(t: Tournament): number {
    return Math.round((t.inscritos / t.vagas) * 100);
  }
}
