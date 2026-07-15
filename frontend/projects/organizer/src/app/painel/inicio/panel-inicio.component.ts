import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import type { OrganizerLeague } from '../data/league.model';
import { listMyLeagues } from '../data/leagues-repository';
import { listInscriptions } from '../data/inscriptions-repository';
import type { OrganizerTournament, OrganizerTournamentStatus } from '../data/tournament.model';
import { listMyTournaments } from '../data/tournaments-repository';
import { watchWallet } from '../data/wallet-repository';
import { OgCardComponent } from '../ui/card.component';
import { OgIconComponent } from '../ui/icon.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { OgPillComponent } from '../ui/pill.component';

/** Torneios com um destes status contam como "evento ativo" no card do topo. */
const ACTIVE_STATUSES: readonly OrganizerTournamentStatus[] = ['inscricoes', 'andamento'];
/** Teto de torneios ativos consultados em paralelo pra somar inscritos — evita explodir em N+1. */
const MAX_ACTIVE_FOR_INSCRITOS = 10;
const RECENT_LIMIT = 5;

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const SHORT_DATE = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });

const STATUS_LABEL: Record<OrganizerTournamentStatus, string> = {
  inscricoes: 'Inscrições abertas',
  andamento: 'Em andamento',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

const STATUS_TONE: Record<OrganizerTournamentStatus, 'orange' | 'green' | 'dim' | 'red'> = {
  inscricoes: 'orange',
  andamento: 'green',
  concluido: 'dim',
  cancelado: 'red',
};

/** Início do painel: KPIs (eventos ativos, inscritos, saldo) + torneios/ligas recentes. */
@Component({
  selector: 'og-panel-inicio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, OgCardComponent, OgIconComponent, OgPageHeaderComponent, OgPillComponent],
  template: `
    <og-page-header title="Início" subtitle="Visão geral dos seus torneios e ligas" />

    <div class="og-content">
      @if (loading()) {
        <div class="og-kpi-row">
          @for (i of [1, 2, 3]; track i) {
            <og-card pad="sm" flex="1">
              <div class="og-skeleton-line" style="width:70%"></div>
              <div class="og-skeleton-line og-skeleton-value" style="width:40%"></div>
            </og-card>
          }
        </div>
        <div class="og-inicio-grid">
          <og-card kicker="Seus eventos" title="Torneios">
            <div class="og-skeleton-line" style="width:90%"></div>
            <div class="og-skeleton-line" style="width:75%"></div>
            <div class="og-skeleton-line" style="width:82%"></div>
          </og-card>
          <og-card kicker="Suas etapas" title="Ligas">
            <div class="og-skeleton-line" style="width:85%"></div>
            <div class="og-skeleton-line" style="width:60%"></div>
          </og-card>
        </div>
      } @else {
        <div class="og-kpi-row">
          <og-card pad="sm" flex="1">
            <div class="og-kpi-label">Eventos ativos</div>
            <div class="og-kpi-value">{{ eventosAtivos().length }}</div>
          </og-card>
          <og-card pad="sm" flex="1">
            <div class="og-kpi-label">Inscritos no total</div>
            <div class="og-kpi-value">{{ totalInscritos() }}</div>
          </og-card>
          <og-card pad="sm" flex="1">
            <div class="og-kpi-label">Saldo disponível</div>
            <div class="og-kpi-value">{{ saldoLabel() }}</div>
          </og-card>
        </div>

        <div class="og-inicio-grid">
          <og-card kicker="Seus eventos" title="Torneios">
            <button card-action type="button" class="og-ghost-btn" routerLink="/painel/torneios">Ver todos</button>
            @for (t of recentTournaments(); track t.id) {
              <a class="og-inicio-evento-row" [routerLink]="['/painel/torneios', t.id]">
                <span class="og-inicio-evento-icon"><og-icon name="trophy" [size]="18" /></span>
                <span class="og-inicio-evento-body">
                  <span class="og-inicio-evento-name">{{ t.name }}</span>
                  <span class="og-inicio-evento-meta">{{ t.sportLabel }} · {{ dateLabel(t.startAt) }}</span>
                </span>
                <og-pill [tone]="statusTone[t.status]">{{ statusLabel[t.status] }}</og-pill>
              </a>
            } @empty {
              <p class="og-empty">Nenhum torneio ainda — crie pelo app nexaGO</p>
            }
          </og-card>

          <og-card kicker="Suas etapas" title="Ligas">
            <button card-action type="button" class="og-ghost-btn" routerLink="/painel/ligas">Ver todos</button>
            @for (l of recentLeagues(); track l.id) {
              <a class="og-inicio-evento-row" [routerLink]="['/painel/ligas', l.id]">
                <span class="og-inicio-evento-icon"><og-icon name="flag" [size]="18" /></span>
                <span class="og-inicio-evento-body">
                  <span class="og-inicio-evento-name">{{ l.name }}</span>
                  <span class="og-inicio-evento-meta">{{ l.sportLabel }}{{ l.seasonLabel ? ' · ' + l.seasonLabel : '' }}</span>
                </span>
              </a>
            } @empty {
              <p class="og-empty">Nenhuma liga ainda — crie pelo app nexaGO</p>
            }
          </og-card>
        </div>
      }
    </div>
  `,
  styles: `
    .og-inicio-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    .og-inicio-evento-row {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 12px 0;
      border-bottom: 1px solid var(--nx-line);
      text-decoration: none;
      color: inherit;
    }
    .og-inicio-evento-row:last-child {
      border-bottom: none;
    }
    .og-inicio-evento-icon {
      width: 38px;
      height: 38px;
      border-radius: var(--nx-r-2);
      flex: none;
      background: var(--nx-orange-tint);
      color: var(--nx-orange-500);
      display: grid;
      place-items: center;
    }
    .og-inicio-evento-body {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .og-inicio-evento-name {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 13.5px;
      color: var(--nx-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .og-inicio-evento-meta {
      font-family: var(--nx-font-ui);
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .og-empty {
      font-family: var(--nx-font-ui);
      font-size: 13px;
      color: var(--nx-text-mute);
      padding: 8px 0;
      margin: 0;
    }
    .og-skeleton-line {
      height: 12px;
      border-radius: 4px;
      background: var(--nx-surface-1);
      margin: 8px 0;
      position: relative;
      overflow: hidden;
    }
    .og-skeleton-value {
      height: 22px;
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
export class PanelInicioComponent {
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly loading = signal(true);
  protected readonly tournaments = signal<OrganizerTournament[]>([]);
  protected readonly leagues = signal<OrganizerLeague[]>([]);
  protected readonly totalInscritos = signal(0);
  protected readonly saldoDisponivel = signal(0);

  protected readonly statusLabel = STATUS_LABEL;
  protected readonly statusTone = STATUS_TONE;

  protected readonly eventosAtivos = computed(() =>
    this.tournaments().filter((t) => ACTIVE_STATUSES.includes(t.status)),
  );
  protected readonly recentTournaments = computed(() => this.tournaments().slice(0, RECENT_LIMIT));
  protected readonly recentLeagues = computed(() => this.leagues().slice(0, RECENT_LIMIT));
  protected readonly saldoLabel = computed(() => BRL.format(this.saldoDisponivel()));

  constructor() {
    const uid = this.auth.user()?.uid;
    if (!uid) {
      this.loading.set(false);
      return;
    }

    const unsubscribeWallet = watchWallet(uid, (wallet) => this.saldoDisponivel.set(wallet.availableReais));
    this.destroyRef.onDestroy(() => unsubscribeWallet());

    void this.loadOverview(uid);
  }

  private async loadOverview(uid: string): Promise<void> {
    try {
      const [tournaments, leagues] = await Promise.all([listMyTournaments(uid), listMyLeagues(uid)]);
      this.tournaments.set(tournaments);
      this.leagues.set(leagues);

      const active = tournaments.filter((t) => ACTIVE_STATUSES.includes(t.status)).slice(0, MAX_ACTIVE_FOR_INSCRITOS);
      const inscriptionLists = await Promise.all(active.map((t) => listInscriptions(t.id)));
      this.totalInscritos.set(inscriptionLists.reduce((sum, list) => sum + list.length, 0));
    } finally {
      this.loading.set(false);
    }
  }

  protected dateLabel(date: Date | null): string {
    return date ? SHORT_DATE.format(date) : '—';
  }
}
