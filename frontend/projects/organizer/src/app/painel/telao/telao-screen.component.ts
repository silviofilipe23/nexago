import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, signal } from '@angular/core';
import { resolveCourtNames, type TournamentMatch } from '../data/matches-repository';
import { formatCourtLabel, spDayLabel, spTimeLabel } from '../data/schedule-format';
import { effectiveTelaoConfig } from '../data/tournaments-repository';
import { OgPulseDirective } from './og-pulse.directive';
import { fallbackTeamDisplay, TelaoDataService } from './telao-data.service';
import { TelaoCourtCardComponent } from './telao-court-card.component';
import { callOf, courtNowOf, courtPageCount, courtPageOf, ROTATE_INTERVAL_MS, teamShortLabel, upcomingQueue } from './telao-selectors';

const CLOCK_FMT = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'America/Sao_Paulo' });
const HEADER_DAY_FMT = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'short', timeZone: 'America/Sao_Paulo' });

interface TelaoQueueRow {
  id: string;
  time: string;
  day: string | null;
  court: string;
  a: string;
  b: string;
  meta: string;
}

/** A arte do telão (canvas lógico 1920×1080, escalada pelo `TelaoStageComponent`): header com
 *  relógio, grade de quadras, fila de próximos jogos e barra de chamada. Só LÊ o
 *  `TelaoDataService` provido pela página host (TV ou preview da config). */
@Component({
  selector: 'og-telao-screen',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TelaoCourtCardComponent, OgPulseDirective],
  host: { class: 'og-telao' },
  template: `
    <header class="og-telao-head">
      <span class="og-telao-brand">
        <span class="og-telao-brand-name">nexa<em>GO</em></span>
        <span class="og-telao-brand-kicker">Ao vivo</span>
      </span>
      <span class="og-telao-title">
        <span class="og-telao-event">{{ tournament()?.name ?? 'Carregando…' }}</span>
        <span class="og-telao-sub">{{ headerSub() }}</span>
      </span>
      <span class="og-telao-clock">{{ clock() }}</span>
    </header>

    <div class="og-telao-body" [class.no-queue]="!showQueue()">
      <div class="og-telao-grid" [class.single-row]="courtCards().length <= 2" [ogPulse]="pageIndex()">
        @for (card of courtCards(); track card.court.id) {
          <og-telao-court-card
            [courtName]="card.courtName"
            [kind]="card.kind"
            [match]="card.match"
            [categoryLabel]="card.categoryLabel"
            [teamA]="card.teamA"
            [teamB]="card.teamB"
            [showAvatars]="showAvatars()"
          />
        } @empty {
          <div class="og-telao-empty">{{ error() ? 'Sem conexão — reconectando…' : 'Carregando telão…' }}</div>
        }
      </div>

      @if (showQueue()) {
        <aside class="og-telao-queue">
          <header class="og-telao-queue-head">
            <span class="og-telao-queue-title">Próximos jogos</span>
            <span class="og-telao-queue-kicker">Fique por perto</span>
          </header>
          @for (row of queueRows(); track row.id; let first = $first) {
            <div class="og-telao-queue-item" [class.first]="first">
              <span class="og-telao-queue-when">
                <span class="og-telao-queue-time">{{ row.time }}</span>
                <span class="og-telao-queue-court">{{ row.day ? row.day + ' · ' : '' }}{{ row.court }}</span>
              </span>
              <span class="og-telao-queue-body">
                <span class="og-telao-queue-teams">{{ row.a }} <em>vs</em> {{ row.b }}</span>
                <span class="og-telao-queue-meta">{{ row.meta }}{{ first ? ' · apresentar-se à quadra' : '' }}</span>
              </span>
            </div>
          } @empty {
            <div class="og-telao-queue-empty">Sem jogos agendados por enquanto.</div>
          }
          <span class="og-telao-queue-flex"></span>
          <footer class="og-telao-queue-foot">Acompanhe seu jogo e receba chamadas no app <strong>nexaGO</strong></footer>
        </aside>
      }
    </div>

    @if (cfg()?.showCall) {
      <footer class="og-telao-bar">
        @if (call(); as c) {
          <span class="og-telao-bar-pill">Chamada</span>
          <span class="og-telao-bar-text" [ogPulse]="c.id">
            <strong>{{ c.a }}</strong>&ngsp;<em>vs</em>&ngsp;<strong>{{ c.b }}</strong>&ngsp;— apresentar-se à {{ c.court }} até
            <span class="og-telao-bar-deadline">{{ c.deadline }}</span>
          </span>
        }
        <span class="og-telao-bar-flex"></span>
        <span class="og-telao-bar-status" [class.error]="error()">
          {{ error() ? 'Reconectando…' : 'Atualizado em tempo real' }}
          <span class="og-dot" [class.og-dot-red]="error()" [class.og-dot-pulse]="!error()"></span>
        </span>
      </footer>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      width: 1920px;
      height: 1080px;
      background: var(--nx-bg);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      padding: 36px 44px 0;
      gap: 26px;
      overflow: hidden;
    }
    .og-telao-head {
      display: flex;
      align-items: center;
      gap: 28px;
      flex: none;
    }
    .og-telao-brand {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding-right: 28px;
      border-right: 1px solid var(--nx-line);
    }
    .og-telao-brand-name {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 30px;
    }
    .og-telao-brand-name em {
      font-style: normal;
      color: var(--nx-orange-500);
    }
    .og-telao-brand-kicker {
      font-family: var(--nx-font-mono);
      font-size: 12px;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-telao-title {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }
    .og-telao-event {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 34px;
      line-height: 1.1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .og-telao-sub {
      font-family: var(--nx-font-mono);
      font-size: 15px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-telao-clock {
      margin-left: auto;
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 52px;
      font-variant-numeric: tabular-nums;
      letter-spacing: 0.06em;
    }
    .og-telao-body {
      flex: 1;
      display: grid;
      grid-template-columns: 1fr 400px;
      gap: 26px;
      min-height: 0;
    }
    .og-telao-body.no-queue {
      grid-template-columns: 1fr;
    }
    .og-telao-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      grid-template-rows: repeat(2, 1fr);
      gap: 22px;
      min-height: 0;
    }
    .og-telao-grid.single-row {
      grid-template-rows: 1fr;
    }
    /* Rotação automática: crossfade da grade ao trocar a página de quadras. */
    .og-telao-grid.og-pulse-run {
      animation: og-telao-fade 300ms var(--nx-ease-out);
    }
    .og-telao-empty {
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--nx-text-dim);
      font-size: 24px;
    }
    .og-telao-queue {
      display: flex;
      flex-direction: column;
      gap: 14px;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-4);
      padding: 24px;
      min-height: 0;
      overflow: hidden;
    }
    .og-telao-queue-head {
      display: flex;
      align-items: baseline;
      gap: 12px;
    }
    .og-telao-queue-title {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 24px;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }
    .og-telao-queue-kicker {
      font-family: var(--nx-font-mono);
      font-size: 12px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-telao-queue-item {
      display: flex;
      gap: 16px;
      align-items: center;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-3);
      padding: 14px 16px;
      /* Jogo novo na fila entra deslizando (itens existentes são reusados pelo track). */
      animation: og-telao-rise 240ms var(--nx-ease-out);
      transition:
        border-color var(--nx-d-base) var(--nx-ease-out),
        background-color var(--nx-d-base) var(--nx-ease-out);
    }
    .og-telao-queue-item.first {
      border-color: rgba(255, 106, 26, 0.55);
      background: var(--nx-orange-tint);
    }
    .og-telao-queue-when {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      flex: none;
      min-width: 74px;
    }
    .og-telao-queue-time {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 22px;
      color: var(--nx-orange-400);
      font-variant-numeric: tabular-nums;
    }
    .og-telao-queue-court {
      font-family: var(--nx-font-mono);
      font-size: 11px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-telao-queue-body {
      display: flex;
      flex-direction: column;
      gap: 3px;
      min-width: 0;
    }
    .og-telao-queue-teams {
      font-weight: 700;
      font-size: 18px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .og-telao-queue-teams em {
      font-style: normal;
      color: var(--nx-text-dim);
      font-weight: 500;
    }
    .og-telao-queue-meta {
      font-size: 13px;
      color: var(--nx-text-mute);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .og-telao-queue-empty {
      color: var(--nx-text-dim);
      font-size: 15px;
      padding: 10px 2px;
    }
    .og-telao-queue-flex {
      flex: 1;
    }
    .og-telao-queue-foot {
      border-top: 1px solid var(--nx-line);
      padding-top: 14px;
      font-size: 14px;
      color: var(--nx-text-mute);
      text-align: center;
    }
    .og-telao-bar {
      flex: none;
      display: flex;
      align-items: center;
      gap: 18px;
      border-top: 1px solid var(--nx-line);
      margin: 0 -44px;
      padding: 20px 44px 22px;
    }
    .og-telao-bar-pill {
      font-family: var(--nx-font-mono);
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-on-orange);
      background: var(--nx-orange-500);
      border-radius: var(--nx-r-pill);
      padding: 8px 18px;
    }
    .og-telao-bar-text {
      font-size: 22px;
      color: var(--nx-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .og-telao-bar-text em {
      font-style: normal;
      color: var(--nx-text-dim);
    }
    .og-telao-bar-deadline {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      color: var(--nx-orange-400);
    }
    .og-telao-bar-flex {
      flex: 1;
    }
    .og-telao-bar-status {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      font-family: var(--nx-font-mono);
      font-size: 13px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-telao-bar-status .og-dot {
      background: var(--nx-win);
    }
    .og-telao-bar-status.error {
      color: var(--nx-pending);
    }
    .og-telao-bar-status.error .og-dot {
      background: var(--nx-live);
    }
    /* Nova chamada: o texto da barra entra deslizando de baixo. */
    .og-telao-bar-text.og-pulse-run {
      animation: og-telao-rise 260ms var(--nx-ease-out);
    }
    @keyframes og-telao-fade {
      from {
        opacity: 0.2;
      }
      to {
        opacity: 1;
      }
    }
    @keyframes og-telao-rise {
      from {
        transform: translateY(10px);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .og-telao-grid.og-pulse-run,
      .og-telao-queue-item,
      .og-telao-bar-text.og-pulse-run {
        animation: none;
      }
      .og-telao-queue-item {
        transition: none;
      }
    }
  `,
})
export class TelaoScreenComponent {
  private readonly svc = inject(TelaoDataService);

  protected readonly now = signal(Date.now());
  protected readonly pageIndex = signal(0);

  protected readonly tournament = this.svc.tournament;
  protected readonly error = this.svc.error;

  protected readonly cfg = computed(() => {
    const t = this.svc.tournament();
    return t ? effectiveTelaoConfig(t) : null;
  });

  protected readonly showAvatars = computed(() => this.cfg()?.showAvatars ?? true);
  protected readonly showQueue = computed(() => this.cfg()?.showUpcoming ?? true);

  /** Partidas com o nome da quadra resolvido pelo `courtId` (jogos auto-agendados antigos). */
  private readonly matches = computed(() => resolveCourtNames(this.svc.matches(), this.svc.tournament()?.courts ?? []));

  private readonly categoryNameById = computed(() => new Map((this.svc.tournament()?.categories ?? []).map((c) => [c.id, c.name])));

  protected readonly clock = computed(() => CLOCK_FMT.format(new Date(this.now())));

  protected readonly headerSub = computed(() => {
    const t = this.svc.tournament();
    if (!t) return '';
    const day = HEADER_DAY_FMT.format(new Date(this.now()));
    return [t.sportLabel, t.location ?? t.city, day].filter(Boolean).join(' · ');
  });

  protected readonly courtCards = computed(() => {
    const t = this.svc.tournament();
    const cfg = this.cfg();
    if (!t || !cfg) return [];
    const courtById = new Map(t.courts.map((c) => [c.id, c]));
    const teams = this.svc.teams();
    return courtPageOf(cfg.courtIds, this.pageIndex()).map((courtId) => {
      const { kind, match } = courtNowOf(this.matches(), courtId, this.now());
      return {
        court: courtById.get(courtId) ?? { id: courtId, name: courtId, order: 0 },
        courtName: formatCourtLabel(courtById.get(courtId)?.name ?? courtId),
        kind,
        match,
        categoryLabel: match ? this.categoryLabelOf(match) : '',
        teamA: match ? (teams.get(match.teamAId) ?? fallbackTeamDisplay(match.team1Label)) : null,
        teamB: match ? (teams.get(match.teamBId) ?? fallbackTeamDisplay(match.team2Label)) : null,
      };
    });
  });

  private readonly queue = computed(() => {
    const cfg = this.cfg();
    if (!cfg) return [];
    return upcomingQueue(this.matches(), cfg.courtIds, this.now());
  });

  protected readonly queueRows = computed<TelaoQueueRow[]>(() => {
    const teams = this.svc.teams();
    const today = spDayLabel(new Date(this.now()));
    return this.queue().map((m) => {
      const day = spDayLabel(m.scheduledAt!);
      return {
        id: m.id,
        time: spTimeLabel(m.scheduledAt!),
        day: day === today ? null : day,
        court: formatCourtLabel(m.court),
        a: teams.get(m.teamAId)?.short ?? teamShortLabel(m.team1Label),
        b: teams.get(m.teamBId)?.short ?? teamShortLabel(m.team2Label),
        meta: this.categoryLabelOf(m),
      };
    });
  });

  protected readonly call = computed(() => {
    const c = callOf(this.queue());
    if (!c) return null;
    const teams = this.svc.teams();
    return {
      id: c.match.id,
      a: teams.get(c.match.teamAId)?.short ?? teamShortLabel(c.match.team1Label),
      b: teams.get(c.match.teamBId)?.short ?? teamShortLabel(c.match.team2Label),
      court: formatCourtLabel(c.match.court) || 'quadra',
      deadline: spTimeLabel(c.deadline),
    };
  });

  constructor() {
    const clockTimer = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(clockTimer));

    // Rotação automática: avança a página da grade quando há mais quadras do que cabem.
    effect((onCleanup) => {
      const cfg = this.cfg();
      const pages = cfg ? courtPageCount(cfg.courtIds.length) : 1;
      if (!cfg?.autoRotate || pages <= 1) {
        this.pageIndex.set(0);
        return;
      }
      const timer = setInterval(() => this.pageIndex.update((i) => (i + 1) % pages), ROTATE_INTERVAL_MS);
      onCleanup(() => clearInterval(timer));
    });
  }

  private categoryLabelOf(m: TournamentMatch): string {
    const category = m.categoryId ? this.categoryNameById().get(m.categoryId) : null;
    return [category, m.round].filter(Boolean).join(' · ');
  }
}
