import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { AtBellComponent } from '../painel/at-bell.component';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { NxPageLoadingComponent } from '../shared/loading/nx-page-loading.component';
import { watchCommunityFeed, type CommunityFeedItem } from '../data/community-feed-repository';
import { fetchAthleteRankingGeneral } from '../data/rankings-repository';
import { fetchPublicProfilesByIds, type AthletePublicProfile } from '../data/public-profiles-repository';

const TOP_RANKING_LIMIT = 10;

function titleCase(input: string): string {
  return input
    .toLowerCase()
    .split(/[\s._-]+/)
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

function relativeTime(date: Date | null): string {
  if (!date) return 'agora';
  const diffMinutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (diffMinutes < 1) return 'agora';
  if (diffMinutes < 60) return `há ${diffMinutes} min`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `há ${diffHours} h`;
  const diffDays = Math.round(diffHours / 24);
  return diffDays === 1 ? 'ontem' : `há ${diffDays} dias`;
}

interface RankingRow {
  uid: string;
  position: number;
  name: string;
  points: number;
  tournaments: number;
  isMe: boolean;
}

/** Comunidade — espelha a aba do app: feed automático do `communityFeed` (aberturas de
 *  inscrição e campeões, gravados por Cloud Function — sem UGC) + ranking em destaque
 *  (mesma fonte `athleteRankings` do ranking geral). */
@Component({
  selector: 'app-athlete-community',
  standalone: true,
  imports: [RouterLink, AtPanelShellComponent, AtBellComponent, NxPageLoadingComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-at-panel-shell [userName]="accountLabel()">
      <header class="cm-page-header">
        <div>
          <h1>Comunidade</h1>
          <div class="cm-page-header-sub">O que está rolando nos esportes de areia</div>
        </div>
        <div class="cm-page-header-spacer"></div>
        <at-bell />
      </header>

      <div class="cm-body">
        <div class="cm-grid">
          <div class="cm-feed">
            @if (loadingFeed()) {
              <app-nx-page-loading title="Carregando o feed…" subtitle="Novidades da comunidade" />
            } @else {
              @for (item of feed(); track item.id) {
                <a class="cm-item" [routerLink]="['/torneios', item.tournamentId]">
                  <span class="cm-item-badge" [class.cm-item-badge--champions]="item.type === 'tournament_champions'" aria-hidden="true">
                    @if (item.type === 'tournament_open') {
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
                    } @else {
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4" /><path d="M7 4h10v6a5 5 0 0 1-10 0V4z" /><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" /></svg>
                    }
                  </span>
                  <span class="cm-item-body">
                    <span class="cm-item-top">
                      <span class="cm-item-title">{{ item.tournamentName }}</span>
                      <span class="cm-item-time">{{ timeOf(item) }}</span>
                    </span>
                    <span class="cm-item-text">{{ messageOf(item) }}</span>
                    @if (item.type === 'tournament_champions' && item.champions.length > 0) {
                      <span class="cm-item-champions">
                        @for (c of item.champions.slice(0, 3); track c.categoryId) {
                          <span class="cm-champion">
                            <strong>{{ c.categoryName }}:</strong> {{ championNames(c.players) }}
                          </span>
                        }
                        @if (item.champions.length > 3) {
                          <span class="cm-champion cm-champion--more">+{{ item.champions.length - 3 }} categorias</span>
                        }
                      </span>
                    }
                  </span>
                </a>
              } @empty {
                <div class="cm-empty">
                  Sem novidades por enquanto — aberturas de inscrição e campeões de torneios aparecem aqui automaticamente.
                </div>
              }
            }
          </div>

          <aside class="cm-side">
            <section class="cm-card">
              <div class="cm-card-head">
                <div>
                  <p class="cm-card-kicker">Temporada</p>
                  <span class="cm-card-title">Ranking em destaque</span>
                </div>
                <a routerLink="/ranking" class="cm-ghost-btn">Ver ranking</a>
              </div>
              @if (loadingRanking()) {
                <div class="cm-empty cm-empty--tight">Carregando…</div>
              } @else {
                <div class="cm-ranking">
                  @for (row of topRanking(); track row.uid) {
                    <a class="cm-ranking-row" [class.cm-ranking-row--me]="row.isMe" [routerLink]="['/atletas', row.uid]">
                      <span class="cm-ranking-pos" [class.cm-ranking-pos--podium]="row.position <= 3">{{ row.position }}</span>
                      <span class="cm-ranking-avatar" aria-hidden="true">{{ initialsOf(row.name) }}</span>
                      <span class="cm-ranking-name">{{ row.name }}@if (row.isMe) {<span class="cm-ranking-you"> · você</span>}</span>
                      <span class="cm-ranking-points">{{ row.points }} pts</span>
                    </a>
                  } @empty {
                    <div class="cm-empty cm-empty--tight">Ranking ainda sem pontuações.</div>
                  }
                </div>
                @if (myRow(); as me) {
                  @if (!meInTop()) {
                    <div class="cm-ranking-me">
                      <span class="cm-ranking-pos">{{ me.position }}</span>
                      <span class="cm-ranking-name">Você</span>
                      <span class="cm-ranking-points">{{ me.points }} pts</span>
                    </div>
                  }
                }
              }
            </section>
          </aside>
        </div>
      </div>
    </app-at-panel-shell>
  `,
  styles: `
    .cm-page-header {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 20px 28px;
      border-bottom: 1px solid var(--nx-line);

      @media (max-width: 640px) {
        padding: 16px;
      }
    }
    .cm-page-header h1 {
      margin: 0;
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 21px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
    }
    .cm-page-header-sub {
      margin-top: 3px;
      font-family: var(--nx-font-mono);
      font-size: 10px;
      font-weight: 500;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .cm-page-header-spacer {
      flex: 1;
    }
    .cm-body {
      padding: 22px 28px 32px;

      @media (max-width: 640px) {
        padding: 16px 16px 32px;
      }
    }
    .cm-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.5fr) minmax(280px, 1fr);
      gap: 16px;
      max-width: 1060px;
      align-items: start;
    }
    @media (max-width: 900px) {
      .cm-grid {
        grid-template-columns: 1fr;
      }
    }
    .cm-feed {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .cm-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 16px;
      border-radius: var(--nx-r-4);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      text-decoration: none;
      color: inherit;
      transition: border-color 140ms ease-out;
    }
    .cm-item:hover {
      border-color: var(--nx-line-strong);
    }
    .cm-item-badge {
      width: 38px;
      height: 38px;
      border-radius: 12px;
      flex: none;
      display: grid;
      place-items: center;
      background: var(--nx-orange-tint);
      color: var(--nx-orange-500);
    }
    .cm-item-badge--champions {
      background: rgba(212, 160, 23, 0.14);
      color: #d4a017;
    }
    .cm-item-body {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .cm-item-top {
      display: flex;
      align-items: baseline;
      gap: 10px;
    }
    .cm-item-title {
      flex: 1;
      min-width: 0;
      overflow-wrap: break-word;
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 14px;
      color: var(--nx-text);
    }
    .cm-item-time {
      flex: none;
      font-family: var(--nx-font-mono);
      font-size: 10px;
      color: var(--nx-text-dim);
      white-space: nowrap;
    }
    .cm-item-text {
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-text-mute);
      line-height: 1.45;
    }
    .cm-item-champions {
      margin-top: 6px;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .cm-champion {
      font-family: var(--nx-font-ui);
      font-size: 12px;
      color: var(--nx-text-mute);
    }
    .cm-champion strong {
      color: var(--nx-text);
      font-weight: 600;
    }
    .cm-champion--more {
      color: var(--nx-text-dim);
    }
    .cm-card {
      padding: 18px;
      border-radius: var(--nx-r-4);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
    }
    .cm-card-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 12px;
    }
    .cm-card-kicker {
      margin: 0 0 3px;
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .cm-card-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 15px;
      color: var(--nx-text);
    }
    .cm-ghost-btn {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 12px;
      color: var(--nx-orange-500);
      text-decoration: none;
    }
    .cm-ghost-btn:hover {
      text-decoration: underline;
    }
    .cm-ranking {
      display: flex;
      flex-direction: column;
    }
    .cm-ranking-row,
    .cm-ranking-me {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 6px;
      border-radius: 10px;
      text-decoration: none;
      color: inherit;
    }
    .cm-ranking-row:hover {
      background: var(--nx-surface-1);
    }
    .cm-ranking-row--me {
      background: var(--nx-orange-tint);
    }
    .cm-ranking-pos {
      width: 24px;
      flex: none;
      text-align: center;
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 11px;
      color: var(--nx-text-dim);
    }
    .cm-ranking-pos--podium {
      color: var(--nx-orange-500);
    }
    .cm-ranking-avatar {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      flex: none;
      display: grid;
      place-items: center;
      background: var(--nx-orange-tint);
      border: 1px solid rgba(255, 106, 26, 0.35);
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 10px;
      color: var(--nx-orange-500);
    }
    .cm-ranking-name {
      flex: 1;
      min-width: 0;
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 12.5px;
      color: var(--nx-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .cm-ranking-you {
      color: var(--nx-orange-500);
      font-size: 11px;
    }
    .cm-ranking-points {
      flex: none;
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 11px;
      color: var(--nx-text-mute);
    }
    .cm-ranking-me {
      margin-top: 8px;
      border-top: 1px solid var(--nx-line);
      padding-top: 10px;
    }
    .cm-empty {
      padding: 26px 16px;
      border-radius: var(--nx-r-4);
      border: 1px dashed var(--nx-line-strong);
      font-family: var(--nx-font-ui);
      font-size: 13px;
      color: var(--nx-text-mute);
      text-align: center;
    }
    .cm-empty--tight {
      padding: 14px;
      border: none;
      text-align: left;
    }
  `,
})
export class AthleteCommunityComponent {
  private readonly auth = inject(AuthService);
  private readonly firestore = createFirestore();

  protected readonly initialsOf = initialsOf;

  protected readonly loadingFeed = signal(true);
  protected readonly loadingRanking = signal(true);
  protected readonly feed = signal<CommunityFeedItem[]>([]);
  private readonly rankingState = signal<RankingRow[]>([]);

  protected readonly topRanking = computed(() => this.rankingState().slice(0, TOP_RANKING_LIMIT));
  protected readonly myRow = computed(() => this.rankingState().find((r) => r.isMe) ?? null);
  protected readonly meInTop = computed(() => this.topRanking().some((r) => r.isMe));

  protected readonly accountLabel = computed(() => {
    const liveUser = this.auth.user();
    if (liveUser?.displayName?.trim()) return liveUser.displayName.trim();
    if (liveUser?.email?.trim()) return nameFromEmail(liveUser.email);
    const devEmail = this.auth.devEmail();
    return devEmail?.trim() ? nameFromEmail(devEmail) : 'Atleta';
  });

  constructor() {
    effect((onCleanup) => {
      const user = this.auth.user();
      if (!user || !this.firestore) {
        this.feed.set([]);
        this.loadingFeed.set(false);
        return;
      }
      const stop = watchCommunityFeed(
        this.firestore,
        (items) => {
          this.feed.set(items);
          this.loadingFeed.set(false);
        },
        () => this.loadingFeed.set(false),
      );
      onCleanup(() => stop());
    });

    void this.loadRanking();
  }

  private async loadRanking(): Promise<void> {
    const db = this.firestore;
    const projectId = environment.firebase.projectId;
    if (!db || !projectId) {
      this.loadingRanking.set(false);
      return;
    }
    try {
      const aggregates = await fetchAthleteRankingGeneral(db, projectId);
      const myUid = this.auth.user()?.uid ?? null;
      const relevant = aggregates.slice(0, TOP_RANKING_LIMIT + 5);
      const idsToName = [...relevant.map((a) => a.id), ...(myUid ? [myUid] : [])];
      const profiles: Map<string, AthletePublicProfile> = await fetchPublicProfilesByIds(db, idsToName);
      this.rankingState.set(
        aggregates.map((a, i) => ({
          uid: a.id,
          position: i + 1,
          name: profiles.get(a.id)?.displayName ?? 'Atleta',
          points: Math.round(a.totalPoints),
          tournaments: a.tournamentsCount,
          isMe: a.id === myUid,
        })),
      );
    } finally {
      this.loadingRanking.set(false);
    }
  }

  protected timeOf(item: CommunityFeedItem): string {
    return relativeTime(item.createdAt);
  }

  protected messageOf(item: CommunityFeedItem): string {
    if (item.type === 'tournament_open') {
      const cats = item.categoriesCount != null ? `${item.categoriesCount} categoria${item.categoriesCount === 1 ? '' : 's'}` : 'inscrições abertas';
      const place = item.city ?? item.locationName;
      return `Inscrições abertas · ${cats}${place ? ` — ${place}` : ''}`;
    }
    return 'Torneio encerrado — confira os campeões:';
  }

  protected championNames(players: { name: string }[]): string {
    return players.map((p) => p.name).join(' / ') || 'Dupla campeã';
  }
}
