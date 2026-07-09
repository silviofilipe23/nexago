import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { getCategoryBracketData } from './bracket-results.mock';
import type { BracketMatch, CategoryBracketData } from './bracket-results.models';
import { getTournamentDetailExtra, type TournamentCategoryOffer } from './tournament-detail.mock';
import { MOCK_DISCOVERY_TOURNAMENTS } from './tournament-discovery.mock';
import type { DiscoveryTournament } from './tournament-discovery.models';

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

  protected readonly listing = computed<DiscoveryTournament | null>(() => {
    const id = this.tournamentId();
    return MOCK_DISCOVERY_TOURNAMENTS.find((t) => t.id === id) ?? null;
  });

  protected readonly categories = computed<TournamentCategoryOffer[]>(() => {
    const listing = this.listing();
    if (!listing) return [];
    return getTournamentDetailExtra(listing.id, listing).categories;
  });

  protected readonly selectedCategoryId = signal<string | null>(
    this.route.snapshot.queryParamMap.get('categoria'),
  );

  protected readonly selectedCategory = computed<TournamentCategoryOffer | null>(() => {
    const cats = this.categories();
    if (cats.length === 0) return null;
    const id = this.selectedCategoryId();
    return cats.find((c) => c.id === id) ?? cats[0] ?? null;
  });

  protected readonly bracketData = computed<CategoryBracketData | null>(() => {
    const cat = this.selectedCategory();
    const tId = this.tournamentId();
    if (!cat || !tId) return null;
    return getCategoryBracketData(tId, cat.id, cat.name);
  });

  protected readonly initialsOf = initialsOf;

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
