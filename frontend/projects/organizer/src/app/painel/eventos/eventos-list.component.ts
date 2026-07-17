import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import type { OrganizerLeague } from '../data/league.model';
import { listMyLeagues } from '../data/leagues-repository';
import { listInscriptions } from '../data/inscriptions-repository';
import type { OrganizerTournament, OrganizerTournamentStatus } from '../data/tournament.model';
import { listMyTournaments } from '../data/tournaments-repository';
import { OgChartTabsComponent } from '../ui/chart-tabs.component';
import { OgIconComponent } from '../ui/icon.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { OgPillComponent } from '../ui/pill.component';

type Tab = 'todos' | 'ativos' | 'encerrados';
type Bucket = 'ativos' | 'encerrados';
type Tone = 'orange' | 'green' | 'yellow' | 'red' | 'dim';

/** Torneios com um destes status contam como evento ativo (mesmo critério do Início). */
const ACTIVE_TOURNAMENT_STATUSES: readonly OrganizerTournamentStatus[] = ['inscricoes', 'andamento'];
/** Teto de torneios consultados em paralelo pra contar inscritos na listagem — evita N+1 sem limite. */
const MAX_INSCRITOS_FETCH = 20;

const SHORT_DATE = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });

const STATUS_LABEL: Record<OrganizerTournamentStatus, string> = {
  inscricoes: 'Inscrições abertas',
  andamento: 'Em andamento',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

const STATUS_TONE: Record<OrganizerTournamentStatus, Tone> = {
  inscricoes: 'orange',
  andamento: 'green',
  concluido: 'dim',
  cancelado: 'red',
};

interface EventoCard {
  key: string;
  kind: 'Liga' | 'Torneio';
  name: string;
  metaLabel: string;
  statusLabel: string;
  statusTone: Tone;
  coverUrl: string | null;
  inscritos: number | null;
  vagas: number | null;
  etapas: number | null;
  link: string[] | null;
  bucket: Bucket;
}

/** Lista de ligas e torneios organizados, com progresso de inscrição por evento. */
@Component({
  selector: 'og-eventos-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, OgPageHeaderComponent, OgChartTabsComponent, OgIconComponent, OgPillComponent],
  template: `
    <og-page-header title="Meus eventos" subtitle="Ligas e torneios que você organiza">
      <a class="og-mini-btn og-mini-btn-primary" routerLink="/painel/novo-torneio"><og-icon name="plus" [size]="14" />Criar evento</a>
    </og-page-header>

    <div class="og-content">
      <og-chart-tabs [tabs]="tabs" [active]="tab()" (changed)="tab.set($any($event))" />

      @if (loading()) {
        <div class="og-eventos-grid">
          @for (i of [1, 2, 3]; track i) {
            <div class="og-evento-card">
              <div class="og-evento-card-cover og-skeleton-cover"></div>
              <div class="og-evento-card-body">
                <div class="og-skeleton-line" style="width:40%"></div>
                <div class="og-skeleton-line" style="width:80%"></div>
                <div class="og-skeleton-line" style="width:60%"></div>
              </div>
            </div>
          }
        </div>
      } @else {
        <div class="og-eventos-grid">
          @for (e of filtered(); track e.key) {
            <a class="og-evento-card" [class.og-evento-card-disabled]="!e.link" [routerLink]="e.link">
              <div class="og-evento-card-cover">
                @if (e.coverUrl && !coverFailed(e.key)) {
                  <img [src]="e.coverUrl" alt="" loading="lazy" (error)="onCoverError(e.key)" />
                } @else {
                  <span class="og-evento-card-cover-fallback">
                    <og-icon [name]="e.kind === 'Liga' ? 'flag' : 'trophy'" [size]="28" [strokeWidth]="1.6" />
                  </span>
                }
                <span class="og-evento-card-cover-pill">
                  <og-pill [tone]="e.statusTone">{{ e.statusLabel }}</og-pill>
                </span>
              </div>
              <div class="og-evento-card-body">
                <div>
                  <div class="og-evento-card-name">{{ e.name }}</div>
                  <div class="og-evento-card-meta">{{ e.metaLabel }}</div>
                </div>
                @if (e.kind === 'Torneio') {
                  <div>
                    <div class="og-evento-card-progress-row">
                      <span>Inscritos</span>
                      <span class="val">{{ e.inscritos ?? '—' }}{{ e.vagas ? '/' + e.vagas : '' }}</span>
                    </div>
                    <div class="og-progress"><span [style.width.%]="progressPct(e)"></span></div>
                  </div>
                } @else {
                  <div class="og-evento-card-progress-row">
                    <span>Etapas</span>
                    <span class="val">{{ e.etapas }}</span>
                  </div>
                }
                <div class="og-evento-card-footer">
                  <div>
                    <div class="og-evento-card-footer-label">Arrecadado</div>
                    <!-- mock (fase 2): arrecadação por evento fica no Financeiro (Task O7); sem dado real por evento ainda -->
                    <div class="og-evento-card-footer-value">—</div>
                  </div>
                  <span class="og-ghost-btn">{{ e.link ? 'Gerenciar' : 'Sem etapa iniciada' }}</span>
                </div>
              </div>
            </a>
          } @empty {
            <p class="og-empty">Nenhum torneio ou liga ainda — crie pelo app nexaGO</p>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .og-eventos-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
    }
    .og-evento-card {
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-4);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      text-decoration: none;
      color: inherit;
      transition: border-color 140ms var(--nx-ease-out);
    }
    .og-evento-card:not(.og-evento-card-disabled):hover {
      border-color: var(--nx-line-strong);
    }
    .og-evento-card-disabled {
      opacity: 0.6;
      cursor: default;
    }
    /* Capa do evento — altura fixa reserva o espaço (sem layout shift ao carregar). */
    .og-evento-card-cover {
      position: relative;
      height: 116px;
      flex: none;
      background: linear-gradient(135deg, rgba(255, 106, 26, 0.14), var(--nx-surface-1) 70%);
    }
    .og-evento-card-cover img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .og-evento-card-cover-fallback {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      color: var(--nx-orange-500);
      opacity: 0.55;
    }
    /* Scrim atrás da pill garante contraste sobre qualquer foto. */
    .og-evento-card-cover-pill {
      position: absolute;
      top: 10px;
      right: 10px;
      display: inline-flex;
      padding: 2px;
      border-radius: var(--nx-r-pill);
      background: rgba(7, 7, 8, 0.62);
      backdrop-filter: blur(6px);
    }
    .og-evento-card-body {
      padding: 14px 18px 18px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      flex: 1;
    }
    .og-evento-card-name {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 16px;
      color: var(--nx-text);
    }
    .og-evento-card-meta {
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-text-dim);
      margin-top: 3px;
    }
    .og-evento-card-progress-row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin-bottom: 6px;
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      color: var(--nx-text-dim);
    }
    .og-evento-card-progress-row .val {
      font-weight: 700;
      font-size: 12.5px;
      color: var(--nx-text);
    }
    .og-evento-card-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-top: 10px;
      border-top: 1px solid var(--nx-line);
    }
    .og-evento-card-footer-label {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      color: var(--nx-text-dim);
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }
    .og-evento-card-footer-value {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 15px;
      color: var(--nx-text);
      margin-top: 2px;
    }
    .og-empty {
      grid-column: 1 / -1;
      font-family: var(--nx-font-ui);
      font-size: 13px;
      color: var(--nx-text-mute);
      padding: 8px 0;
      margin: 0;
    }
    .og-skeleton-cover {
      position: relative;
      overflow: hidden;
    }
    .og-skeleton-cover::after {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(90deg, transparent, var(--nx-surface-2), transparent);
      animation: og-shimmer 1.2s infinite;
    }
    .og-skeleton-line {
      height: 12px;
      border-radius: 4px;
      background: var(--nx-surface-1);
      margin: 8px 0;
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
export class EventosListComponent {
  private readonly auth = inject(AuthService);

  protected readonly tabs = ['todos', 'ativos', 'encerrados'];
  protected readonly tab = signal<Tab>('todos');
  protected readonly loading = signal(true);

  protected readonly tournaments = signal<OrganizerTournament[]>([]);
  protected readonly leagues = signal<OrganizerLeague[]>([]);
  protected readonly inscritosPorTorneio = signal<Map<string, number>>(new Map());
  /** Capas que falharam ao carregar — o card volta pro fallback de gradiente + ícone. */
  protected readonly failedCovers = signal<ReadonlySet<string>>(new Set());

  protected readonly cards = computed<EventoCard[]>(() => {
    const inscritosMap = this.inscritosPorTorneio();

    const torneios: EventoCard[] = this.tournaments().map((t) => ({
      key: `t:${t.id}`,
      kind: 'Torneio',
      name: t.name,
      metaLabel: `Torneio · ${t.sportLabel} · ${this.dateRangeLabel(t.startAt, t.endAt)}`,
      statusLabel: STATUS_LABEL[t.status],
      statusTone: STATUS_TONE[t.status],
      coverUrl: t.coverUrl,
      inscritos: inscritosMap.get(t.id) ?? null,
      vagas: t.capacity,
      etapas: null,
      link: ['/painel/eventos', t.id],
      bucket: t.status === 'concluido' || t.status === 'cancelado' ? 'encerrados' : 'ativos',
    }));

    // Ligas não têm status de encerramento no modelo atual — contam sempre como ativas nas abas.
    const ligas: EventoCard[] = this.leagues().map((l) => {
      const stageComTorneio = l.stages.find((s) => s.tournamentId);
      return {
        key: `l:${l.id}`,
        kind: 'Liga',
        name: l.name,
        metaLabel: `Liga · ${l.sportLabel}${l.seasonLabel ? ' · ' + l.seasonLabel : ''}`,
        statusLabel: `${l.stages.length} etapa${l.stages.length === 1 ? '' : 's'}`,
        statusTone: 'dim',
        coverUrl: l.coverUrl,
        inscritos: null,
        vagas: null,
        etapas: l.stages.length,
        link: stageComTorneio?.tournamentId ? ['/painel/eventos', stageComTorneio.tournamentId] : null,
        bucket: 'ativos',
      };
    });

    return [...torneios, ...ligas];
  });

  protected readonly filtered = computed<EventoCard[]>(() => {
    const t = this.tab();
    if (t === 'todos') return this.cards();
    return this.cards().filter((c) => c.bucket === t);
  });

  constructor() {
    const uid = this.auth.user()?.uid;
    if (!uid) {
      this.loading.set(false);
      return;
    }
    void this.load(uid);
  }

  private async load(uid: string): Promise<void> {
    try {
      const [tournaments, leagues] = await Promise.all([listMyTournaments(uid), listMyLeagues(uid)]);
      this.tournaments.set(tournaments);
      this.leagues.set(leagues);

      const active = tournaments.filter((t) => ACTIVE_TOURNAMENT_STATUSES.includes(t.status)).slice(0, MAX_INSCRITOS_FETCH);
      const rest = tournaments.filter((t) => !active.includes(t)).slice(0, Math.max(0, MAX_INSCRITOS_FETCH - active.length));
      const toCount = [...active, ...rest];
      const lists = await Promise.all(toCount.map((t) => listInscriptions(t.id)));
      const map = new Map<string, number>();
      toCount.forEach((t, i) => map.set(t.id, lists[i]!.length));
      this.inscritosPorTorneio.set(map);
    } finally {
      this.loading.set(false);
    }
  }

  protected dateRangeLabel(start: Date | null, end: Date | null): string {
    if (!start) return 'Data a definir';
    if (!end || end.getTime() === start.getTime()) return SHORT_DATE.format(start);
    return `${SHORT_DATE.format(start)} – ${SHORT_DATE.format(end)}`;
  }

  protected progressPct(e: EventoCard): number {
    if (!e.vagas || e.inscritos == null) return 0;
    return Math.min(100, (e.inscritos / e.vagas) * 100);
  }

  protected coverFailed(key: string): boolean {
    return this.failedCovers().has(key);
  }

  protected onCoverError(key: string): void {
    this.failedCovers.update((set) => new Set(set).add(key));
  }
}
