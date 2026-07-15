import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { map } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { fetchAllLeagues, type League } from '../data/leagues-repository';
import { fetchMyRegistrationForCategory } from '../data/tournament-registrations-repository';
import {
  fetchCategoryEnrolledCounts,
  fetchTournament,
  tournamentListingStatus,
  type TournamentCategoryOffer,
  type TournamentSummary,
} from '../data/tournaments-repository';
import { leagueContextLabel, resolveLeagueContext, type ResolvedLeagueContext } from './tournament-league.helpers';
import type { DiscoveryLeague } from './tournament-discovery.models';

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

function hashHue(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) % 360;
  }
  return hash < 0 ? hash + 360 : hash;
}

function heroGradient(id: string): string {
  const hue = hashHue(id);
  return `linear-gradient(120deg, hsl(${hue} 55% 20%), hsl(${(hue + 40) % 360} 55% 10%))`;
}

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) return null;
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function discoveryLeagueFromLeague(l: League): DiscoveryLeague {
  return {
    id: l.id,
    name: l.name,
    seasonLabel: l.seasonLabel ?? undefined,
    city: l.city ?? undefined,
    stages: l.stages.map((s) => ({ id: s.id, name: s.name, order: s.order, dateLabel: s.dateLabel ?? undefined, tournamentIds: s.tournamentIds })),
  };
}

function genderLabelOf(cat: TournamentCategoryOffer['genderType']): string {
  return cat === 'F' ? 'Feminino' : cat === 'Mix' ? 'Misto' : 'Masculino';
}

export type CategoryCtaKind = 'register' | 'waitlist' | 'disabled' | 'view-registration';

/** Detalhe do torneio real: `tournaments/{id}` + contagem fresca de inscritos por categoria
 *  (`inscriptions`). Removi as seções sem lastro real (feed social, comunicados, transmissão
 *  ao vivo, etapas fictícias, preview de ranking fixo) — o Flutter também não tem nenhuma
 *  dessas na tela de detalhe. */
@Component({
  selector: 'app-tournament-detail-shell',
  standalone: true,
  imports: [RouterLink, AtPanelShellComponent],
  templateUrl: './tournament-detail-shell.component.html',
  styleUrl: './tournament-detail-shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TournamentDetailShellComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly firestore = createFirestore();

  private readonly id = toSignal(this.route.paramMap.pipe(map((p) => p.get('id') ?? '')), { initialValue: '' });

  protected readonly loading = signal(true);
  protected readonly shareFeedback = signal<string | null>(null);
  private feedbackTimeout: ReturnType<typeof setTimeout> | undefined;

  protected readonly accountLabel = computed(() => {
    const liveUser = this.auth.user();
    if (liveUser?.displayName?.trim()) return liveUser.displayName.trim();
    if (liveUser?.email?.trim()) return nameFromEmail(liveUser.email);
    const devEmail = this.auth.devEmail();
    return devEmail?.trim() ? nameFromEmail(devEmail) : 'Atleta';
  });

  protected readonly tournament = signal<TournamentSummary | null>(null);
  protected readonly enrolledByCategory = signal<Map<string, number>>(new Map());
  protected readonly myRegisteredCategoryIds = signal<ReadonlySet<string>>(new Set());
  private leagues: DiscoveryLeague[] = [];

  protected readonly leagueContext = computed<ResolvedLeagueContext | null>(() => {
    const id = this.id();
    if (!id) return null;
    return resolveLeagueContext(this.leagues, id);
  });

  protected readonly leagueContextLine = computed(() => {
    const ctx = this.leagueContext();
    return ctx ? leagueContextLabel(ctx) : null;
  });

  protected readonly mapsUrl = computed(() => {
    const t = this.tournament();
    if (!t) return '';
    const q = t.locationAddress ?? `${t.location}, ${t.city}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  });

  protected readonly heroStatus = computed(() => {
    const t = this.tournament();
    if (!t) return { label: '', tone: 'neutral' as const };
    switch (tournamentListingStatus(t)) {
      case 'open':
        return { label: 'Inscrições abertas', tone: 'open' as const };
      case 'almost_full':
        return { label: 'Últimas vagas', tone: 'urgent' as const };
      case 'live':
        return { label: 'Ao vivo agora', tone: 'live' as const };
      case 'ended':
        return { label: 'Encerrado', tone: 'ended' as const };
    }
  });

  protected readonly totalPrizeLabel = computed(() => {
    const t = this.tournament();
    if (!t) return null;
    const total = t.tournamentPrizes.reduce((s, p) => s + p.value, 0) + t.categories.flatMap((c) => c.prizes).reduce((s, p) => s + p.value, 0);
    return total > 0 ? formatBRL(total) : null;
  });

  protected readonly cheapestPriceLabel = computed(() => {
    const t = this.tournament();
    if (!t || t.categories.length === 0) return '—';
    return formatBRL(Math.min(...t.categories.map((c) => c.entryFee)));
  });

  protected readonly heroBackground = computed(() => heroGradient(this.tournament()?.id ?? ''));

  constructor() {
    this.destroyRef.onDestroy(() => clearTimeout(this.feedbackTimeout));
    effect(() => {
      const id = this.id();
      void this.loadTournament(id);
    });
  }

  private async loadTournament(id: string): Promise<void> {
    const db = this.firestore;
    const projectId = environment.firebase.projectId;
    if (!db || !projectId || !id) {
      this.tournament.set(null);
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    try {
      const [tournament, leagues, enrolledCounts] = await Promise.all([
        fetchTournament(db, id),
        this.leagues.length > 0 ? Promise.resolve(this.leagues) : fetchAllLeagues(db).then((list) => list.map(discoveryLeagueFromLeague)),
        fetchCategoryEnrolledCounts(db, projectId, id),
      ]);
      this.leagues = leagues;
      this.tournament.set(tournament);
      this.enrolledByCategory.set(enrolledCounts);

      const uid = this.auth.user()?.uid ?? null;
      if (uid && tournament) {
        const registered = new Set<string>();
        await Promise.all(
          tournament.categories.map(async (c) => {
            const reg = await fetchMyRegistrationForCategory(db, projectId, uid, id, c.id);
            if (reg) registered.add(c.id);
          }),
        );
        this.myRegisteredCategoryIds.set(registered);
      } else {
        this.myRegisteredCategoryIds.set(new Set());
      }
    } finally {
      this.loading.set(false);
    }
  }

  protected scrollToCategories(): void {
    document.getElementById('tdv-categories')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  protected genderLabel(cat: TournamentCategoryOffer): string {
    return genderLabelOf(cat.genderType);
  }

  protected categorySpotsLeft(cat: TournamentCategoryOffer): number {
    const enrolled = this.enrolledByCategory().get(cat.id);
    return enrolled != null ? Math.max(0, cat.maxTeams - enrolled) : cat.spotsLeft;
  }

  protected categoryFillPercent(cat: TournamentCategoryOffer): number {
    if (cat.maxTeams <= 0) return 0;
    return Math.round(((cat.maxTeams - this.categorySpotsLeft(cat)) / cat.maxTeams) * 100);
  }

  protected categoryCta(cat: TournamentCategoryOffer): CategoryCtaKind {
    if (this.myRegisteredCategoryIds().has(cat.id)) return 'view-registration';
    const t = this.tournament();
    const status = t ? tournamentListingStatus(t) : 'ended';
    if (cat.isCompleted || cat.registrationClosed || status === 'ended') return 'disabled';
    const spotsLeft = this.categorySpotsLeft(cat);
    if (spotsLeft <= 0) return t?.waitlistEnabled ? 'waitlist' : 'disabled';
    return 'register';
  }

  protected categoryCtaLabel(cat: TournamentCategoryOffer): string {
    switch (this.categoryCta(cat)) {
      case 'register':
        return 'Inscrever';
      case 'waitlist':
        return 'Entrar na espera';
      case 'view-registration':
        return 'Ver inscrição';
      case 'disabled':
        return 'Encerrado';
    }
  }

  protected priceLabel(cat: TournamentCategoryOffer): string {
    return formatBRL(cat.entryFee);
  }

  protected async shareTournament(): Promise<void> {
    const t = this.tournament();
    if (!t) return;
    const origin = typeof location !== 'undefined' ? location.origin : 'https://nexago.app';
    const url = `${origin}/torneios/${t.id}`;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        this.showFeedback('Link copiado.');
        return;
      }
      this.showFeedback('Copie o link manualmente.');
    } catch {
      this.showFeedback('Não foi possível copiar agora.');
    }
  }

  private showFeedback(message: string): void {
    this.shareFeedback.set(message);
    clearTimeout(this.feedbackTimeout);
    this.feedbackTimeout = setTimeout(() => this.shareFeedback.set(null), 3500);
  }
}
