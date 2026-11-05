import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { callableErrorMessage } from '../../data/callable-error';
import { IconComponent } from '../../ui/icon.component';
import { KpiMiniComponent } from '../../ui/kpi-mini.component';
import { PageHeaderComponent } from '../../ui/page-header.component';
import { PanelCardComponent } from '../../ui/panel-card.component';
import { PanelShellComponent } from '../../ui/panel-shell.component';
import { PillComponent } from '../../ui/pill.component';
import {
  BLOG_SORTS,
  BLOG_TABS,
  EMPTY_BLOG_CRITERIA,
  blogStats,
  filterPosts,
  tabCounts,
  upcomingPosts,
  type BlogCriteria,
} from './data/blog-list';
import {
  BLOG_CATEGORIES,
  BLOG_SITE_URL,
  ctaDestinationLabel,
  formatCount,
  monthAbbr,
  publicationLabel,
  saoPauloParts,
  type BlogPost,
} from './data/blog-post';
import { BlogPostsRepository } from './data/blog-posts.repository';
import { BlogCategoryChipComponent, BlogCoverThumbComponent, BlogStatusPillComponent } from './ui/blog-badges.component';

type LoadState = 'loading' | 'ok' | 'error';

/** Conteúdo › Blog: os posts de `blogPosts` (todos os status), com os números que os docs têm. */
@Component({
  selector: 'bo-panel-blog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    PanelShellComponent,
    PageHeaderComponent,
    PanelCardComponent,
    KpiMiniComponent,
    IconComponent,
    PillComponent,
    BlogCategoryChipComponent,
    BlogCoverThumbComponent,
    BlogStatusPillComponent,
  ],
  template: `
    <bo-panel-shell>
      <bo-page-header title="Posts" subtitle="Conteúdo › Blog">
        @if (state() === 'ok') {
          <bo-pill tone="green">{{ stats().published }} {{ stats().published === 1 ? 'publicado' : 'publicados' }}</bo-pill>
        }
        <div class="header-actions">
          <a class="bo-ghost-btn" [href]="siteUrl" target="_blank" rel="noopener">
            Ver blog
            <bo-icon name="chevron-right" [size]="13" />
          </a>
          <a class="bo-mini-btn bo-mini-btn-primary" routerLink="/painel/conteudo/blog/novo">
            <bo-icon name="plus" [size]="13" />
            Novo post
          </a>
        </div>
      </bo-page-header>

      <div class="body">
        <div class="kpis">
          <bo-kpi-mini label="Posts publicados" [value]="kpi(stats().published)" />
          <bo-kpi-mini label="Agendados" [value]="kpi(stats().scheduled)" [tone]="stats().scheduled ? 'yellow' : 'neutral'" />
          <bo-kpi-mini label="Leituras · todos os posts" [value]="kpi(stats().reads)" />
          <bo-kpi-mini label="“Ajudou” · todos os posts" [value]="kpi(stats().helpful)" [tone]="stats().helpful ? 'green' : 'neutral'" />
        </div>

        <div class="columns">
          <bo-panel-card class="main" pad="sm">
            <div class="tabs" role="tablist" aria-label="Status">
              @for (tab of tabs; track tab.id) {
                <button
                  type="button"
                  role="tab"
                  [class.active]="criteria().tab === tab.id"
                  [attr.aria-selected]="criteria().tab === tab.id"
                  (click)="patch({ tab: tab.id })"
                >
                  {{ tab.label }}
                  <span class="tab-count">{{ counts()[tab.id] }}</span>
                </button>
              }
            </div>

            <div class="filters">
              <div class="search">
                <bo-icon name="search" [size]="15" />
                <input
                  type="search"
                  placeholder="Buscar por título, tag ou autor"
                  aria-label="Buscar post"
                  [value]="criteria().q"
                  (input)="patch({ q: value($event) })"
                />
              </div>
              <select class="bo-select narrow" aria-label="Categoria" (change)="patch({ category: value($event) || null })">
                <option value="" [selected]="criteria().category === null">Todas as categorias</option>
                @for (c of categories; track c.id) {
                  <option [value]="c.id" [selected]="criteria().category === c.id">{{ c.label }}</option>
                }
              </select>
              <select class="bo-select narrow" aria-label="Ordenar" (change)="setSort(value($event))">
                @for (s of sorts; track s.id) {
                  <option [value]="s.id" [selected]="criteria().sort === s.id">{{ s.label }}</option>
                }
              </select>
            </div>

            @if (state() === 'error') {
              <div class="bo-alert" role="alert">
                <bo-icon name="alert" [size]="16" />
                <span>{{ errorMessage() }}</span>
              </div>
              <button type="button" class="bo-mini-btn retry" (click)="load()">Tentar de novo</button>
            } @else if (state() === 'loading') {
              @for (slot of [0, 1, 2, 3]; track slot) {
                <div class="skeleton-row"></div>
              }
            } @else if (rows().length === 0) {
              <div class="empty">
                <bo-icon name="file" [size]="20" />
                @if (posts().length === 0) {
                  <p>Nenhum post ainda</p>
                  <a class="bo-mini-btn bo-mini-btn-primary" routerLink="/painel/conteudo/blog/novo">Escrever o primeiro</a>
                } @else {
                  <p>Nenhum post com esses filtros</p>
                  <button type="button" class="bo-mini-btn" (click)="clearFilters()">Limpar filtros</button>
                }
              </div>
            } @else {
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Post</th>
                      <th scope="col">Categoria</th>
                      <th scope="col">Status</th>
                      <th scope="col">Publicação</th>
                      <th scope="col" class="num">Leituras</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (post of rows(); track post.id) {
                      <tr>
                        <td class="post-cell">
                          <div class="post">
                            <bo-blog-cover-thumb [coverUrl]="post.coverUrl" [category]="post.category" />
                            <div class="post-text">
                              <a class="title" [routerLink]="['/painel/conteudo/blog', post.id]">{{ post.title || 'Sem título' }}</a>
                              <span class="meta">{{ metaLine(post) }}</span>
                            </div>
                          </div>
                        </td>
                        <td><bo-blog-category-chip [category]="post.category" /></td>
                        <td><bo-blog-status-pill [status]="post.status" /></td>
                        <td class="date">{{ publication(post) }}</td>
                        <td class="num">{{ post.status === 'published' ? count(post.readCount) : '—' }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </bo-panel-card>

          <bo-panel-card class="side" pad="sm" kicker="Próximas publicações" title="Na fila">
            @if (state() === 'loading') {
              <div class="skeleton-row"></div>
            } @else if (upcoming().length === 0) {
              <p class="none">Nada agendado nem em rascunho.</p>
            } @else {
              <div class="queue">
                @for (item of upcoming(); track item.id) {
                  <a class="q-item" [routerLink]="['/painel/conteudo/blog', item.id]">
                    <span class="q-date" [class.undated]="!item.date">
                      @if (item.date; as d) {
                        <span class="q-month">{{ month(d) }}</span>
                        <span class="q-day">{{ day(d) }}</span>
                      } @else {
                        <span class="q-day">—</span>
                      }
                    </span>
                    <span class="q-text">
                      <span class="q-title">{{ item.title || 'Sem título' }}</span>
                      <span class="q-meta">{{ item.meta }}</span>
                    </span>
                  </a>
                }
              </div>
            }
          </bo-panel-card>
        </div>
      </div>
    </bo-panel-shell>
  `,
  styles: `
    .header-actions { display: flex; align-items: center; gap: 10px; }
    .header-actions a { text-decoration: none; }
    .body { padding: 24px 32px 40px; display: flex; flex-direction: column; gap: 18px; min-width: 0; }
    @media (max-width: 760px) { .body { padding: 16px; } }
    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; }
    .columns { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 18px; align-items: start; }
    @media (max-width: 1180px) { .columns { grid-template-columns: minmax(0, 1fr); } }

    .tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 14px; }
    .tabs button { display: inline-flex; align-items: center; gap: 8px; height: 34px; padding: 0 13px; border-radius: var(--nx-r-2); border: 1px solid transparent; background: transparent; color: var(--nx-text-mute); font-family: var(--nx-font-display); font-weight: 500; font-size: 13px; cursor: pointer; }
    .tabs button:hover { color: var(--nx-text); }
    .tabs button.active { background: var(--nx-surface-1); border-color: var(--nx-line-strong); color: var(--nx-text); font-weight: 700; }
    .tabs button:focus-visible { outline: 2px solid var(--nx-orange-500); outline-offset: 2px; }
    .tab-count { font-family: var(--nx-font-mono); font-size: 10.5px; color: var(--nx-text-dim); }

    .filters { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 14px; }
    .search { flex: 1 1 260px; display: flex; align-items: center; gap: 10px; height: 40px; padding: 0 12px; border-radius: var(--nx-r-2); background: var(--nx-surface-1); border: 1px solid var(--nx-line); color: var(--nx-text-dim); }
    .search:focus-within { border-color: rgba(255, 106, 26, 0.5); }
    .search input { flex: 1; min-width: 0; background: transparent; border: none; outline: none; color: var(--nx-text); font-family: var(--nx-font-ui); font-size: 13.5px; }
    .search input::placeholder { color: var(--nx-text-dim); }
    .bo-select.narrow { width: auto; min-width: 170px; height: 40px; font-size: 13px; }

    .table-wrap { overflow-x: auto; margin: 0 -16px -16px; }
    table { width: 100%; min-width: 720px; border-collapse: collapse; }
    th { text-align: left; padding: 8px 10px; font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    th:first-child, td:first-child { padding-left: 16px; }
    th:last-child, td:last-child { padding-right: 16px; }
    td { padding: 12px 10px; border-top: 1px solid var(--nx-line); vertical-align: middle; }
    tbody tr:hover { background: rgba(255, 255, 255, 0.02); }
    .num { text-align: right; font-family: var(--nx-font-mono); font-size: 13px; }
    .date { font-size: 13px; color: var(--nx-text-mute); white-space: nowrap; }
    .post-cell { width: 46%; }
    .post { display: flex; align-items: center; gap: 14px; min-width: 280px; }
    .post-text { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .title { color: var(--nx-text); text-decoration: none; font-family: var(--nx-font-display); font-weight: 700; font-size: 14px; line-height: 1.3; }
    .title:hover { color: var(--nx-orange-400); }
    .meta { font-family: var(--nx-font-mono); font-size: 11px; color: var(--nx-text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 320px; }

    .skeleton-row { height: 64px; margin-top: 8px; border-radius: var(--nx-r-2); background: var(--nx-surface-1); opacity: 0.6; }
    .retry { margin-top: 10px; }
    .empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 40px 16px; color: var(--nx-text-dim); text-align: center; }
    .empty p { margin: 0; font-size: 13px; color: var(--nx-text); }
    .empty a { text-decoration: none; }

    .none { margin: 0; font-size: 12.5px; color: var(--nx-text-dim); }
    .queue { display: flex; flex-direction: column; gap: 4px; margin: 0 -8px; }
    .q-item { display: flex; align-items: center; gap: 12px; padding: 8px; border-radius: var(--nx-r-2); color: inherit; text-decoration: none; }
    .q-item:hover { background: var(--nx-surface-1); }
    .q-date { flex: none; width: 46px; padding: 6px 0; border-radius: var(--nx-r-2); background: var(--nx-surface-1); display: flex; flex-direction: column; align-items: center; }
    .q-item:hover .q-date { background: var(--nx-surface-2); }
    .q-month { font-family: var(--nx-font-mono); font-size: 9.5px; text-transform: uppercase; color: var(--nx-text-dim); }
    .q-day { font-family: var(--nx-font-display); font-weight: 800; font-size: 17px; }
    .q-date.undated .q-day { color: var(--nx-text-dim); }
    .q-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .q-title { font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; line-height: 1.3; color: var(--nx-text); }
    .q-meta { font-size: 12px; color: var(--nx-text-dim); }
  `,
})
export class PanelBlogComponent {
  private readonly repository = inject(BlogPostsRepository);

  protected readonly tabs = BLOG_TABS;
  protected readonly sorts = BLOG_SORTS;
  protected readonly categories = BLOG_CATEGORIES;
  protected readonly siteUrl = BLOG_SITE_URL;

  protected readonly state = signal<LoadState>('loading');
  protected readonly errorMessage = signal('');
  protected readonly posts = signal<BlogPost[]>([]);
  protected readonly criteria = signal<BlogCriteria>(EMPTY_BLOG_CRITERIA);
  private readonly now = new Date();

  protected readonly stats = computed(() => blogStats(this.posts()));
  protected readonly counts = computed(() => tabCounts(this.posts(), this.criteria()));
  protected readonly rows = computed(() => filterPosts(this.posts(), this.criteria()));
  protected readonly upcoming = computed(() => upcomingPosts(this.posts(), this.now));

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.posts.set(await this.repository.list());
      this.state.set('ok');
    } catch (error) {
      this.errorMessage.set(`Não foi possível carregar os posts. ${callableErrorMessage(error)}`);
      this.state.set('error');
    }
  }

  protected patch(change: Partial<BlogCriteria>): void {
    this.criteria.update((c) => ({ ...c, ...change }));
  }

  protected setSort(id: string): void {
    const sort = BLOG_SORTS.find((s) => s.id === id)?.id;
    if (sort) {
      this.patch({ sort });
    }
  }

  protected clearFilters(): void {
    this.criteria.set(EMPTY_BLOG_CRITERIA);
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected kpi(n: number): string {
    return this.state() === 'ok' ? formatCount(n) : '—';
  }

  protected count(n: number): string {
    return formatCount(n);
  }

  protected metaLine(post: BlogPost): string {
    const author = post.author.name || 'Sem autor';
    if (!post.cta) {
      return author;
    }
    return `${author} · chamada: ${post.cta.label || ctaDestinationLabel(post.cta.destination)}`;
  }

  protected publication(post: BlogPost): string {
    return publicationLabel(post, this.now);
  }

  protected month(d: Date): string {
    return monthAbbr(d);
  }

  protected day(d: Date): number {
    return saoPauloParts(d).day;
  }
}
