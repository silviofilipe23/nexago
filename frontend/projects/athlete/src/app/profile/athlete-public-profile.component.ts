import {
  Component,
  afterNextRender,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink, ActivatedRoute } from '@angular/router';
import gsap from 'gsap';
import { getApps, initializeApp } from 'firebase/app';
import {
  collection,
  getDocs,
  getFirestore,
  limit,
  query,
  where,
  doc,
  getDoc,
  type DocumentData,
  type Firestore,
} from 'firebase/firestore';
import { environment } from '../../environments/environment';

export type PublicProfileTabId = 'sobre' | 'jogos' | 'torneios';

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

interface PublicAthleteProfile {
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

interface ReputationBadge {
  label: string;
  tone: 'accent' | 'success' | 'warning' | 'neutral';
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

function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
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

function buildBadges(profile: PublicAthleteProfile): ReputationBadge[] {
  const badges: ReputationBadge[] = [];
  if (profile.completionScore >= 85) {
    badges.push({ label: 'Perfil premium', tone: 'accent' });
  }
  if (profile.lookingForPartner) {
    badges.push({ label: 'Aberto para dupla', tone: 'success' });
  }
  if (profile.openToTournaments) {
    badges.push({ label: 'Pronto para torneios', tone: 'warning' });
  }
  if (profile.achievements.length >= 2) {
    badges.push({ label: 'Bagagem competitiva', tone: 'neutral' });
  }
  return badges;
}

@Component({
  selector: 'app-athlete-public-profile',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './athlete-public-profile.component.html',
  styleUrl: './athlete-public-profile.component.scss',
})
export class AthletePublicProfileComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly firestore = createFirestore();
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);

  private gsapProfileCtx: gsap.Context | null = null;
  private introTimeline: gsap.core.Timeline | null = null;
  private tabTimeline: gsap.core.Timeline | null = null;
  private lastProfileAnimKey = '';
  private lastTabAnimated: PublicProfileTabId | null = null;

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly copyFeedback = signal<string | null>(null);
  protected readonly profile = signal<PublicAthleteProfile | null>(null);
  protected readonly activeTab = signal<PublicProfileTabId>('sobre');

  protected readonly handle = computed(() => this.route.snapshot.paramMap.get('handle') ?? '');
  protected readonly profileUrl = computed(() => {
    const origin = typeof location !== 'undefined' ? location.origin : 'https://nexago.app';
    return `${origin}/atletas/${this.handle()}`;
  });
  protected readonly badges = computed(() => {
    const profile = this.profile();
    return profile ? buildBadges(profile) : [];
  });
  protected readonly sportsHeadline = computed(() => {
    const profile = this.profile();
    if (!profile) {
      return '';
    }
    return profile.sports.join(' · ');
  });

  constructor() {
    void this.loadProfile();
    const tabParam = this.route.snapshot.queryParamMap.get('aba');
    if (tabParam === 'jogos' || tabParam === 'torneios' || tabParam === 'sobre') {
      this.activeTab.set(tabParam);
    }

    this.destroyRef.onDestroy(() => {
      this.introTimeline?.kill();
      this.tabTimeline?.kill();
      this.gsapProfileCtx?.revert();
      this.gsapProfileCtx = null;
    });

    effect(() => {
      const loading = this.loading();
      const err = this.error();
      const prof = this.profile();
      const tab = this.activeTab();
      const handle = this.handle();

      if (loading && !err) {
        untracked(() =>
          afterNextRender(() => this.animateLoadingShell(), { injector: this.injector }),
        );
        return;
      }
      if (!loading && err) {
        untracked(() =>
          afterNextRender(() => this.animateMessageShell(), { injector: this.injector }),
        );
        return;
      }
      if (!loading && prof) {
        const key = `${handle}:${prof.uid}`;
        untracked(() =>
          afterNextRender(() => this.syncPublicProfileMotion(key, tab), { injector: this.injector }),
        );
      }
    });
  }

  protected setTab(id: PublicProfileTabId, event?: Event): void {
    const el = event?.currentTarget;
    if (el instanceof HTMLElement && !this.prefersReducedMotion()) {
      gsap.fromTo(
        el,
        { scale: 0.97 },
        { scale: 1, duration: 0.22, ease: 'back.out(2)' },
      );
    }
    this.activeTab.set(id);
  }

  protected isTab(id: PublicProfileTabId): boolean {
    return this.activeTab() === id;
  }

  protected rankingTrack(_index: number, entry: PublicRankingEntry): string {
    return `${entry.scope}:${entry.scopeRef ?? ''}:${entry.label}`;
  }

  protected rankingScopePill(entry: PublicRankingEntry): string {
    switch (entry.scope) {
      case 'global':
        return 'Geral';
      case 'league':
        return 'Liga';
      case 'arena':
        return 'Arena';
    }
  }

  private prefersReducedMotion(): boolean {
    return (
      typeof globalThis.matchMedia === 'function' &&
      globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  private animateLoadingShell(): void {
    if (this.prefersReducedMotion()) {
      return;
    }
    const root = this.host.nativeElement;
    const shell = root.querySelector('.public-profile-state');
    if (!shell) {
      return;
    }
    gsap.fromTo(
      shell,
      { opacity: 0, y: 14 },
      { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' },
    );
    const lines = shell.querySelectorAll('.public-profile-state__eyebrow, h1, .text-muted');
    gsap.fromTo(
      lines,
      { opacity: 0, y: 10 },
      { opacity: 1, y: 0, duration: 0.42, stagger: 0.07, ease: 'power2.out', delay: 0.06 },
    );
  }

  private animateMessageShell(): void {
    if (this.prefersReducedMotion()) {
      return;
    }
    const root = this.host.nativeElement;
    const shell = root.querySelector('.public-profile-state');
    if (!shell) {
      return;
    }
    gsap.fromTo(
      shell,
      { opacity: 0, y: 16, scale: 0.99 },
      { opacity: 1, y: 0, scale: 1, duration: 0.55, ease: 'power3.out' },
    );
    const parts = shell.querySelectorAll(
      '.public-profile-state__eyebrow, h1, .text-muted, .public-profile-state__actions > *',
    );
    gsap.fromTo(
      parts,
      { opacity: 0, y: 12 },
      { opacity: 1, y: 0, duration: 0.45, stagger: 0.08, ease: 'power2.out', delay: 0.08 },
    );
  }

  private tabPanelTargets(root: HTMLElement, tab: PublicProfileTabId): Element[] {
    const panel = root.querySelector(`#panel-${tab}`);
    if (!panel) {
      return [];
    }
    if (tab === 'sobre') {
      return Array.from(
        panel.querySelectorAll(
          '.public-summary-card, .public-profile-main .public-panel, .public-profile-side .public-panel',
        ),
      );
    }
    return Array.from(panel.querySelectorAll(':scope > section'));
  }

  private playTabPanelReveal(tab: PublicProfileTabId): void {
    if (this.prefersReducedMotion()) {
      return;
    }
    const root = this.host.nativeElement;
    const targets = this.tabPanelTargets(root, tab);
    if (targets.length === 0) {
      return;
    }
    this.tabTimeline?.kill();
    this.tabTimeline = gsap.timeline({ defaults: { ease: 'power3.out' } });
    this.tabTimeline.fromTo(
      targets,
      { opacity: 0, y: 22 },
      { opacity: 1, y: 0, duration: 0.5, stagger: 0.07, clearProps: 'transform' },
    );
  }

  private playFullProfileIntro(tab: PublicProfileTabId): void {
    if (this.prefersReducedMotion()) {
      return;
    }
    const root = this.host.nativeElement;
    this.introTimeline?.kill();
    this.tabTimeline?.kill();
    this.gsapProfileCtx?.revert();
    this.gsapProfileCtx = null;

    this.gsapProfileCtx = gsap.context(() => {
      const cover = root.querySelector('.public-profile-hero__cover');
      const avatar = root.querySelector('.public-profile-hero__avatar, .public-profile-hero__avatar-img');
      const copyLines = root.querySelectorAll('.public-profile-hero__copy > *');
      const scores = root.querySelectorAll('.public-profile-hero__rail .public-profile-score');
      const badges = root.querySelectorAll('.public-profile-badges .public-badge');
      const tabBar = root.querySelector('.public-profile-tabs');
      const tabButtons = root.querySelectorAll('.public-profile-tabs__tab');
      const panelTargets = this.tabPanelTargets(root, tab);

      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      this.introTimeline = tl;

      if (cover) {
        tl.fromTo(
          cover,
          { scale: 1.07, opacity: 0.75 },
          { scale: 1, opacity: 1, duration: 0.85, ease: 'power2.out' },
          0,
        );
      }

      if (avatar) {
        tl.fromTo(
          avatar,
          { opacity: 0, y: 18, scale: 0.9 },
          { opacity: 1, y: 0, scale: 1, duration: 0.55 },
          cover ? '-=0.45' : 0,
        );
      }

      if (copyLines.length) {
        tl.fromTo(
          copyLines,
          { opacity: 0, y: 16 },
          { opacity: 1, y: 0, duration: 0.48, stagger: 0.07 },
          '-=0.35',
        );
      }

      if (scores.length) {
        tl.fromTo(
          scores,
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, duration: 0.45, stagger: 0.09 },
          '-=0.25',
        );
      }

      const rankingCards = root.querySelectorAll(
        '.public-profile-hero__rankings-scroll .public-profile-ranking-card, .public-profile-hero__rankings-empty',
      );
      if (rankingCards.length) {
        tl.fromTo(
          rankingCards,
          { opacity: 0, y: 16 },
          { opacity: 1, y: 0, duration: 0.42, stagger: 0.07 },
          '-=0.2',
        );
      }

      if (badges.length) {
        tl.fromTo(
          badges,
          { opacity: 0, scale: 0.88, y: 8 },
          { opacity: 1, scale: 1, y: 0, duration: 0.4, stagger: 0.06, ease: 'back.out(1.35)' },
          '-=0.2',
        );
      }

      if (tabBar) {
        tl.fromTo(
          tabBar,
          { opacity: 0, y: 12 },
          { opacity: 1, y: 0, duration: 0.45 },
          '-=0.15',
        );
      } else if (tabButtons.length) {
        tl.fromTo(
          tabButtons,
          { opacity: 0, y: 10 },
          { opacity: 1, y: 0, duration: 0.38, stagger: 0.05 },
          '-=0.15',
        );
      }

      if (panelTargets.length) {
        tl.fromTo(
          panelTargets,
          { opacity: 0, y: 24 },
          { opacity: 1, y: 0, duration: 0.5, stagger: 0.065, clearProps: 'transform' },
          '-=0.2',
        );
      }
    }, root);
  }

  private syncPublicProfileMotion(profileKey: string, tab: PublicProfileTabId): void {
    if (this.prefersReducedMotion()) {
      return;
    }
    if (this.lastProfileAnimKey !== profileKey) {
      this.lastProfileAnimKey = profileKey;
      this.lastTabAnimated = tab;
      this.playFullProfileIntro(tab);
      return;
    }
    if (this.lastTabAnimated === tab) {
      return;
    }
    this.lastTabAnimated = tab;
    this.playTabPanelReveal(tab);
  }

  private async loadProfile(): Promise<void> {
    const profileIdentifier = this.handle().trim();
    const normalizedIdentifier = slugify(profileIdentifier);
    if (!environment.production) {
      console.info('[athlete-public-profile] lookup', {
        projectId: environment.firebase.projectId,
        routeHandle: profileIdentifier,
        normalizedIdentifier,
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
      const byPublicIdQuery = query(
        collection(this.firestore, 'athlete_profiles'),
        where('publicProfileId', '==', normalizedIdentifier),
        where('publicProfileEnabled', '==', true),
        limit(1),
      );
      const byPublicIdSnap = await getDocs(byPublicIdQuery);
      if (!environment.production) {
        console.info('[athlete-public-profile] byPublicProfileId', {
          size: byPublicIdSnap.size,
          docIds: byPublicIdSnap.docs.map((entry) => entry.id),
        });
      }
      const profileSnap =
        byPublicIdSnap.empty
          ? await getDocs(
              query(
                collection(this.firestore, 'athlete_profiles'),
                where('publicHandle', '==', normalizedIdentifier),
                where('publicProfileEnabled', '==', true),
                limit(1),
              ),
            )
          : byPublicIdSnap;
      if (!environment.production && byPublicIdSnap.empty) {
        console.info('[athlete-public-profile] byPublicHandle fallback', {
          size: profileSnap.size,
          docIds: profileSnap.docs.map((entry) => entry.id),
        });
      }

      if (profileSnap.empty) {
        this.error.set('Perfil publico nao encontrado.');
        this.loading.set(false);
        return;
      }

      const docSnap = profileSnap.docs[0]!;
      const data = docSnap.data();
      if (data['publicProfileEnabled'] === false) {
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

      const sports = readStringArray(data, ['sports']);
      const primarySport = readString(data, ['primarySport']) || sports[0] || '';
      const mergedSports = Array.from(new Set([primarySport, ...sports].filter((item) => item.length > 0)));
      const city = readString(data, ['city', 'cidade']);
      const state = readString(data, ['state', 'uf']);
      const country = readString(data, ['country']);
      const completionScore = readNumber(data, ['completionScore']) ?? 62;

      this.profile.set({
        uid: docSnap.id,
        fullName: readString(data, ['fullName', 'displayName', 'name']) || 'Atleta NexaGO',
        handle: readString(data, ['publicHandle', 'slug', 'username']) || profileIdentifier,
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
        level: readString(data, ['level', 'nivel']) || 'Em evolucao',
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
}
