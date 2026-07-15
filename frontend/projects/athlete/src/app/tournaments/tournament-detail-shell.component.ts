import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { map } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import type { DiscoveryLeague, DiscoveryTournament } from './tournament-discovery.models';
import type { BracketPreviewState, TournamentDetailView } from './tournament-detail.models';
import { buildDiscoveryLeague, buildDiscoveryTournament, buildTournamentDetailView } from './tournament-logic';
import { leagueContextLabel, resolveLeagueContext } from './tournament-league.helpers';
import { fetchLeagues, fetchTournamentById } from './tournament-repository';

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

  private readonly id = toSignal(this.route.paramMap.pipe(map((p) => p.get('id') ?? '')), { initialValue: '' });

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly shareFeedback = signal<string | null>(null);
  private feedbackTimeout: ReturnType<typeof setTimeout> | undefined;

  protected readonly base = signal<DiscoveryTournament | null>(null);
  protected readonly view = signal<TournamentDetailView | null>(null);
  private readonly leagues = signal<DiscoveryLeague[]>([]);

  protected readonly accountLabel = computed(() => {
    const liveUser = this.auth.user();
    if (liveUser?.displayName?.trim()) return liveUser.displayName.trim();
    if (liveUser?.email?.trim()) return nameFromEmail(liveUser.email);
    const devEmail = this.auth.devEmail();
    return devEmail?.trim() ? nameFromEmail(devEmail) : 'Atleta';
  });

  protected readonly leagueContextLine = computed((): string | null => {
    const id = this.id();
    if (!id) return null;
    const ctx = resolveLeagueContext(this.leagues(), id);
    return ctx ? leagueContextLabel(ctx) : null;
  });

  protected readonly mapsUrl = computed(() => {
    const q = this.view()?.mapQuery ?? '';
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  });

  protected readonly heroStatus = computed(() => {
    const b = this.base();
    if (!b) return { label: '', tone: 'neutral' as const };
    switch (b.status) {
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

  protected readonly bracketLabel = computed(() => {
    const state = this.view()?.bracketState ?? 'soon';
    return this.bracketStateCopy(state);
  });

  protected readonly heroBackground = computed(() => heroGradient(this.base()?.id ?? ''));

  constructor() {
    void this.load();
    this.destroyRef.onDestroy(() => clearTimeout(this.feedbackTimeout));
  }

  protected retry(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    const id = this.id();
    if (!id) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const db = createFirestore();
      if (!db) throw new Error('Firebase não configurado');
      const [raw, leaguesRaw] = await Promise.all([fetchTournamentById(db, id), fetchLeagues(db)]);
      this.leagues.set(leaguesRaw.map(buildDiscoveryLeague));
      if (!raw) {
        this.base.set(null);
        this.view.set(null);
        return;
      }
      const discovery = buildDiscoveryTournament(raw, false);
      this.base.set(discovery);
      this.view.set(buildTournamentDetailView(raw, discovery.status));
    } catch {
      this.errorMessage.set('Não foi possível carregar o torneio.');
    } finally {
      this.loading.set(false);
    }
  }

  protected scrollToCategories(): void {
    document.getElementById('tdv-categories')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  protected categoryFillPercent(spotsLeft: number, spotsTotal: number): number {
    if (spotsTotal <= 0) return 0;
    return Math.round(((spotsTotal - spotsLeft) / spotsTotal) * 100);
  }

  protected bracketStateCopy(state: BracketPreviewState): string {
    switch (state) {
      case 'soon':
        return 'Chave em breve';
      case 'live':
        return 'Chave ao vivo';
      case 'done':
        return 'Resultados finais';
    }
  }

  protected async shareTournament(): Promise<void> {
    const t = this.base();
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
