import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import type { BracketMatch, CategoryBracketData } from './bracket-results.models';
import type { TournamentDetailCategory } from './tournament-detail.models';
import type { DiscoveryTournament } from './tournament-discovery.models';
import { buildCategoryBracketData, buildDiscoveryTournament, buildTournamentDetailCategories } from './tournament-logic';
import { fetchMatchesByCategory, fetchTournamentById, type TournamentCategoryRaw } from './tournament-repository';

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

@Component({
  selector: 'app-tournament-brackets',
  standalone: true,
  imports: [RouterLink, AtPanelShellComponent, NgTemplateOutlet],
  templateUrl: './tournament-brackets.component.html',
  styleUrl: './tournament-brackets.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TournamentBracketsComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);

  protected readonly accountLabel = computed(() => {
    const liveUser = this.auth.user();
    if (liveUser?.displayName?.trim()) return liveUser.displayName.trim();
    if (liveUser?.email?.trim()) return nameFromEmail(liveUser.email);
    const devEmail = this.auth.devEmail();
    return devEmail?.trim() ? nameFromEmail(devEmail) : 'Atleta';
  });

  protected readonly tournamentId = computed(() => this.route.snapshot.paramMap.get('id') ?? '');

  protected readonly loading = signal(true);
  protected readonly listing = signal<DiscoveryTournament | null>(null);
  protected readonly categories = signal<TournamentDetailCategory[]>([]);
  private categoriesRaw: readonly TournamentCategoryRaw[] = [];

  protected readonly selectedCategoryId = signal<string | null>(this.route.snapshot.queryParamMap.get('categoria'));

  protected readonly selectedCategory = computed<TournamentDetailCategory | null>(() => {
    const cats = this.categories();
    if (cats.length === 0) return null;
    const id = this.selectedCategoryId();
    return cats.find((c) => c.id === id) ?? cats[0] ?? null;
  });

  protected readonly loadingBracket = signal(false);
  protected readonly bracketData = signal<CategoryBracketData | null>(null);

  protected readonly initialsOf = initialsOf;

  constructor() {
    void this.loadTournament();
  }

  private async loadTournament(): Promise<void> {
    const id = this.tournamentId();
    if (!id) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    try {
      const db = createFirestore();
      if (!db) throw new Error('Firebase não configurado');
      const raw = await fetchTournamentById(db, id);
      if (!raw) {
        this.listing.set(null);
        return;
      }
      this.listing.set(buildDiscoveryTournament(raw, false));
      this.categoriesRaw = raw.categories;
      this.categories.set(buildTournamentDetailCategories(raw.categories));
      const initial = this.selectedCategory();
      if (initial) {
        this.selectedCategoryId.set(initial.id);
        void this.loadBracket(initial.id);
      }
    } catch {
      this.listing.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  protected selectCategory(id: string): void {
    this.selectedCategoryId.set(id);
    void this.loadBracket(id);
  }

  private async loadBracket(categoryId: string): Promise<void> {
    const tournamentId = this.tournamentId();
    const catRaw = this.categoriesRaw.find((c) => c.categoryId === categoryId);
    const catDisplay = this.categories().find((c) => c.id === categoryId);
    if (!tournamentId || !catRaw) {
      this.bracketData.set(null);
      return;
    }
    this.loadingBracket.set(true);
    try {
      const db = createFirestore();
      const projectId = environment.firebase.projectId;
      if (!db || !projectId) throw new Error('Firebase não configurado');
      const matches = await fetchMatchesByCategory(db, projectId, tournamentId, categoryId);
      this.bracketData.set(buildCategoryBracketData(categoryId, catDisplay?.name ?? catRaw.categoryName, catRaw.bracketFormat ?? '', matches));
    } catch {
      this.bracketData.set(null);
    } finally {
      this.loadingBracket.set(false);
    }
  }

  protected matchPairs(matches: BracketMatch[]): BracketMatch[][] {
    const pairs: BracketMatch[][] = [];
    for (let i = 0; i < matches.length; i += 2) {
      pairs.push(matches.slice(i, i + 2));
    }
    return pairs;
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
