import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import type { League } from '@nexago/leagues';
import { listMyLeagues } from '../data/leagues-repository';
import { listInscriptions } from '../data/inscriptions-repository';
import { listMatches, resolveCourtNames, type TournamentMatch } from '../data/matches-repository';
import type { OrganizerTournament, OrganizerTournamentStatus } from '../data/tournament.model';
import { listMyTournaments } from '../data/tournaments-repository';
import { watchWallet } from '../data/wallet-repository';
import { OgCardComponent } from '../ui/card.component';
import { OgIconComponent } from '../ui/icon.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { OgPillComponent } from '../ui/pill.component';

interface UpcomingMatchRow {
  id: string;
  time: string;
  partida: string;
  evento: string;
  quadra: string;
}

/** Torneios com um destes status contam como "evento ativo" no card do topo. */
const ACTIVE_STATUSES: readonly OrganizerTournamentStatus[] = ['inscricoes', 'andamento'];
/** Teto de torneios ativos consultados em paralelo pra somar inscritos e buscar jogos — evita explodir em N+1. */
const MAX_ACTIVE_FOR_INSCRITOS = 10;
/** Quantos torneios ativos aparecem na lista "Meus eventos" — sempre um subconjunto do teto acima. */
const RECENT_LIMIT = 5;
/** Quantas partidas futuras aparecem no card "Próximos jogos". */
const PROXIMOS_JOGOS_LIMIT = 5;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const SHORT_DATE = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });
const TIME_FMT = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const SHORT_DATE_TIME_FMT = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "HH:mm" quando a partida é hoje; senão inclui a data curta, pra não parecer de hoje. */
function matchTimeLabel(scheduledAt: Date, now: Date): string {
  return isSameDay(scheduledAt, now) ? TIME_FMT.format(scheduledAt) : SHORT_DATE_TIME_FMT.format(scheduledAt);
}

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

/** Dashboard geral: KPIs, torneios ativos e agenda/comunicação do organizador. */
@Component({
  selector: 'og-panel-inicio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, OgPageHeaderComponent, OgCardComponent, OgIconComponent, OgPillComponent],
  template: `
    <og-page-header title="Início" subtitle="Visão geral dos seus torneios e ligas">
      <div class="og-search-box"><og-icon name="search" [size]="15" /><span>Buscar…</span></div>
      <button type="button" class="og-bell-btn"><og-icon name="bell" [size]="17" /><span class="dot"></span></button>
      <a class="og-mini-btn og-mini-btn-primary" routerLink="/painel/novo-torneio"><og-icon name="plus" [size]="14" />Criar evento</a>
    </og-page-header>

    <div class="og-content">
      @if (loading()) {
        <div class="og-kpi-row">
          @for (i of [1, 2, 3, 4]; track i) {
            <og-card pad="sm" flex="1">
              <div class="og-skeleton-line" style="width:70%"></div>
              <div class="og-skeleton-line og-skeleton-value" style="width:40%"></div>
            </og-card>
          }
        </div>
        <div class="og-inicio-grid">
          <og-card kicker="Arrecadação" title="Receita mensal">
            <div class="og-skeleton-line" style="width:90%"></div>
            <div class="og-skeleton-line" style="width:75%"></div>
            <div class="og-skeleton-line" style="width:82%"></div>
          </og-card>
          <og-card kicker="Agenda" title="Próximos jogos">
            <div class="og-skeleton-line" style="width:85%"></div>
            <div class="og-skeleton-line" style="width:60%"></div>
          </og-card>
        </div>
      } @else {
        <div class="og-kpi-row">
          <og-card pad="sm" flex="1">
            <div class="og-kpi-label">Eventos ativos</div>
            <div class="og-kpi-value">{{ eventosAtivos().length }}</div>
            <div class="og-kpi-sub">{{ leagues().length }} liga(s) · {{ inscricoesAbertasCount() }} em inscrições</div>
          </og-card>
          <og-card pad="sm" flex="1">
            <div class="og-kpi-label">Inscritos (eventos ativos)</div>
            <div class="og-kpi-value">{{ totalInscritos() }}</div>
            <div class="og-kpi-sub green">{{ inscritosSemanaLabel() }}</div>
          </og-card>
          <og-card pad="sm" flex="1">
            <div class="og-kpi-label">Saldo disponível</div>
            <div class="og-kpi-value">{{ saldoLabel() }}</div>
            <div class="og-kpi-sub">{{ pendenteLabel() }} pendente</div>
          </og-card>
          <og-card pad="sm" flex="1">
            <div class="og-kpi-label">Jogos hoje</div>
            <div class="og-kpi-value">{{ jogosHojeCount() }}</div>
            <div class="og-kpi-sub">{{ jogosHojeSubLabel() }}</div>
          </og-card>
        </div>

        <div class="og-inicio-grid">
          <og-card kicker="Arrecadação" title="Receita mensal">
            <!-- mock (fase 2): watchLedger é paginado (limit 30) — sem agregado mensal confiável no
                 backend, mesma limitação documentada em financeiro.component.ts -->
            <p class="og-empty">— em breve</p>
            <div class="og-inicio-eventos-label">Meus eventos</div>
            @for (t of recentTournaments(); track t.id) {
              <a class="og-inicio-evento-row" [routerLink]="['/painel/eventos', t.id]">
                <span class="og-inicio-evento-icon"><og-icon name="trophy" [size]="18" /></span>
                <span class="og-inicio-evento-body">
                  <span class="og-inicio-evento-name">{{ t.name }}</span>
                  <span class="og-inicio-evento-meta">{{ t.sportLabel }} · {{ dateLabel(t.startAt) }}</span>
                </span>
                @if (t.capacity) {
                  <span class="og-inicio-evento-progress">
                    <span class="row">
                      <span class="lbl">Inscritos</span>
                      <span class="val">{{ inscritosDe(t.id) }}/{{ t.capacity }}</span>
                    </span>
                    <span class="og-progress"><span [style.width.%]="progressoDe(t)"></span></span>
                  </span>
                }
                <og-pill [tone]="statusTone[t.status]">{{ statusLabel[t.status] }}</og-pill>
                <span class="og-ghost-btn">Abrir</span>
              </a>
            } @empty {
              <p class="og-empty">Nenhum torneio ainda — crie pelo app nexaGO</p>
            }
          </og-card>

          <div class="og-inicio-side">
            <og-card kicker="Agenda" title="Próximos jogos">
              <button card-action type="button" class="og-ghost-btn">Ver todos</button>
              @for (j of proximosJogos(); track j.id; let last = $last) {
                <div class="og-inicio-jogo-row" [class.last]="last">
                  <span class="time">{{ j.time }}</span>
                  <span class="body">
                    <span class="partida">{{ j.partida }}</span>
                    <span class="meta">{{ j.evento }} · {{ j.quadra }}</span>
                  </span>
                </div>
              } @empty {
                <p class="og-empty">Nenhum jogo agendado</p>
              }
            </og-card>

            <og-card kicker="Comunicação" title="Avisos recentes" flex="1">
              <!-- mock (fase 2): backend não persiste histórico de avisos — sendCategoryCommunication
                   retorna só pushCount/links, sem gravar nada (ver comunicacao.component.ts) -->
              <div class="og-inicio-aviso-row">
                <span class="og-dot og-dot-yellow"></span>
                <div>
                  <div class="txt">3 inscrições pendentes de pagamento — Copa Verão</div>
                  <div class="time">há 2 horas</div>
                </div>
              </div>
              <div class="og-inicio-aviso-row">
                <span class="og-dot"></span>
                <div>
                  <div class="txt">Rodada 5 da Liga Beach Tennis publicada</div>
                  <div class="time">ontem</div>
                </div>
              </div>
            </og-card>
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    .og-inicio-grid {
      display: grid;
      grid-template-columns: 1.4fr 1fr;
      gap: 16px;
      flex: 1;
      min-height: 0;
    }
    .og-inicio-eventos-label {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin: 18px 0 10px;
    }
    .og-inicio-evento-row {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 14px 0;
      border-bottom: 1px solid var(--nx-line);
      text-decoration: none;
      color: inherit;
    }
    .og-inicio-evento-row:last-child {
      border-bottom: none;
    }
    .og-inicio-evento-icon {
      width: 40px;
      height: 40px;
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
      font-size: 14px;
      color: var(--nx-text);
    }
    .og-inicio-evento-meta {
      font-family: var(--nx-font-ui);
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .og-inicio-evento-progress {
      width: 130px;
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .og-inicio-evento-progress .row {
      display: flex;
      justify-content: space-between;
    }
    .og-inicio-evento-progress .lbl {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      color: var(--nx-text-dim);
    }
    .og-inicio-evento-progress .val {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 11.5px;
      color: var(--nx-text);
    }
    .og-inicio-side {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-height: 0;
    }
    .og-inicio-jogo-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 0;
      border-bottom: 1px solid var(--nx-line);
    }
    .og-inicio-jogo-row.last {
      border-bottom: none;
    }
    .og-inicio-jogo-row .time {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 13px;
      color: var(--nx-orange-500);
      width: 44px;
    }
    .og-inicio-jogo-row .body {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .og-inicio-jogo-row .partida {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 12.5px;
      color: var(--nx-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .og-inicio-jogo-row .meta {
      font-family: var(--nx-font-ui);
      font-size: 11px;
      color: var(--nx-text-dim);
      margin-top: 2px;
    }
    .og-inicio-aviso-row {
      display: flex;
      gap: 10px;
      margin-bottom: 12px;
    }
    .og-inicio-aviso-row .txt {
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-text);
    }
    .og-inicio-aviso-row .time {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      color: var(--nx-text-dim);
      margin-top: 3px;
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
  protected readonly leagues = signal<League[]>([]);
  protected readonly totalInscritos = signal(0);
  protected readonly inscritosPorTorneio = signal<Map<string, number>>(new Map());
  protected readonly saldoDisponivel = signal(0);
  protected readonly saldoPendente = signal(0);
  protected readonly inscritosSemana = signal(0);
  protected readonly proximosJogos = signal<UpcomingMatchRow[]>([]);
  protected readonly jogosHojeCount = signal(0);
  protected readonly jogosHojeProximo = signal<Date | null>(null);

  protected readonly statusLabel = STATUS_LABEL;
  protected readonly statusTone = STATUS_TONE;

  protected readonly eventosAtivos = computed(() =>
    this.tournaments().filter((t) => ACTIVE_STATUSES.includes(t.status)),
  );
  protected readonly inscricoesAbertasCount = computed(
    () => this.eventosAtivos().filter((t) => t.status === 'inscricoes').length,
  );
  protected readonly recentTournaments = computed(() => this.eventosAtivos().slice(0, RECENT_LIMIT));
  protected readonly saldoLabel = computed(() => BRL.format(this.saldoDisponivel()));
  protected readonly pendenteLabel = computed(() => BRL.format(this.saldoPendente()));
  protected readonly inscritosSemanaLabel = computed(() => `+${this.inscritosSemana()} esta semana`);
  protected readonly jogosHojeSubLabel = computed(() => {
    const proximo = this.jogosHojeProximo();
    if (proximo) return `Próximo às ${TIME_FMT.format(proximo)}`;
    return this.jogosHojeCount() > 0 ? 'Nenhum jogo pendente' : 'Nenhum jogo hoje';
  });

  constructor() {
    const uid = this.auth.user()?.uid;
    if (!uid) {
      this.loading.set(false);
      return;
    }

    const unsubscribeWallet = watchWallet(uid, (wallet) => {
      this.saldoDisponivel.set(wallet.availableReais);
      this.saldoPendente.set(wallet.pendingReais);
    });
    this.destroyRef.onDestroy(() => unsubscribeWallet());

    void this.loadOverview(uid);
  }

  private async loadOverview(uid: string): Promise<void> {
    try {
      const [tournaments, leagues] = await Promise.all([listMyTournaments(uid), listMyLeagues(uid)]);
      this.tournaments.set(tournaments);
      this.leagues.set(leagues);

      const active = tournaments.filter((t) => ACTIVE_STATUSES.includes(t.status)).slice(0, MAX_ACTIVE_FOR_INSCRITOS);
      const [inscriptionLists, matchLists] = await Promise.all([
        Promise.all(active.map((t) => listInscriptions(t.id))),
        Promise.all(active.map((t) => listMatches(t.id))),
      ]);

      const perTournament = new Map<string, number>();
      active.forEach((t, i) => perTournament.set(t.id, inscriptionLists[i]!.length));
      this.inscritosPorTorneio.set(perTournament);
      this.totalInscritos.set(inscriptionLists.reduce((sum, list) => sum + list.length, 0));

      const now = new Date();
      const weekAgo = new Date(now.getTime() - WEEK_MS);
      this.inscritosSemana.set(
        inscriptionLists.reduce((sum, list) => sum + list.filter((i) => i.createdAt != null && i.createdAt >= weekAgo).length, 0),
      );

      this.applyMatches(active, matchLists, now);
    } finally {
      this.loading.set(false);
    }
  }

  private applyMatches(active: readonly OrganizerTournament[], matchLists: readonly TournamentMatch[][], now: Date): void {
    const tournamentNameOf = new Map(active.map((t) => [t.id, t.name]));
    // `matchLists[i]` é do torneio `active[i]` — resolve a quadra com as quadras daquele
    // torneio antes de achatar (ver `resolveCourtNames`).
    const allMatches = matchLists.flatMap((list, i) => resolveCourtNames(list, active[i]?.courts ?? []));

    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
    const todayMatches = allMatches.filter((m) => m.scheduledAt != null && m.scheduledAt >= startOfToday && m.scheduledAt < endOfToday);
    this.jogosHojeCount.set(todayMatches.length);
    const nextToday = todayMatches
      .filter((m) => m.status === 'scheduled')
      .sort((a, b) => a.scheduledAt!.getTime() - b.scheduledAt!.getTime())[0];
    this.jogosHojeProximo.set(nextToday?.scheduledAt ?? null);

    this.proximosJogos.set(
      allMatches
        .filter((m) => m.status === 'scheduled' && m.scheduledAt != null && m.scheduledAt.getTime() >= now.getTime())
        .sort((a, b) => a.scheduledAt!.getTime() - b.scheduledAt!.getTime())
        .slice(0, PROXIMOS_JOGOS_LIMIT)
        .map((m) => ({
          id: m.id,
          time: matchTimeLabel(m.scheduledAt!, now),
          partida: `${m.team1Label} vs ${m.team2Label}`,
          evento: tournamentNameOf.get(m.tournamentId) ?? '—',
          quadra: m.court ?? '—',
        })),
    );
  }

  protected dateLabel(date: Date | null): string {
    return date ? SHORT_DATE.format(date) : '—';
  }

  protected inscritosDe(tournamentId: string): number {
    return this.inscritosPorTorneio().get(tournamentId) ?? 0;
  }

  protected progressoDe(t: OrganizerTournament): number {
    if (!t.capacity) return 0;
    return Math.min(100, (this.inscritosDe(t.id) / t.capacity) * 100);
  }
}
