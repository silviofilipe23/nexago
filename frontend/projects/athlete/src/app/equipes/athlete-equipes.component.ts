import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ARENA_SPORT_CHIP_OPTIONS, type ArenaSportChip } from '@nexago/arena-discovery';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { AtBellComponent } from '../painel/at-bell.component';
import { fetchPartnerCandidates, fetchPublicProfilesByIds, levelBucketOf, type AthletePublicProfile } from '../data/public-profiles-repository';
import { fetchTeamRankingGeneral } from '../data/rankings-repository';
import { fetchMatchesForTeam, fetchTeamsForAthlete, matchIsCompleted, type ArenaTeam } from '../data/teams-repository';
import type { FilterLevel } from '../ranking/athlete-ranking.models';
import type { MyTeam, PartnerCandidate } from './athlete-equipes.models';

const LEVEL_OPTIONS: readonly FilterLevel[] = ['all', 'Iniciante 1', 'Iniciante 2', 'Intermediário 1', 'Intermediário 2', 'Open'];

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) return null;
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

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
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'AT';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || 'AT';
}

function teamDisplayName(team: ArenaTeam, p1: AthletePublicProfile | undefined, p2: AthletePublicProfile | undefined): string {
  if (team.teamName) return team.teamName;
  const a = p1?.displayName?.split(' ')[0] ?? 'Atleta';
  const b = p2?.displayName?.split(' ')[0] ?? 'Atleta';
  return `${a} / ${b}`;
}

/** Equipes real: "Minhas equipes" vem de `teams` (só existe como efeito de inscrição em
 *  torneio — sem "criar equipe" isolado), vitórias/derrotas de `matches`, ranking de
 *  `teamRankings`. "Buscar parceiro" mostra atletas com `lookingForPartner=true`; convidar de
 *  verdade só acontece dentro do fluxo de inscrição em torneio (`sendTournamentPartnerInvite`,
 *  que exige torneio+categoria) — aqui só orienta pra isso em vez de fingir um convite.
 *  Removi "Buscar equipes" (navegar equipes aleatórias por cidade): não achei nenhuma
 *  referência real a essa busca no app, parece ter sido só maquete. */
@Component({
  selector: 'app-athlete-equipes',
  standalone: true,
  imports: [RouterLink, AtPanelShellComponent, AtBellComponent],
  templateUrl: './athlete-equipes.component.html',
  styleUrl: './athlete-equipes.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.meta.k)': 'focusSearch($event)',
    '(document:keydown.control.k)': 'focusSearch($event)',
  },
})
export class AthleteEquipesComponent {
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly firestore = createFirestore();

  protected readonly searchInputRef = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  protected readonly accountLabel = computed(() => {
    const liveUser = this.auth.user();
    if (liveUser?.displayName?.trim()) return liveUser.displayName.trim();
    if (liveUser?.email?.trim()) return nameFromEmail(liveUser.email);
    const devEmail = this.auth.devEmail();
    return devEmail?.trim() ? nameFromEmail(devEmail) : 'Atleta';
  });
  protected readonly headerInitials = computed(() => initialsOf(this.accountLabel()));

  protected readonly queryInput = signal('');
  protected readonly filterQuery = signal('');
  private queryDebounceHandle: ReturnType<typeof setTimeout> | undefined;

  protected readonly myTeamsLoading = signal(true);
  protected readonly myTeams = signal<MyTeam[]>([]);
  protected readonly partnersLoading = signal(true);
  protected readonly partnerCandidates = signal<readonly PartnerCandidate[]>([]);
  protected readonly notifiedPartnerIds = signal<ReadonlySet<string>>(new Set());

  protected readonly eventNotice = signal<string | null>(null);
  private noticeTimeout: ReturnType<typeof setTimeout> | undefined;

  protected readonly sportOptions = ARENA_SPORT_CHIP_OPTIONS.filter((o) => o.chip !== 'all');
  protected readonly levelOptions = LEVEL_OPTIONS;

  protected readonly partnerSportFilter = signal<ArenaSportChip>('beachVolleyball');
  protected readonly partnerLevelFilter = signal<FilterLevel>('all');

  protected readonly filteredMyTeams = computed(() => {
    const q = this.filterQuery().trim().toLowerCase();
    return this.myTeams().filter((t) => !q || t.name.toLowerCase().includes(q));
  });

  protected readonly filteredPartners = computed(() => {
    const sport = this.partnerSportFilter();
    const level = this.partnerLevelFilter();
    const q = this.filterQuery().trim().toLowerCase();

    return this.partnerCandidates()
      .filter((p) => p.sport === sport)
      .filter((p) => level === 'all' || p.level === level)
      .filter((p) => !q || p.name.toLowerCase().includes(q));
  });

  protected readonly myTeamsCountLabel = computed(() => {
    const n = this.filteredMyTeams().length;
    return `${n} equipe${n === 1 ? '' : 's'}`;
  });

  protected readonly partnersCountLabel = computed(() => {
    const n = this.filteredPartners().length;
    return `${n} atleta${n === 1 ? '' : 's'} de olho em dupla`;
  });

  constructor() {
    this.destroyRef.onDestroy(() => {
      clearTimeout(this.queryDebounceHandle);
      clearTimeout(this.noticeTimeout);
    });

    effect(() => {
      const uid = this.auth.user()?.uid ?? null;
      void this.loadMyTeams(uid);
      void this.loadPartnerCandidates(uid);
    });
  }

  private async loadMyTeams(uid: string | null): Promise<void> {
    const db = this.firestore;
    const projectId = environment.firebase.projectId;
    if (!db || !projectId || !uid) {
      this.myTeams.set([]);
      this.myTeamsLoading.set(false);
      return;
    }

    this.myTeamsLoading.set(true);
    try {
      const [teams, generalRanking] = await Promise.all([fetchTeamsForAthlete(db, projectId, uid), fetchTeamRankingGeneral(db, projectId)]);
      const rankPositionByTeamId = new Map(generalRanking.map((r, i) => [r.id, i + 1]));
      const profileIds = teams.flatMap((t) => [t.player1Id, t.player2Id]);
      const profiles = await fetchPublicProfilesByIds(db, profileIds);

      const rows = await Promise.all(
        teams.map(async (team) => {
          const matches = await fetchMatchesForTeam(db, projectId, team.id);
          const completed = matches.filter(matchIsCompleted);
          const wins = completed.filter((m) => m.winnerId === team.id).length;
          const p1 = profiles.get(team.player1Id);
          const p2 = profiles.get(team.player2Id);
          const row: MyTeam = {
            id: team.id,
            memberAInitials: initialsOf(p1?.displayName ?? 'Atleta'),
            memberBInitials: initialsOf(p2?.displayName ?? 'Atleta'),
            name: teamDisplayName(team, p1, p2),
            sport: p1?.sportChip ?? p2?.sportChip ?? 'beachVolleyball',
            level: levelBucketOf(p1?.levelCode ?? p2?.levelCode ?? null),
            wins,
            losses: completed.length - wins,
            doublesRank: rankPositionByTeamId.get(team.id) ?? null,
          };
          return row;
        }),
      );
      this.myTeams.set(rows);
    } catch {
      this.myTeams.set([]);
    } finally {
      this.myTeamsLoading.set(false);
    }
  }

  private async loadPartnerCandidates(uid: string | null): Promise<void> {
    const db = this.firestore;
    if (!db) {
      this.partnerCandidates.set([]);
      this.partnersLoading.set(false);
      return;
    }
    this.partnersLoading.set(true);
    try {
      const profiles = await fetchPartnerCandidates(db, uid);
      this.partnerCandidates.set(
        profiles.map((p) => ({
          id: p.id,
          initials: initialsOf(p.displayName),
          name: p.displayName,
          locationLabel: p.city ?? 'Cidade não informada',
          level: levelBucketOf(p.levelCode),
          sport: p.sportChip,
        })),
      );
    } catch {
      this.partnerCandidates.set([]);
    } finally {
      this.partnersLoading.set(false);
    }
  }

  protected focusSearch(event: Event): void {
    event.preventDefault();
    this.searchInputRef()?.nativeElement.focus();
  }

  protected onQueryInput(value: string): void {
    this.queryInput.set(value);
    clearTimeout(this.queryDebounceHandle);
    this.queryDebounceHandle = setTimeout(() => this.filterQuery.set(value), 250);
  }

  protected setPartnerSport(chip: string): void {
    this.partnerSportFilter.set(chip as ArenaSportChip);
  }

  protected setPartnerLevel(level: string): void {
    this.partnerLevelFilter.set(level as FilterLevel);
  }

  protected sportLabel(chip: ArenaSportChip): string {
    return this.sportOptions.find((o) => o.chip === chip)?.label ?? chip;
  }

  protected levelLabel(level: FilterLevel): string {
    return level === 'all' ? 'Todas categorias' : level;
  }

  protected isNotified(id: string): boolean {
    return this.notifiedPartnerIds().has(id);
  }

  /** O convite de verdade (`sendTournamentPartnerInvite`) exige um torneio+categoria — não dá
   *  pra disparar daqui de forma isolada. Só orienta o fluxo real em vez de fingir um envio. */
  protected explainInvite(candidate: PartnerCandidate): void {
    this.notifiedPartnerIds.update((ids) => new Set(ids).add(candidate.id));
    this.showNotice(`Pra convidar ${candidate.name}, inicie a inscrição em um torneio e convide como parceiro por lá.`);
  }

  private showNotice(message: string): void {
    this.eventNotice.set(message);
    clearTimeout(this.noticeTimeout);
    this.noticeTimeout = setTimeout(() => this.eventNotice.set(null), 5000);
  }
}
