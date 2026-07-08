import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { MOCK_DISCOVERY_LEAGUES, MOCK_DISCOVERY_TOURNAMENTS } from './tournament-discovery.mock';
import type { DiscoveryTournament } from './tournament-discovery.models';
import { leagueContextLabel, resolveLeagueContext } from './tournament-league.helpers';
import { getTournamentDetailExtra, type BracketPreviewState } from './tournament-detail.mock';

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
  protected readonly postLikes = signal<Record<string, number>>({});
  protected readonly shareFeedback = signal<string | null>(null);
  private feedbackTimeout: ReturnType<typeof setTimeout> | undefined;

  protected readonly accountLabel = computed(() => {
    const liveUser = this.auth.user();
    if (liveUser?.displayName?.trim()) return liveUser.displayName.trim();
    if (liveUser?.email?.trim()) return nameFromEmail(liveUser.email);
    const devEmail = this.auth.devEmail();
    return devEmail?.trim() ? nameFromEmail(devEmail) : 'Atleta';
  });

  protected readonly base = computed((): DiscoveryTournament | null => {
    const id = this.id();
    return MOCK_DISCOVERY_TOURNAMENTS.find((t) => t.id === id) ?? null;
  });

  protected readonly extra = computed(() => {
    const b = this.base();
    if (!b) return null;
    return getTournamentDetailExtra(b.id, b);
  });

  protected readonly leagueContextLine = computed((): string | null => {
    const id = this.id();
    if (!id) return null;
    const ctx = resolveLeagueContext(MOCK_DISCOVERY_LEAGUES, id);
    return ctx ? leagueContextLabel(ctx) : null;
  });

  protected readonly mapsUrl = computed(() => {
    const q = this.extra()?.mapQuery ?? '';
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
    const state = this.extra()?.bracketState ?? 'soon';
    return this.bracketStateCopy(state);
  });

  protected readonly heroBackground = computed(() => heroGradient(this.base()?.id ?? ''));

  constructor() {
    setTimeout(() => this.loading.set(false), 320);
    this.destroyRef.onDestroy(() => clearTimeout(this.feedbackTimeout));
  }

  protected scrollToCategories(): void {
    document.getElementById('tdv-categories')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  protected likePost(id: string, base: number): void {
    const cur = this.postLikes()[id] ?? base;
    this.postLikes.update((m) => ({ ...m, [id]: cur + 1 }));
  }

  protected postLikeCount(id: string, base: number): number {
    return this.postLikes()[id] ?? base;
  }

  protected viewersLabel(n: number): string {
    return n.toLocaleString('pt-BR');
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
