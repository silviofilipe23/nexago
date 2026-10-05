import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { AtBellComponent } from '../painel/at-bell.component';
import { NxPageLoadingComponent } from '../shared/loading/nx-page-loading.component';
import { levelLabelOf } from '../data/athlete-level';
import { fetchPublicProfilesByIds, levelForSport, type AthletePublicProfile } from '../data/public-profiles-repository';
import {
  fetchAthleteRankingBySport,
  fetchTeamRankingBySport,
  pointsForPeriod,
  type RankingBySportRow,
} from '../data/rankings-repository';
import { fetchMyAthleteProfile } from '../data/my-athlete-profile-repository';
import { fetchTeamsByIds, teamIsLookingForPartner, teamMemberIds, type ArenaTeam } from '../data/teams-repository';
import { RANKING_SCORING_RULES } from './athlete-ranking.models';
import type { FilterFormat, FilterGender, FilterLevel, RankingAvatar, RankingMode, RankingParticipant, RankingPeriod } from './athlete-ranking.models';
import {
  CITY_ALL,
  DEFAULT_RANKING_SPORT,
  RANKING_SPORT_OPTIONS,
  defaultRankingSport,
  deriveTeamGender,
  athleteProfileLink,
  hasSearchQuery,
  normalizeRankingGender,
  rankParticipants,
  searchRanking,
  teamFormatOf,
  teamProfileLink,
  type RankingRow,
} from './athlete-ranking.selectors';

export type { RankingRow };

const LEVEL_OPTIONS: readonly FilterLevel[] = ['all', 'Iniciante 1', 'Iniciante 2', 'Intermediário 1', 'Intermediário 2', 'Avançado 1', 'Avançado 2', 'Open'];
const GENDER_OPTIONS: readonly FilterGender[] = ['all', 'male', 'female', 'mixed'];
const GENDER_LABELS: Record<FilterGender, string> = { all: 'Todos os gêneros', male: 'Masculino', female: 'Feminino', mixed: 'Misto' };
const FORMAT_OPTIONS: readonly FilterFormat[] = ['all', 'dupla', 'trio', 'quarteto', 'quinteto'];
const FORMAT_LABELS: Record<FilterFormat, string> = { all: 'Todos os formatos', dupla: 'Dupla', trio: 'Trio', quarteto: 'Quarteto', quinteto: 'Quinteto' };

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

function trendTone(trend: number): 'up' | 'down' | 'neutral' {
  if (trend > 0) return 'up';
  if (trend < 0) return 'down';
  return 'neutral';
}

function avatarOf(profile: AthletePublicProfile | undefined, fallbackName: string): RankingAvatar {
  const name = profile?.displayName ?? fallbackName;
  return { url: profile?.avatarUrl ?? null, initials: initialsOf(name) };
}

function teamDisplayName(team: ArenaTeam, p1: AthletePublicProfile | undefined, p2: AthletePublicProfile | undefined): string {
  if (team.teamName) return team.teamName;
  const a = p1?.displayName?.split(' ')[0] ?? 'Atleta';
  const b = p2?.displayName?.split(' ')[0] ?? 'Atleta';
  return `${a} / ${b}`;
}

/** Ranking real por esporte (multiesporte fase 3b1): `athleteRankingsBySport`/
 *  `teamRankingsBySport` do esporte escolhido — modo Geral soma tudo (`totalPoints`), modo
 *  Temporada lê `pointsByYear` do ano corrente. Sem dado de "trend" (variação de posição) no
 *  backend hoje — sempre 0, sem seta. */
@Component({
  selector: 'app-athlete-ranking',
  standalone: true,
  imports: [NgTemplateOutlet, RouterLink, AtPanelShellComponent, AtBellComponent, NxPageLoadingComponent],
  templateUrl: './athlete-ranking.component.html',
  styleUrl: './athlete-ranking.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.meta.k)': 'focusSearch($event)',
    '(document:keydown.control.k)': 'focusSearch($event)',
  },
})
export class AthleteRankingComponent {
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

  /** Foto do próprio atleta: `users/{uid}.profilePhotoUrl` tem prioridade e cai pro `photoURL`
   *  do Firebase Auth (Google/Apple) — mesma ordem do avatar do shell. */
  private readonly myProfilePhotoUrl = signal<string | null>(null);
  protected readonly myPhotoUrl = computed(() => this.myProfilePhotoUrl() ?? this.auth.user()?.photoURL ?? null);

  protected readonly mode = signal<RankingMode>('individual');
  protected readonly period = signal<RankingPeriod>('geral');
  protected readonly currentYear = new Date().getFullYear();

  protected readonly queryInput = signal('');
  protected readonly filterQuery = signal('');
  /** Código de perfil do esporte do ranking. Abre em vôlei de praia e troca para o esporte
   *  principal quando o perfil chega — a lista não espera a leitura do perfil. */
  protected readonly sportFilter = signal<string>(DEFAULT_RANKING_SPORT);
  /** O atleta escolheu um esporte: o principal que chegar depois não sobrescreve. */
  private sportChosen = false;
  /** Cada leitura ganha um número; resposta de leitura velha (troca rápida de filtro) é descartada. */
  private loadGeneration = 0;
  protected readonly levelFilter = signal<FilterLevel>('all');
  protected readonly cityFilter = signal<string>(CITY_ALL);
  protected readonly genderFilter = signal<FilterGender>('all');
  protected readonly formatFilter = signal<FilterFormat>('all');

  private queryDebounceHandle: ReturnType<typeof setTimeout> | undefined;

  protected readonly sportOptions = RANKING_SPORT_OPTIONS;
  protected readonly levelOptions = LEVEL_OPTIONS;
  protected readonly genderOptions = GENDER_OPTIONS;
  protected readonly formatOptions = FORMAT_OPTIONS;

  protected readonly loading = signal(true);
  protected readonly allParticipants = signal<readonly RankingParticipant[]>([]);

  protected readonly cityOptions = computed(() => {
    const cities = [...new Set(this.allParticipants().map((p) => p.city).filter((c) => c.length > 0))].sort((a, b) => a.localeCompare(b));
    return [CITY_ALL, ...cities];
  });

  /** Ranking do recorte (esporte, já na leitura, + categoria + cidade + gênero + formato). A busca fica de
   *  fora de propósito: ela é consulta, não recorte — se entrasse aqui renumeraria o buscado
   *  como 1º e o jogaria no pódio, além de zerar o card "Sua posição". */
  protected readonly rankedList = computed<RankingRow[]>(() =>
    rankParticipants(this.allParticipants(), {
      level: this.levelFilter(),
      city: this.cityFilter(),
      gender: this.genderFilter(),
      format: this.formatFilter(),
    }),
  );

  protected readonly hasQuery = computed(() => hasSearchQuery(this.filterQuery()));
  /** Linhas que casam com a busca, carregando a posição real do recorte. */
  protected readonly searchResults = computed(() => searchRanking(this.rankedList(), this.filterQuery()));
  protected readonly searchCount = computed(() => this.searchResults().length);
  protected readonly searchCountLabel = computed(() =>
    this.searchCount() === 1 ? '1 resultado' : `${this.searchCount()} resultados`,
  );
  /** Recorte ativo em texto — o esporte abre no principal do atleta, então sem isso a busca
   *  por alguém que só pontuou em outro esporte dá "nenhum resultado" sem explicar por quê.
   *  Gênero/formato só entram quando ativos, senão a linha vira um trem de "Todos os…". */
  protected readonly sliceLabel = computed(() => {
    const parts = [this.sportLabel(this.sportFilter()), this.levelLabel(this.levelFilter()), this.cityLabel(this.cityFilter())];
    if (this.genderFilter() !== 'all') parts.push(this.genderLabel(this.genderFilter()));
    if (this.formatFilter() !== 'all') parts.push(this.formatLabel(this.formatFilter()));
    return parts.join(' · ');
  });

  protected readonly podium = computed(() => this.rankedList().slice(0, 3));
  protected readonly restList = computed(() => this.rankedList().slice(3));
  protected readonly totalCount = computed(() => this.rankedList().length);
  protected readonly topLabel = computed(() => `Top ${this.totalCount()} da região`);
  protected readonly modeLabel = computed(() => (this.mode() === 'individual' ? 'Ranking individual' : 'Ranking de duplas'));

  protected readonly selfEntry = computed(() => {
    const uid = this.auth.user()?.uid;
    if (!uid) return null;
    const row = this.rankedList().find((p) => p.id === uid);
    return row
      ? {
          rank: row.rank,
          name: row.name,
          city: row.city,
          points: row.points,
          level: row.level,
          trend: row.trend,
          // Do próprio row: se o seu espelho público não existe, a foto também não abre perfil.
          profileLink: row.profileLink,
        }
      : null;
  });

  /** Card "Sua posição": a foto vem do próprio cadastro, não do espelho público, então
   *  aparece mesmo quando o perfil está fora da busca. */
  protected readonly selfAvatars = computed<readonly RankingAvatar[]>(() => [
    { url: this.myPhotoUrl(), initials: this.headerInitials() },
  ]);

  protected readonly scoringRules = RANKING_SCORING_RULES;

  constructor() {
    this.destroyRef.onDestroy(() => clearTimeout(this.queryDebounceHandle));

    effect(() => {
      const mode = this.mode();
      const period = this.period();
      const sport = this.sportFilter();
      void this.loadRanking(mode, period, sport);
    });

    effect(() => {
      const uid = this.auth.user()?.uid;
      const db = this.firestore;
      if (!uid || !db) {
        this.myProfilePhotoUrl.set(null);
        this.applyDefaultSport(null);
        return;
      }
      fetchMyAthleteProfile(db, uid)
        .then((profile) => {
          this.myProfilePhotoUrl.set(profile?.profilePhotoUrl ?? null);
          this.applyDefaultSport(profile?.primarySportId ?? null);
        })
        .catch(() => {
          this.myProfilePhotoUrl.set(null);
          this.applyDefaultSport(null);
        });
    });
  }

  private applyDefaultSport(primarySportId: string | null): void {
    if (this.sportChosen) return;
    this.sportFilter.set(defaultRankingSport(primarySportId));
  }

  private async loadRanking(mode: RankingMode, period: RankingPeriod, sport: string): Promise<void> {
    const db = this.firestore;
    const projectId = environment.firebase.projectId;
    const generation = ++this.loadGeneration;
    if (!db || !projectId) {
      this.allParticipants.set([]);
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    // Temporada: só quem pontuou no ano entra (doc por esporte guarda o histórico inteiro).
    const scored = (rows: RankingBySportRow[]) =>
      rows
        .map((r) => ({ id: r.id, points: pointsForPeriod(r, period, this.currentYear) }))
        .filter((r) => period === 'geral' || r.points > 0);
    try {
      let participants: RankingParticipant[];
      if (mode === 'individual') {
        const rows = scored(await fetchAthleteRankingBySport(db, projectId, sport));
        const profiles = await fetchPublicProfilesByIds(db, rows.map((r) => r.id));
        participants = rows.map((r) => this.participantFromAthlete(r.id, r.points, profiles.get(r.id), sport));
      } else {
        const rows = scored(await fetchTeamRankingBySport(db, projectId, sport));
        const teams = await fetchTeamsByIds(db, projectId, rows.map((r) => r.id));
        const profileIds = [...teams.values()].flatMap((t) => teamMemberIds(t));
        const profiles = await fetchPublicProfilesByIds(db, profileIds);
        participants = rows
          .filter((r) => teams.has(r.id))
          .map((r) => this.participantFromTeam(r.id, r.points, teams.get(r.id)!, profiles, sport));
      }
      if (generation === this.loadGeneration) this.allParticipants.set(participants);
    } catch {
      if (generation === this.loadGeneration) this.allParticipants.set([]);
    } finally {
      if (generation === this.loadGeneration) this.loading.set(false);
    }
  }

  private participantFromAthlete(id: string, points: number, profile: AthletePublicProfile | undefined, sport: string): RankingParticipant {
    const name = profile?.displayName ?? `Atleta (…${id.slice(-6)})`;
    return {
      id,
      name,
      city: profile?.city ?? '',
      points,
      level: levelLabelOf(profile ? levelForSport(profile, sport) : null),
      gender: normalizeRankingGender(profile?.gender),
      format: null,
      trend: 0,
      avatars: [avatarOf(profile, name)],
      profileLink: athleteProfileLink(id, profile != null),
    };
  }

  private participantFromTeam(
    id: string,
    points: number,
    team: ArenaTeam,
    profiles: Map<string, AthletePublicProfile>,
    sport: string,
  ): RankingParticipant {
    const memberIds = teamMemberIds(team);
    const gender = deriveTeamGender(team.gender, memberIds.map((uid) => profiles.get(uid)?.gender ?? null));
    const format = teamFormatOf(team.teamSize, memberIds.length);
    if (teamIsLookingForPartner(team)) {
      // Só um atleta de verdade na dupla — mostra a foto dele, não um par com o mesmo rosto duas vezes.
      const solo = profiles.get(team.player1Id);
      return {
        id,
        name: 'Dupla incompleta',
        city: '',
        points,
        level: null,
        gender,
        format,
        trend: 0,
        avatars: [avatarOf(solo, 'Atleta')],
        profileLink: teamProfileLink(id, false),
      };
    }
    const p1 = profiles.get(team.player1Id);
    const p2 = profiles.get(team.player2Id);
    return {
      id,
      name: teamDisplayName(team, p1, p2),
      city: p1?.city ?? p2?.city ?? '',
      points,
      level: levelLabelOf((p1 ? levelForSport(p1, sport) : null) ?? (p2 ? levelForSport(p2, sport) : null)),
      gender,
      format,
      trend: 0,
      avatars: [avatarOf(p1, 'Atleta'), avatarOf(p2, 'Atleta')],
      profileLink: teamProfileLink(id, true),
    };
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

  protected setMode(mode: RankingMode): void {
    this.mode.set(mode);
    this.cityFilter.set(CITY_ALL);
    // O filtro de formato só existe (e só aparece) no modo Duplas — carregar um "trio"
    // escondido pro Individual deixaria a lista vazia sem nenhum controle visível explicando.
    this.formatFilter.set('all');
  }

  protected isMode(mode: RankingMode): boolean {
    return this.mode() === mode;
  }

  protected setPeriod(period: RankingPeriod): void {
    this.period.set(period);
  }

  protected setSport(code: string): void {
    this.sportChosen = true;
    this.sportFilter.set(code);
    // Outro esporte é outra lista: a cidade escolhida pode nem existir nela (select sem opção).
    this.cityFilter.set(CITY_ALL);
  }

  protected setLevel(level: string): void {
    this.levelFilter.set(level as FilterLevel);
  }

  protected setCity(city: string): void {
    this.cityFilter.set(city);
  }

  protected setGender(gender: string): void {
    this.genderFilter.set(gender as FilterGender);
  }

  protected setFormat(format: string): void {
    this.formatFilter.set(format as FilterFormat);
  }

  protected sportLabel(code: string): string {
    return this.sportOptions.find((o) => o.code === code)?.label ?? code;
  }

  protected levelLabel(level: FilterLevel): string {
    return level === 'all' ? 'Todas categorias' : level;
  }

  protected cityLabel(city: string): string {
    return city === CITY_ALL ? 'Todas as cidades' : city;
  }

  protected genderLabel(gender: FilterGender): string {
    return GENDER_LABELS[gender];
  }

  protected formatLabel(format: FilterFormat): string {
    return FORMAT_LABELS[format];
  }

  /** Reancora o tipo do contexto do `ng-template` da linha, que chega como `any`. */
  protected asRow(value: RankingRow): RankingRow {
    return value;
  }

  /** Idem para o `ng-template` das fotos. */
  protected asAvatars(value: readonly RankingAvatar[]): readonly RankingAvatar[] {
    return value;
  }

  /** Idem para a rota do perfil que chega no contexto das fotos. */
  protected asLink(value: readonly string[] | null): readonly string[] | null {
    return value;
  }

  protected readonly trendTone = trendTone;
  protected readonly absTrend = Math.abs;
}
