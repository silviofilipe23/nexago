import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import { doc, getDoc, getDocs, getFirestore, collection, query, where, limit, type DocumentData, type DocumentSnapshot, type Firestore } from 'firebase/firestore';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { AuthShellComponent } from '../auth/ui/auth-shell.component';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { NxPageLoadingComponent } from '../shared/loading/nx-page-loading.component';
import { ACHIEVEMENT_CATALOG, buildAchievementViewModels } from './achievement-catalog';
import { AthleteGamificationService } from './athlete-gamification.service';
import type { ProfileDemoExtras } from './public-profile-demo.models';

/** Escopo do ranking publico: hub inteiro, liga ou arena especifica. */
export type PublicRankingScope = 'global' | 'league' | 'arena';

export interface PublicRankingEntry {
  scope: PublicRankingScope;
  /** id/slug da arena ou liga quando aplicavel */
  scopeRef: string | null;
  label: string;
  positionLabel: string | null;
  pointsLabel: string | null;
  categoryLabel: string | null;
}

export interface PublicAthleteProfile {
  uid: string;
  fullName: string;
  handle: string;
  headline: string;
  bio: string;
  city: string;
  state: string;
  country: string;
  locationLabel: string;
  coverPhotoUrl: string | null;
  profilePhotoUrl: string | null;
  sports: string[];
  primarySport: string | null;
  level: string;
  category: string | null;
  favoritePosition: string | null;
  dominantHand: string | null;
  heightLabel: string | null;
  preferredCourtSide: string | null;
  partnerName: string | null;
  instagram: string | null;
  instagramUrl: string | null;
  availabilityNote: string | null;
  availabilitySlots: string[];
  goals: string | null;
  achievements: string[];
  lookingForPartner: boolean;
  openToTournaments: boolean;
  openToCasualGames: boolean;
  completionScore: number;
  profileStrength: string;
  rankings: PublicRankingEntry[];
}

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) {
    return null;
  }
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

function readString(data: DocumentData | null | undefined, keys: readonly string[]): string {
  if (!data) {
    return '';
  }
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return '';
}

function readBoolean(data: DocumentData | null | undefined, keys: readonly string[], fallback = false): boolean {
  if (!data) {
    return fallback;
  }
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'boolean') {
      return value;
    }
  }
  return fallback;
}

function readNumber(data: DocumentData | null | undefined, keys: readonly string[]): number | null {
  if (!data) {
    return null;
  }
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

function readStringArray(data: DocumentData | null | undefined, keys: readonly string[]): string[] {
  if (!data) {
    return [];
  }
  for (const key of keys) {
    const value = data[key];
    if (Array.isArray(value)) {
      return Array.from(
        new Set(
          value
            .filter((item): item is string => typeof item === 'string')
            .map((item) => item.trim())
            .filter((item) => item.length > 0),
        ),
      );
    }
  }
  return [];
}

function toProfileStrength(score: number, stored: string): string {
  if (stored.trim()) {
    return stored.trim();
  }
  if (score >= 85) {
    return 'Perfil forte';
  }
  if (score >= 60) {
    return 'Perfil promissor';
  }
  return 'Perfil em construcao';
}

function toHeightLabel(value: number | null): string | null {
  return value && value > 0 ? `${Math.round(value)} cm` : null;
}

function formatPoints(value: number | null): string | null {
  if (value == null) {
    return null;
  }
  return `${new Intl.NumberFormat('pt-BR').format(Math.round(value))} pts`;
}

function formatPosition(value: number | null): string | null {
  if (value == null) {
    return null;
  }
  return `#${Math.round(value)}`;
}

function normalizeRankingScope(raw: string): PublicRankingScope {
  const x = raw.trim().toLowerCase();
  if (['arena', 'quadra', 'venue', 'centro', 'club'].includes(x)) {
    return 'arena';
  }
  if (['league', 'liga', 'campeonato', 'championship'].includes(x)) {
    return 'league';
  }
  if (['global', 'geral', 'nexago', 'hub', 'overall'].includes(x)) {
    return 'global';
  }
  return 'global';
}

function inferRankingScope(o: DocumentData): PublicRankingScope {
  const explicit = readString(o, ['scope', 'type', 'kind']);
  if (explicit) {
    return normalizeRankingScope(explicit);
  }
  if (readString(o, ['arenaId', 'venueId', 'arenaSlug'])) {
    return 'arena';
  }
  if (readString(o, ['leagueId', 'ligaId', 'leagueSlug'])) {
    return 'league';
  }
  return 'global';
}

function readRankingScopeRef(o: DocumentData): string | null {
  return (
    readString(o, ['scopeRef', 'arenaId', 'leagueId', 'venueId', 'ligaId', 'slug', 'externalId']) ||
    null
  );
}

function rankingEntryLabel(o: DocumentData, scope: PublicRankingScope): string {
  const named = readString(o, ['label', 'name', 'title', 'rankingName', 'displayName']);
  if (named) {
    return named;
  }
  const arena = readString(o, ['arenaName', 'venueName']);
  if (arena) {
    return arena;
  }
  const league = readString(o, ['leagueName', 'ligaName']);
  if (league) {
    return league;
  }
  switch (scope) {
    case 'global':
      return 'NexaGO geral';
    case 'arena':
      return 'Arena';
    case 'league':
      return 'Liga';
  }
}

function sortRankingsPublic(a: PublicRankingEntry, b: PublicRankingEntry): number {
  const order = (s: PublicRankingScope) => (s === 'global' ? 0 : s === 'league' ? 1 : 2);
  const d = order(a.scope) - order(b.scope);
  if (d !== 0) {
    return d;
  }
  return a.label.localeCompare(b.label, 'pt');
}

function parseRankingsArrayFromDoc(rankingData: DocumentData): PublicRankingEntry[] {
  const keys = ['rankings', 'publicRankings', 'rankingEntries', 'entries'] as const;
  let arr: unknown = null;
  for (const key of keys) {
    const value = rankingData[key];
    if (Array.isArray(value)) {
      arr = value;
      break;
    }
  }
  if (!Array.isArray(arr)) {
    return [];
  }

  const out: PublicRankingEntry[] = [];
  const seen = new Set<string>();

  for (const raw of arr) {
    if (!raw || typeof raw !== 'object') {
      continue;
    }
    const o = raw as DocumentData;
    const scope = inferRankingScope(o);
    const scopeRef = readRankingScopeRef(o);
    const label = rankingEntryLabel(o, scope);
    const positionLabel = formatPosition(readNumber(o, ['position', 'rank', 'placement']));
    const pointsLabel = formatPoints(readNumber(o, ['points', 'score', 'rankingPoints']));
    const categoryLabel =
      readString(o, ['categoryLabel', 'category', 'categoryId', 'division']) || null;
    if (!positionLabel && !pointsLabel) {
      continue;
    }
    const dedupeKey = `${scope}:${scopeRef ?? ''}:${label}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    out.push({ scope, scopeRef, label, positionLabel, pointsLabel, categoryLabel });
  }
  out.sort(sortRankingsPublic);
  return out;
}

function mergeLegacySingleRankingDoc(
  rankingData: DocumentData,
  existing: PublicRankingEntry[],
): PublicRankingEntry[] {
  const legacyPos = formatPosition(readNumber(rankingData, ['position', 'rank', 'placement']));
  const legacyPts = formatPoints(readNumber(rankingData, ['points', 'score', 'rankingPoints']));
  if (!legacyPos && !legacyPts) {
    return existing;
  }
  const hasGlobal = existing.some((e) => e.scope === 'global');
  if (hasGlobal) {
    return existing;
  }
  const categoryLabel =
    readString(rankingData, ['categoryLabel', 'category', 'categoryId', 'division']) || null;
  const label =
    readString(rankingData, ['globalRankingLabel', 'label']) || 'NexaGO geral';
  const globalEntry: PublicRankingEntry = {
    scope: 'global',
    scopeRef: null,
    label,
    positionLabel: legacyPos,
    pointsLabel: legacyPts,
    categoryLabel,
  };
  return [globalEntry, ...existing].sort(sortRankingsPublic);
}

/**
 * Le o documento publico `artifacts/{projectId}/public/data/athleteRankings/{athleteUid}`.
 *
 * Multiplos rankings: use um array em `rankings` (ou `publicRankings`, `rankingEntries`, `entries`).
 * Cada item pode ter `scope` global | league | arena (ou inferimos por `arenaId` / `leagueId`),
 * `label` / `name` / `arenaName` / `leagueName`, `position` | `rank`, `points` | `score`,
 * `categoryLabel` | `category`, e ids `arenaId` | `leagueId` | `slug`.
 *
 * Legado: `position` / `points` / `category` na raiz do documento viram uma entrada "NexaGO geral"
 * quando ainda nao existe entrada global no array.
 */
function buildPublicRankingsList(rankingData: DocumentData | null): PublicRankingEntry[] {
  if (!rankingData) {
    return [];
  }
  const fromArray = parseRankingsArrayFromDoc(rankingData);
  return mergeLegacySingleRankingDoc(rankingData, fromArray);
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

@Component({
  selector: 'app-athlete-public-profile',
  standalone: true,
  imports: [RouterLink, NgTemplateOutlet, AtPanelShellComponent, NxPageLoadingComponent, AuthShellComponent],
  templateUrl: './athlete-public-profile.component.html',
  styleUrl: './athlete-public-profile.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AthletePublicProfileComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly gamification = inject(AthleteGamificationService);
  private readonly firestore = createFirestore();

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly copyFeedback = signal<string | null>(null);
  protected readonly actionNotice = signal<string | null>(null);
  protected readonly profile = signal<PublicAthleteProfile | null>(null);
  protected readonly followed = signal(false);

  private noticeTimeout: ReturnType<typeof setTimeout> | undefined;

  protected readonly handle = computed(() => this.route.snapshot.paramMap.get('handle') ?? '');
  protected readonly profileUrl = computed(() => {
    const origin = typeof location !== 'undefined' ? location.origin : 'https://nexago.app';
    // Sempre compartilha o uid (chave real de `public_profiles`), mesmo se a rota chegou
    // por um slug legado (`atleta-nome-xxxxxxxx`).
    const uid = this.profile()?.uid ?? this.handle();
    return `${origin}/atletas/${uid}`;
  });
  protected readonly sportsHeadline = computed(() => {
    const profile = this.profile();
    if (!profile) {
      return '';
    }
    return profile.sports.join(' · ');
  });

  protected readonly hasSession = computed(() => this.auth.user() != null || this.auth.devEmail() != null);

  protected readonly viewerAccountLabel = computed(() => {
    const liveUser = this.auth.user();
    if (liveUser?.displayName?.trim()) return liveUser.displayName.trim();
    if (liveUser?.email?.trim()) return nameFromEmail(liveUser.email);
    const devEmail = this.auth.devEmail();
    return devEmail?.trim() ? nameFromEmail(devEmail) : 'Atleta';
  });
  protected readonly viewerInitials = computed(() => initialsOf(this.viewerAccountLabel()));

  protected readonly isSelfProfile = computed(() => {
    const p = this.profile();
    const uid = this.auth.user()?.uid;
    return !!p && !!uid && p.uid === uid;
  });

  protected readonly demoExtras = computed<ProfileDemoExtras | null>(() => {
    if (!this.isSelfProfile()) {
      return null;
    }
    const summary = this.gamification.summary();
    if (!summary) {
      return null;
    }
    const achievementViewModels = buildAchievementViewModels(this.gamification.unlockedAchievementIds());
    return {
      levelNumber: summary.level,
      xpInLevel: summary.progress.xpInLevel,
      xpForNextLevel: summary.progress.xpForNextLevel,
      xpProgressPercent: Math.round(summary.progress.progressRatio * 100),
      totalGames: summary.totalGames,
      wins: null,
      streakDays: summary.streak,
      achievementViewModels,
      unlockedCount: achievementViewModels.filter((a) => a.unlocked).length,
      achievementTotal: ACHIEVEMENT_CATALOG.length,
      teams: [],
      matches: [],
    };
  });

  protected readonly primaryRanking = computed(() => this.profile()?.rankings[0] ?? null);

  protected readonly firstName = computed(() => this.profile()?.fullName.split(/\s+/)[0] ?? 'atleta');

  protected readonly backLink = computed<{ label: string; path: string; sourceLabel: string } | null>(() => {
    const from = this.route.snapshot.queryParamMap.get('from');
    if (from === 'ranking') {
      return { label: 'Voltar ao ranking', path: '/ranking', sourceLabel: 'ranking' };
    }
    if (from === 'atletas') {
      return { label: 'Voltar a atletas', path: '/atletas', sourceLabel: 'atletas' };
    }
    return null;
  });

  constructor() {
    void this.loadProfile();
  }

  private async loadProfile(): Promise<void> {
    const profileIdentifier = this.handle().trim();

    if (!environment.production) {
      console.info('[athlete-public-profile] lookup', {
        projectId: environment.firebase.projectId,
        routeHandle: profileIdentifier,
      });
    }
    if (!profileIdentifier || !this.firestore) {
      this.error.set('Perfil nao disponivel no momento.');
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      // `public_profiles/{uid}` é o mirror sem PII mantido por Cloud Function a cada escrita em
      // `users/{uid}` (`onUserWrittenSyncPublicProfile`) — chave é o próprio uid.
      // Links antigos usavam um slug (`buildPublicProfileId`); se o id da rota não for o uid,
      // resolvemos via `athlete_profiles.publicProfileId` e carregamos o mirror pelo uid.
      const docSnap = await this.resolvePublicProfileDoc(profileIdentifier);
      if (!environment.production) {
        console.info('[athlete-public-profile] public_profiles lookup', {
          routeHandle: profileIdentifier,
          uid: docSnap?.id ?? null,
          exists: docSnap?.exists() ?? false,
        });
      }

      if (!docSnap?.exists()) {
        this.error.set('Perfil publico nao encontrado.');
        this.loading.set(false);
        return;
      }

      const data = docSnap.data();
      const prefs = data['privacyPreferences'] as DocumentData | undefined;
      const publicProfileEnabled = prefs && 'publicProfileEnabled' in prefs ? prefs['publicProfileEnabled'] !== false : data['publicProfileEnabled'] !== false;
      const visibility = typeof prefs?.['profileVisibility'] === 'string' ? (prefs['profileVisibility'] as string) : null;
      if (!publicProfileEnabled || visibility === 'private') {
        this.error.set('Perfil publico nao encontrado.');
        this.loading.set(false);
        return;
      }

      let rankingData: DocumentData | null = null;
      const projectId = environment.firebase.projectId;
      if (projectId) {
        const rankingSnap = await getDoc(
          doc(this.firestore, 'artifacts', projectId, 'public', 'data', 'athleteRankings', docSnap.id),
        );
        rankingData = rankingSnap.exists() ? rankingSnap.data() : null;
      }

      const sportOnboarding = data['sportOnboarding'] as DocumentData | undefined;
      const primarySport = readString(sportOnboarding, ['primarySportId']) || readString(data, ['primarySport', 'sport']);
      const secondarySports = readStringArray(sportOnboarding, ['secondarySportIds']);
      const mergedSports = Array.from(new Set([primarySport, ...secondarySports].filter((item) => item.length > 0)));
      const city = readString(data, ['city', 'cidade']);
      const state = readString(data, ['state', 'uf']);
      const country = readString(data, ['country']);
      const completionScore = readNumber(data, ['completionScore']) ?? 62;
      const nickname = readString(data, ['nickname']).replace(/^@/, '');
      const levelsBySport = sportOnboarding?.['levelsBySport'] as DocumentData | undefined;
      const levelForPrimarySport = primarySport ? readString(levelsBySport, [primarySport]) : '';

      this.profile.set({
        uid: docSnap.id,
        fullName: nickname || readString(data, ['fullName', 'name']) || 'Atleta NexaGO',
        handle: nickname || docSnap.id,
        headline: readString(data, ['headline', 'publicHeadline']) || 'Atleta ativo no hub NexaGO',
        bio:
          readString(data, ['bio', 'about']) ||
          'Perfil publico em atualizacao dentro do hub de atletas e esportes.',
        city,
        state,
        country,
        locationLabel: [city, state || country].filter((item) => item.length > 0).join(', '),
        coverPhotoUrl: readString(data, ['coverPhotoUrl', 'coverImageUrl', 'bannerUrl']) || null,
        profilePhotoUrl:
          readString(data, ['profilePhotoUrl', 'photoURL', 'avatarUrl', 'avatar']) || null,
        sports: mergedSports,
        primarySport: primarySport || null,
        level: levelForPrimarySport || readString(data, ['level', 'nivel']) || 'Em evolucao',
        category: readString(data, ['categoryLabel', 'category', 'categoria']) || null,
        favoritePosition: readString(data, ['favoritePosition', 'position']) || null,
        dominantHand: readString(data, ['dominantHand']) || null,
        heightLabel: toHeightLabel(readNumber(data, ['heightCm', 'height'])),
        preferredCourtSide: readString(data, ['preferredCourtSide', 'courtSide']) || null,
        partnerName: readString(data, ['favoritePartnerName', 'partnerName', 'duoPartnerName']) || null,
        instagram: readString(data, ['instagram', 'instagramHandle']) || null,
        instagramUrl: readString(data, ['instagram', 'instagramHandle'])
          ? `https://instagram.com/${readString(data, ['instagram', 'instagramHandle'])}`
          : null,
        availabilityNote: readString(data, ['availabilityNote', 'availability']) || null,
        availabilitySlots: readStringArray(data, ['availabilitySlots']),
        goals: readString(data, ['goals', 'objective']) || null,
        achievements: readStringArray(data, ['achievementHighlights']),
        lookingForPartner: readBoolean(data, ['lookingForPartner'], false),
        openToTournaments: readBoolean(data, ['openToTournaments'], false),
        openToCasualGames: readBoolean(data, ['openToCasualGames'], false),
        completionScore,
        profileStrength: toProfileStrength(completionScore, readString(data, ['profileStrength'])),
        rankings: buildPublicRankingsList(rankingData),
      });
    } catch (error) {
      if (!environment.production) {
        console.error('[athlete-public-profile] load error', error);
      }
      this.error.set('Nao foi possivel carregar este perfil agora.');
    } finally {
      this.loading.set(false);
    }
  }

  /** Resolve `public_profiles/{uid}` pelo uid direto ou, em links legados, pelo slug em
   *  `athlete_profiles.publicProfileId`. */
  private async resolvePublicProfileDoc(routeId: string): Promise<DocumentSnapshot<DocumentData> | null> {
    if (!this.firestore) return null;

    const direct = await getDoc(doc(this.firestore, 'public_profiles', routeId));
    if (direct.exists()) return direct;

    // Slug legado: `marina-santos-abcd1234` (não é uid do Auth).
    if (!routeId.includes('-')) return null;

    const slugSnap = await getDocs(
      query(
        collection(this.firestore, 'athlete_profiles'),
        where('publicProfileId', '==', routeId),
        limit(1),
      ),
    );
    const athleteId = slugSnap.docs[0]?.id;
    if (!athleteId) return null;

    const byUid = await getDoc(doc(this.firestore, 'public_profiles', athleteId));
    return byUid.exists() ? byUid : null;
  }

  protected async copyProfileLink(): Promise<void> {
    this.copyFeedback.set(null);
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(this.profileUrl());
        this.copyFeedback.set('Link copiado.');
        return;
      }
      this.copyFeedback.set('Copie o link manualmente.');
    } catch {
      this.copyFeedback.set('Nao foi possivel copiar agora.');
    }
  }

  protected teamInitials(teamName: string): [string, string] {
    const [a, b] = teamName.split('&').map((part) => part.trim());
    const first = (a ?? teamName).slice(0, 2).toUpperCase();
    const second = (b ?? '').slice(0, 2).toUpperCase() || first;
    return [first, second];
  }

  protected toggleFollow(): void {
    this.followed.update((v) => !v);
  }

  protected sendMessage(): void {
    this.showNotice('Mensagens diretas chegam em breve por aqui.');
  }

  protected challenge(): void {
    const name = this.profile()?.fullName ?? 'este atleta';
    this.showNotice(`Desafio para ${name} chega em breve por aqui.`);
  }

  private showNotice(message: string): void {
    this.actionNotice.set(message);
    clearTimeout(this.noticeTimeout);
    this.noticeTimeout = setTimeout(() => this.actionNotice.set(null), 4000);
  }
}
