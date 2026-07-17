import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { NxPageLoadingComponent } from '../shared/loading/nx-page-loading.component';
import { fetchPublicProfilesByIds, type AthletePublicProfile } from '../data/public-profiles-repository';
import {
  buildBracketColumns,
  buildGroupStandings,
  distinctPoolIds,
  fetchMatchesForCategory,
  matchIsCompleted,
  type TournamentMatch,
} from '../data/matches-repository';
import { fetchTeamsByIds, fetchTeamsForAthlete, type ArenaTeam } from '../data/teams-repository';
import { fetchTournament, type TournamentCategoryOffer, type TournamentSummary } from '../data/tournaments-repository';
import type { BracketDuo, BracketMatch, BracketRound, CategoryBracketData, CategoryGroup, GroupStanding } from './bracket-results.models';

function titleCase(input: string): string {
  return input
    .toLowerCase()
    .split(/[\s_-]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function nameFromEmail(email: string | null | undefined): string {
  const local = email?.split('@')[0]?.trim();
  return local ? titleCase(local) : 'Atleta';
}

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

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) return null;
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

// Dia/hora do agendamento na parede America/Sao_Paulo — fuso canônico dos eventos,
// mesmo formato dos cards da chave do organizador (web e app).
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

/** Chave real, derivada só de `round`+`matchType`+`matchNumber` (nenhum ponteiro salvo é lido
 *  no client — `winnerAdvance`/`loserAdvance` só existem pro Cloud Function preencher a
 *  próxima partida server-side). Layout simplificado: colunas de cards, sem geometria de
 *  conectores pixel-a-pixel (suficiente pra reconhecer a chave). */
@Component({
  selector: 'app-tournament-brackets',
  standalone: true,
  imports: [RouterLink, AtPanelShellComponent, NgTemplateOutlet, NxPageLoadingComponent],
  templateUrl: './tournament-brackets.component.html',
  styleUrl: './tournament-brackets.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TournamentBracketsComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly firestore = createFirestore();

  protected readonly accountLabel = computed(() => {
    const liveUser = this.auth.user();
    if (liveUser?.displayName?.trim()) return liveUser.displayName.trim();
    if (liveUser?.email?.trim()) return nameFromEmail(liveUser.email);
    const devEmail = this.auth.devEmail();
    return devEmail?.trim() ? nameFromEmail(devEmail) : 'Atleta';
  });

  protected readonly tournamentId = computed(() => this.route.snapshot.paramMap.get('id') ?? '');

  protected readonly loading = signal(true);
  protected readonly listing = signal<TournamentSummary | null>(null);
  protected readonly categories = computed<TournamentCategoryOffer[]>(() => this.listing()?.categories ?? []);

  protected readonly selectedCategoryId = signal<string | null>(this.route.snapshot.queryParamMap.get('categoria'));

  protected readonly selectedCategory = computed<TournamentCategoryOffer | null>(() => {
    const cats = this.categories();
    if (cats.length === 0) return null;
    const id = this.selectedCategoryId();
    return cats.find((c) => c.id === id) ?? cats[0] ?? null;
  });

  protected readonly bracketData = signal<CategoryBracketData | null>(null);
  /** Recarga da chave ao trocar de categoria — sem isso a troca de tab é silenciosa. */
  protected readonly bracketLoading = signal(false);
  private myTeamIds: ReadonlySet<string> = new Set();

  protected readonly initialsOf = initialsOf;

  constructor() {
    effect(() => {
      const id = this.tournamentId();
      void this.loadTournament(id);
    });

    effect(() => {
      const category = this.selectedCategory();
      const tId = this.tournamentId();
      void this.loadBracket(tId, category);
    });
  }

  private async loadTournament(id: string): Promise<void> {
    const db = this.firestore;
    if (!db || !id) {
      this.listing.set(null);
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    try {
      const [tournament, uid] = [await fetchTournament(db, id), this.auth.user()?.uid ?? null];
      this.listing.set(tournament);
      if (uid && environment.firebase.projectId) {
        const teams = await fetchTeamsForAthlete(db, environment.firebase.projectId, uid);
        this.myTeamIds = new Set(teams.map((t) => t.id));
      }
    } finally {
      this.loading.set(false);
    }
  }

  private async loadBracket(tournamentId: string, category: TournamentCategoryOffer | null): Promise<void> {
    const db = this.firestore;
    const projectId = environment.firebase.projectId;
    if (!db || !projectId || !tournamentId || !category) {
      this.bracketData.set(null);
      return;
    }

    this.bracketLoading.set(true);
    try {
      await this.loadBracketData(db, projectId, tournamentId, category);
    } finally {
      this.bracketLoading.set(false);
    }
  }

  private async loadBracketData(db: Firestore, projectId: string, tournamentId: string, category: TournamentCategoryOffer): Promise<void> {
    const matches = await fetchMatchesForCategory(db, projectId, tournamentId, category.id);
    const teamIds = [...new Set(matches.flatMap((m) => [m.teamAId, m.teamBId]).filter((id) => id))];
    const teams = await fetchTeamsByIds(db, projectId, teamIds);
    const profileIds = [...teams.values()].flatMap((t) => [t.player1Id, t.player2Id]);
    const profiles = await fetchPublicProfilesByIds(db, profileIds);

    const duoOf = (teamId: string, fallbackDescription: string | null): BracketDuo | null => {
      if (!teamId) return fallbackDescription ? { id: 'tbd', name: fallbackDescription, isViewer: false } : null;
      const team = teams.get(teamId);
      const name = teamDisplayName(team, profiles) ?? fallbackDescription ?? 'Dupla';
      return { id: teamId, name, isViewer: this.myTeamIds.has(teamId) };
    };

    const toBracketMatch = (m: TournamentMatch): BracketMatch => {
      const completed = matchIsCompleted(m);
      const live = m.status.trim().toLowerCase() === 'in progress';
      const [scoreA, scoreB] = setScoreOf(m);
      return {
        id: m.id,
        status: completed ? 'done' : live ? 'live' : m.scheduleTime ? 'scheduled' : 'tbd',
        scheduledLabel: !completed && !live ? scheduleLabelOf(m) : null,
        sideA: { duo: duoOf(m.teamAId, m.teamADescription), score: scoreA, winner: completed && m.winnerId === m.teamAId },
        sideB: { duo: duoOf(m.teamBId, m.teamBDescription), score: scoreB, winner: completed && m.winnerId === m.teamBId },
      };
    };

    const columns = buildBracketColumns(matches);
    const bracketRounds: BracketRound[] = columns.map((c) => ({ id: c.key, label: c.label, matches: c.matches.map(toBracketMatch) }));

    const poolIds = distinctPoolIds(matches);
    const groups: CategoryGroup[] = poolIds.map((poolId, i) => {
      const standings = buildGroupStandings(matches, poolId);
      const rows: GroupStanding[] = standings.map((s, idx) => ({
        rank: idx + 1,
        duo: duoOf(s.teamId, null) ?? { id: s.teamId, name: 'Dupla', isViewer: false },
        wins: s.wins,
        losses: matches.filter((m) => m.poolId === poolId && matchIsCompleted(m) && (m.teamAId === s.teamId || m.teamBId === s.teamId) && m.winnerId !== s.teamId).length,
        setsFor: s.setsWon,
        setsAgainst: s.setsLost,
        points: s.points,
        qualifies: idx < category.qualifiersPerGroup,
      }));
      return { id: poolId, letter: String.fromCharCode(65 + i), standings: rows };
    });

    const formatLabel = FORMAT_LABEL[category.bracketFormat.toLowerCase()] ?? titleCase(category.bracketFormat);

    this.bracketData.set({
      categoryId: category.id,
      categoryName: category.categoryName,
      format: groups.length > 0 ? 'grupos' : 'chave',
      formatSummaryLabel: formatLabel,
      groups,
      groupsQualifyNote: groups.length > 0 ? `Os ${category.qualifiersPerGroup} primeiros de cada grupo avançam para a eliminatória.` : null,
      eliminationPreviewRounds: bracketRounds,
      bracketRounds,
    });
  }

  protected selectCategory(id: string): void {
    this.selectedCategoryId.set(id);
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

function teamDisplayName(team: ArenaTeam | undefined, profiles: Map<string, AthletePublicProfile>): string | null {
  if (!team) return null;
  if (team.teamName) return team.teamName;
  const p1 = profiles.get(team.player1Id)?.displayName?.split(' ')[0];
  const p2 = profiles.get(team.player2Id)?.displayName?.split(' ')[0];
  if (!p1 && !p2) return null;
  return `${p1 ?? 'Atleta'} / ${p2 ?? 'Atleta'}`;
}

function setScoreOf(m: TournamentMatch): [number | null, number | null] {
  if (m.sets.length > 0) {
    const a = m.sets.filter((s) => s.a > s.b).length;
    const b = m.sets.filter((s) => s.b > s.a).length;
    return [a, b];
  }
  if (m.resultA && m.resultB) {
    const setsA = m.resultA.split(',').map(Number);
    const setsB = m.resultB.split(',').map(Number);
    let a = 0;
    let b = 0;
    for (let i = 0; i < Math.max(setsA.length, setsB.length); i++) {
      if ((setsA[i] ?? 0) > (setsB[i] ?? 0)) a++;
      else if ((setsB[i] ?? 0) > (setsA[i] ?? 0)) b++;
    }
    return [a || null, b || null];
  }
  return [null, null];
}
