import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { buildBracketColumns, buildGroupStandings, distinctPoolIds, matchIsCompleted, matchIsLive, matchSetWins, type TournamentMatch } from '../../data/matches-repository';
import type { TournamentCategoryOffer } from '../../data/tournaments-repository';
import type { BracketDuo, BracketMatch, BracketRound, CategoryBracketData, CategoryGroup, GroupStanding } from '../bracket-results.models';
import { TournamentLiveStore } from '../tournament-live.store';

function titleCase(input: string): string {
  return input
    .toLowerCase()
    .split(/[\s_-]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
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

/** "Sáb 29/03 · 16:30 · Quadra 1" — badge do card da chave pra partida agendada. */
function scheduleLabelOf(m: TournamentMatch): string | null {
  if (!m.scheduleTime) return null;
  const wd = SCHED_WD.format(m.scheduleTime).replace('.', '');
  const day = `${wd.charAt(0).toUpperCase()}${wd.slice(1)} ${SCHED_DATE.format(m.scheduleTime)}`;
  const parts = [day, SCHED_TIME.format(m.scheduleTime)];
  const court = courtLabelOf(m.courtName);
  if (court) parts.push(court);
  return parts.join(' · ');
}

const FORMAT_LABEL: Record<string, string> = {
  'single elimination': 'Eliminação simples',
  'double elimination': 'Eliminação dupla',
  'pool play + se': 'Fase de grupos + eliminação simples',
  'group cross + play-in': 'Grupos cruzados + play-in',
  'groups knockout': 'Fase de grupos + mata-mata',
  'groups repechage': 'Fase de grupos + repescagem',
  'round robin': 'Todos contra todos',
};

/** O `bracketFormat` chega tanto como `"Groups Knockout"` quanto como `"groupsKnockout"`,
 *  dependendo de onde a categoria foi criada — sem normalizar o camelCase, a segunda forma
 *  escapava do mapa e vazava em inglês para a tela. */
function formatLabelOf(bracketFormat: string): string {
  const normalized = bracketFormat
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  return FORMAT_LABEL[normalized] ?? titleCase(bracketFormat);
}

/** Aba "Chaves": grupos + mata-mata da categoria selecionada.
 *
 *  A árvore é derivada só de `round`+`matchType`+`matchNumber` — nenhum ponteiro salvo é lido no
 *  client (`winnerAdvance`/`loserAdvance` só existem para o Cloud Function preencher a próxima
 *  partida server-side). Layout em colunas de cards, sem geometria de conectores pixel-a-pixel.
 *
 *  Diferente da versão anterior, não busca nada: consome as partidas já carregadas pelo
 *  `TournamentLiveStore`, então trocar de categoria é instantâneo. */
@Component({
  selector: 'app-brackets-tab',
  imports: [NgTemplateOutlet],
  templateUrl: './brackets-tab.component.html',
  styleUrl: './brackets-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BracketsTabComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly store = inject(TournamentLiveStore);

  private readonly categoryParam = toSignal(this.route.queryParamMap.pipe(map((p) => p.get('categoria'))), {
    initialValue: this.route.snapshot.queryParamMap.get('categoria'),
  });

  private readonly manualCategoryId = signal<string | null>(null);

  protected readonly categories = computed<TournamentCategoryOffer[]>(() => this.store.tournament()?.categories ?? []);

  protected readonly selectedCategory = computed<TournamentCategoryOffer | null>(() => {
    const cats = this.categories();
    if (cats.length === 0) return null;
    // Ordem de preferência: escolha manual → `?categoria=` → a que o atleta joga → a primeira.
    const id = this.manualCategoryId() ?? this.categoryParam() ?? this.store.focusCategoryId();
    return cats.find((c) => c.id === id) ?? cats[0] ?? null;
  });

  protected readonly bracketData = computed<CategoryBracketData | null>(() => {
    const category = this.selectedCategory();
    if (!category) return null;
    const matches = this.store.matches().filter((m) => m.categoryId === category.id);

    const duoOf = (teamId: string, fallbackDescription: string | null): BracketDuo | null => {
      if (!teamId) return fallbackDescription ? { id: 'tbd', name: fallbackDescription, isViewer: false, players: this.store.duoPlayersOf('') } : null;
      return {
        id: teamId,
        name: this.store.duoNameOf(teamId, fallbackDescription),
        isViewer: this.store.isMyTeam(teamId),
        players: this.store.duoPlayersOf(teamId),
      };
    };

    const toBracketMatch = (m: TournamentMatch): BracketMatch => {
      const completed = matchIsCompleted(m);
      const live = matchIsLive(m);
      const [scoreA, scoreB] = matchSetWins(m);
      const showScore = completed || live;
      return {
        id: m.id,
        status: completed ? 'done' : live ? 'live' : m.scheduleTime ? 'scheduled' : 'tbd',
        scheduledLabel: !completed && !live ? scheduleLabelOf(m) : null,
        sideA: { duo: duoOf(m.teamAId, m.teamADescription), score: showScore ? scoreA : null, winner: completed && m.winnerId === m.teamAId },
        sideB: { duo: duoOf(m.teamBId, m.teamBDescription), score: showScore ? scoreB : null, winner: completed && m.winnerId === m.teamBId },
      };
    };

    const columns = buildBracketColumns(matches);
    const bracketRounds: BracketRound[] = columns.map((c) => ({ id: c.key, label: c.label, matches: c.matches.map(toBracketMatch) }));

    const poolIds = distinctPoolIds(matches);
    const groups: CategoryGroup[] = poolIds.map((poolId, i) => {
      const standings = buildGroupStandings(matches, poolId);
      const rows: GroupStanding[] = standings.map((s, idx) => ({
        rank: idx + 1,
        duo: duoOf(s.teamId, null) ?? { id: s.teamId, name: 'Dupla', isViewer: false, players: this.store.duoPlayersOf(s.teamId) },
        wins: s.wins,
        losses: matches.filter((m) => m.poolId === poolId && matchIsCompleted(m) && (m.teamAId === s.teamId || m.teamBId === s.teamId) && m.winnerId !== s.teamId).length,
        setsFor: s.setsWon,
        setsAgainst: s.setsLost,
        points: s.points,
        qualifies: idx < category.qualifiersPerGroup,
      }));
      return { id: poolId, letter: String.fromCharCode(65 + i), standings: rows };
    });

    const formatLabel = formatLabelOf(category.bracketFormat);

    return {
      categoryId: category.id,
      categoryName: category.categoryName,
      format: groups.length > 0 ? 'grupos' : 'chave',
      formatSummaryLabel: formatLabel,
      groups,
      groupsQualifyNote: groups.length > 0 ? `Os ${category.qualifiersPerGroup} primeiros de cada grupo avançam para a eliminatória.` : null,
      eliminationPreviewRounds: bracketRounds,
      bracketRounds,
    };
  });

  protected selectCategory(id: string): void {
    this.manualCategoryId.set(id);
  }

  protected matchPairs(matches: BracketMatch[]): BracketMatch[][] {
    const pairs: BracketMatch[][] = [];
    for (let i = 0; i < matches.length; i += 2) {
      pairs.push(matches.slice(i, i + 2));
    }
    return pairs;
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
        const suffix = m.status === 'live' ? ' (ao vivo)' : m.scheduledLabel ? ` (${m.scheduledLabel})` : '';
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
