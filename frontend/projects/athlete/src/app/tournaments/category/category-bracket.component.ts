import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, Injector, afterNextRender, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  buildBracketColumns,
  distinctPoolIds,
  matchIsCanceled,
  matchIsCompleted,
  matchIsLive,
  matchSetWins,
  type TournamentMatch,
} from '../../data/matches-repository';
import type { TournamentCategoryOffer } from '../../data/tournaments-repository';
import type { BracketDuo, BracketMatch, BracketMatchSide, BracketRound, CategoryBracketData } from '../bracket-results.models';
import { BRACKET_MATCH_HEIGHT, BRACKET_MATCH_WIDTH, buildCategoryBracketLayout, type BracketLayout } from '../bracket-tree';
import { BRACKET_ZOOM_MAX, BRACKET_ZOOM_MIN, BRACKET_ZOOM_STEP, zoomAt } from '../bracket-zoom';
import { bracketFormatLabelOf } from '../tournament-format';
import { TournamentLiveStore } from '../tournament-live.store';
import { parentCategoryId } from './category-route';

function initialsOf(name: string): string {
  const parts = name
    .replace(/\s*[&/]\s*/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '—';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '—';
}

/** Quebra o nome da dupla ("Martins / Silva") nos até 2 atletas do stack de avatares — mesma
 *  regra do card do organizador. Rótulos sem "/" ("A definir", "Vencedor Jogo #5") caem no
 *  fallback de 1 avatar com o rótulo inteiro. */
function athleteNamesOf(teamLabel: string): string[] {
  const parts = teamLabel
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.slice(0, 2) : [teamLabel];
}

// Dia/hora na parede America/Sao_Paulo — fuso canônico dos eventos, mesmo formato dos cards
// da chave do organizador (web e app).
const SCHED_TIME = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const SCHED_WD = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'America/Sao_Paulo' });
const SCHED_DATE = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });

/** Normaliza o nome da quadra pra exibição (`1` → `Quadra 1`) — porta de
 *  `formatCourtLabelForCard` (tournament_match_display.dart, Flutter). */
function courtLabelOf(courtName: string | null): string {
  const court = courtName?.trim() ?? '';
  if (!court) return '';
  return /quadra/i.test(court) ? court : `Quadra ${court}`;
}

/** Topo do card: `#12 · Quadra 1` — paridade com `matchMetaLabel` do organizador. */
function metaLabelOf(m: TournamentMatch): string {
  const parts: string[] = [];
  if (m.matchNumber > 0) parts.push(`#${m.matchNumber}`);
  const court = courtLabelOf(m.courtName);
  if (court) parts.push(court);
  return parts.length > 0 ? parts.join(' · ') : '#—';
}

/** Rodapé do card: "Sáb 29/03 · 16:30 · Quadra 1" quando agendada; senão o que existir
 *  ("Quadra 1 · sem horário" / "Sem horário"). Paridade com `matchScheduleLabel` do organizador
 *  e com `matchScheduleFooterLabelPt` no app. */
function scheduleLabelOf(m: TournamentMatch): string {
  const court = courtLabelOf(m.courtName);
  if (!m.scheduleTime) return court ? `${court} · sem horário` : 'Sem horário';
  const wd = SCHED_WD.format(m.scheduleTime).replace('.', '');
  const day = `${wd.charAt(0).toUpperCase()}${wd.slice(1)} ${SCHED_DATE.format(m.scheduleTime)}`;
  const parts = [day, SCHED_TIME.format(m.scheduleTime)];
  if (court) parts.push(court);
  return parts.join(' · ');
}

const STATUS_LABEL: Record<BracketMatch['status'], string> = {
  done: 'Finalizado',
  live: 'Ao vivo',
  scheduled: 'Agendado',
  canceled: 'Cancelado',
};

function pinchDistanceOf(ev: TouchEvent): number {
  const a = ev.touches[0]!;
  const b = ev.touches[1]!;
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

/** Sub-visão "Chave": a eliminatória da categoria da rota.
 *
 *  A árvore usa a MESMA geometria do painel do organizador (`bracket-tree.ts`): canvas único com
 *  os tracks WB/LB, cards posicionados em absoluto e conectores SVG seguindo a fiação real da
 *  planta. O atleta enxerga a chave igual a quem a operou — e o card repete a anatomia de lá
 *  (nº do jogo + quadra, selo de status, avatares por dupla, sets, rodapé de agendamento), com
 *  os acréscimos que só fazem sentido aqui: destaque da partida do próprio atleta e do jogo ao
 *  vivo.
 *
 *  Não busca nada: consome as partidas já carregadas pelo `TournamentLiveStore`. */
@Component({
  selector: 'app-category-bracket',
  imports: [NgTemplateOutlet],
  templateUrl: './category-bracket.component.html',
  styleUrl: './category-bracket.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoryBracketComponent {
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly store = inject(TournamentLiveStore);

  constructor() {
    // Avanço de chave e placar da mesa entram na árvore sem recarregar.
    this.destroyRef.onDestroy(this.store.acquireLive());
  }

  protected readonly initialsOf = initialsOf;
  protected readonly matchWidth = BRACKET_MATCH_WIDTH;
  protected readonly matchHeight = BRACKET_MATCH_HEIGHT;
  protected readonly zoomMin = BRACKET_ZOOM_MIN;
  protected readonly zoomMax = BRACKET_ZOOM_MAX;

  /** Zoom da árvore — persiste ao trocar de categoria (é preferência de leitura, não da chave). */
  protected readonly zoom = signal(1);
  protected readonly zoomPct = computed(() => Math.round(this.zoom() * 100));

  /** Distância entre os dois dedos no último evento da pinça em andamento. */
  private pinchDist: number | null = null;
  /** Scroll já calculado mas ainda não aplicado (aguardando o render da nova extensão). Sem ele,
   *  dois touchmove entre renders leriam o scroll defasado do DOM e a âncora derivaria. */
  private pendingScroll: { left: number; top: number } | null = null;
  private readonly injector = inject(Injector);

  private readonly categoryId = parentCategoryId();

  private readonly category = computed<TournamentCategoryOffer | null>(() => this.store.categoryById(this.categoryId()));

  /** Partidas da categoria — base tanto do VM dos cards quanto da geometria. */
  private readonly categoryMatches = computed<TournamentMatch[]>(() => this.store.matchesOfCategory(this.categoryId()));

  /** Numa categoria com grupos a árvore é uma prévia: os slots se preenchem conforme os grupos
   *  terminam, e o cabeçalho precisa dizer isso em vez de fingir chave fechada. */
  protected readonly isPreview = computed(() => distinctPoolIds(this.categoryMatches()).length > 0);

  /** Geometria da árvore (posições + conectores). Os cards vêm do `bracketData` por id. */
  protected readonly bracketLayout = computed<BracketLayout | null>(() => buildCategoryBracketLayout(this.categoryMatches()));

  /** Card por id de partida — o nó do layout carrega a partida crua, o desenho vem daqui. */
  private readonly cardsById = computed<Map<string, BracketMatch>>(() => {
    const data = this.bracketData();
    const byId = new Map<string, BracketMatch>();
    for (const round of data?.bracketRounds ?? []) {
      for (const m of round.matches) byId.set(m.id, m);
    }
    return byId;
  });

  protected cardOf(matchId: string): BracketMatch | null {
    return this.cardsById().get(matchId) ?? null;
  }

  protected readonly bracketData = computed<CategoryBracketData | null>(() => {
    const category = this.category();
    if (!category) return null;
    const matches = this.categoryMatches();

    const duoOf = (teamId: string, fallbackDescription: string | null): BracketDuo | null => {
      if (!teamId) return fallbackDescription ? { id: 'tbd', name: fallbackDescription, isViewer: false, players: this.store.duoPlayersOf('') } : null;
      return {
        id: teamId,
        name: this.store.duoNameOf(teamId, fallbackDescription),
        isViewer: this.store.isMyTeam(teamId),
        players: this.store.duoPlayersOf(teamId),
      };
    };

    const sideOf = (teamId: string, fallbackDescription: string | null, score: number | null, winner: boolean): BracketMatchSide => {
      const duo = duoOf(teamId, fallbackDescription);
      return { duo, names: duo ? athleteNamesOf(duo.name) : [], score, winner };
    };

    const toBracketMatch = (m: TournamentMatch): BracketMatch => {
      const completed = matchIsCompleted(m);
      const live = matchIsLive(m);
      const canceled = matchIsCanceled(m);
      const [scoreA, scoreB] = matchSetWins(m);
      const showScore = completed || live;
      const status: BracketMatch['status'] = canceled ? 'canceled' : completed ? 'done' : live ? 'live' : 'scheduled';
      return {
        id: m.id,
        metaLabel: metaLabelOf(m),
        status,
        statusLabel: STATUS_LABEL[status],
        scheduleLabel: scheduleLabelOf(m),
        scheduled: m.scheduleTime != null,
        sideA: sideOf(m.teamAId, m.teamADescription, showScore ? scoreA : null, completed && m.winnerId === m.teamAId),
        sideB: sideOf(m.teamBId, m.teamBDescription, showScore ? scoreB : null, completed && m.winnerId === m.teamBId),
      };
    };

    const columns = buildBracketColumns(matches);
    const bracketRounds: BracketRound[] = columns.map((c) => ({ id: c.key, label: c.label, matches: c.matches.map(toBracketMatch) }));

    return {
      categoryId: category.id,
      categoryName: category.categoryName,
      formatSummaryLabel: bracketFormatLabelOf(category.bracketFormat),
      bracketRounds,
    };
  });

  // ── Zoom da árvore ─────────────────────────────────────────
  // Pinça (touch) e ctrl+scroll (pinça de trackpad) ancorados no ponto sob os dedos/cursor;
  // botões −/％/＋ como alternativa de ponteiro único, ancorados no centro do viewport.

  protected onPinchStart(ev: TouchEvent): void {
    if (ev.touches.length === 2) this.pinchDist = pinchDistanceOf(ev);
  }

  protected onPinchMove(ev: TouchEvent, scroller: HTMLElement): void {
    if (ev.touches.length !== 2) return;
    // Dois dedos são sempre zoom da chave — sem o preventDefault o navegador amplia a página.
    ev.preventDefault();
    const dist = pinchDistanceOf(ev);
    if (dist <= 0) return;
    if (this.pinchDist == null) {
      this.pinchDist = dist;
      return;
    }
    const rect = scroller.getBoundingClientRect();
    const a = ev.touches[0]!;
    const b = ev.touches[1]!;
    const anchorX = (a.clientX + b.clientX) / 2 - rect.left;
    const anchorY = (a.clientY + b.clientY) / 2 - rect.top;
    this.applyZoom(this.zoom() * (dist / this.pinchDist), scroller, anchorX, anchorY);
    this.pinchDist = dist;
  }

  protected onPinchEnd(ev: TouchEvent): void {
    if (ev.touches.length < 2) this.pinchDist = null;
  }

  /** Pinça de trackpad chega como wheel com ctrlKey; roda sem Ctrl segue rolando a chave. */
  protected onWheelZoom(ev: WheelEvent, scroller: HTMLElement): void {
    if (!ev.ctrlKey) return;
    ev.preventDefault();
    const rect = scroller.getBoundingClientRect();
    this.applyZoom(this.zoom() * Math.exp(-ev.deltaY * 0.002), scroller, ev.clientX - rect.left, ev.clientY - rect.top);
  }

  protected zoomStep(direction: 1 | -1, scroller: HTMLElement): void {
    const factor = direction === 1 ? BRACKET_ZOOM_STEP : 1 / BRACKET_ZOOM_STEP;
    this.applyZoom(this.zoom() * factor, scroller, scroller.clientWidth / 2, scroller.clientHeight / 2);
  }

  protected resetZoom(scroller: HTMLElement): void {
    this.applyZoom(1, scroller, scroller.clientWidth / 2, scroller.clientHeight / 2);
  }

  private applyZoom(targetZoom: number, scroller: HTMLElement, anchorX: number, anchorY: number): void {
    const current = {
      zoom: this.zoom(),
      scrollLeft: this.pendingScroll?.left ?? scroller.scrollLeft,
      scrollTop: this.pendingScroll?.top ?? scroller.scrollTop,
    };
    const next = zoomAt(current, targetZoom, anchorX, anchorY);
    if (next.zoom === current.zoom) return;
    this.zoom.set(next.zoom);
    const pending = { left: next.scrollLeft, top: next.scrollTop };
    this.pendingScroll = pending;
    // O scroll só pode ser reposicionado depois que o sizer renderiza a nova extensão — antes
    // disso o navegador limita o valor à extensão antiga (app zoneless: render é assíncrono).
    afterNextRender(
      () => {
        scroller.scrollLeft = pending.left;
        scroller.scrollTop = pending.top;
        if (this.pendingScroll === pending) this.pendingScroll = null;
      },
      { injector: this.injector },
    );
  }

  protected matchHasViewer(m: BracketMatch): boolean {
    return Boolean(m.sideA.duo?.isViewer || m.sideB.duo?.isViewer);
  }

  /** Só partidas com as duas duplas definidas levam ao detalhe — um slot vazio não tem o que mostrar. */
  protected canOpenMatch(m: BracketMatch): boolean {
    return m.sideA.duo != null && m.sideB.duo != null && m.sideA.duo.id !== 'tbd' && m.sideB.duo.id !== 'tbd';
  }

  protected openMatch(m: BracketMatch): void {
    const tournamentId = this.store.tournamentId();
    if (!tournamentId || !this.canOpenMatch(m)) return;
    void this.router.navigate(['/torneios', tournamentId, 'partida', m.id]);
  }

  protected exportBracket(): void {
    const data = this.bracketData();
    if (!data || data.bracketRounds.length === 0) return;

    const lines: string[] = [`Chave — ${data.categoryName}`, data.formatSummaryLabel, ''];
    for (const round of data.bracketRounds) {
      lines.push(`${round.label}:`);
      for (const m of round.matches) {
        const a = m.sideA.duo?.name ?? 'A definir';
        const b = m.sideB.duo?.name ?? 'A definir';
        const scoreA = m.sideA.score != null ? ` ${m.sideA.score}` : '';
        const scoreB = m.sideB.score != null ? ` ${m.sideB.score}` : '';
        const suffix = m.status === 'live' ? ' (ao vivo)' : m.scheduled ? ` (${m.scheduleLabel})` : '';
        lines.push(`  ${a}${scoreA} x ${b}${scoreB}${suffix}`);
      }
      lines.push('');
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chave-${data.categoryId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
