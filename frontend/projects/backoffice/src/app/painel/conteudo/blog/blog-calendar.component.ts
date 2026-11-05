import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { callableErrorMessage } from '../../data/callable-error';
import { IconComponent } from '../../ui/icon.component';
import { PageHeaderComponent } from '../../ui/page-header.component';
import { PanelShellComponent } from '../../ui/panel-shell.component';
import {
  WEEKDAY_SHORT,
  dayHeading,
  entriesByDay,
  monthGrid,
  monthLabel,
  monthOf,
  monthParam,
  parseMonthParam,
  shiftMonth,
  undatedPosts,
  type MonthRef,
} from './data/blog-calendar';
import { BLOG_STATUS_LABELS, type BlogPost, type BlogStatus } from './data/blog-post';
import { BlogPostsRepository } from './data/blog-posts.repository';

type LoadState = 'loading' | 'ok' | 'error';

/**
 * Conteúdo › Blog › Calendário: os posts por `publishAt` no mês (São Paulo). Publicado, agendado
 * (com hora) e rascunho/revisão com data planejada; sem data numa faixa à parte.
 */
@Component({
  selector: 'bo-blog-calendar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PanelShellComponent, PageHeaderComponent, IconComponent],
  template: `
    <bo-panel-shell>
      <bo-page-header title="Calendário" subtitle="Conteúdo › Blog">
        <a class="bo-mini-btn bo-mini-btn-primary" routerLink="/painel/conteudo/blog/novo">
          <bo-icon name="plus" [size]="13" />
          Novo post
        </a>
      </bo-page-header>

      <div class="body">
        <a class="back" routerLink="/painel/conteudo/blog">
          <bo-icon name="chevron-left" [size]="13" />
          Posts
        </a>

        <div class="toolbar">
          <button type="button" class="nav-btn" aria-label="Mês anterior" (click)="go(-1)">
            <bo-icon name="chevron-left" [size]="15" />
          </button>
          <h2 aria-live="polite">{{ label() }}</h2>
          <button type="button" class="nav-btn" aria-label="Próximo mês" (click)="go(1)">
            <bo-icon name="chevron-right" [size]="15" />
          </button>
          <button type="button" class="bo-mini-btn" [disabled]="isCurrentMonth()" (click)="goToday()">Hoje</button>
          <span class="legend" aria-hidden="true">
            @for (s of legend; track s) {
              <span class="chip-dot" [class]="'chip-dot st-' + s"></span>{{ statusLabel(s) }}
            }
          </span>
        </div>

        @if (state() === 'loading') {
          <div class="skeleton"></div>
        } @else if (state() === 'error') {
          <div class="bo-alert" role="alert"><bo-icon name="alert" [size]="16" /><span>{{ error() }}</span></div>
          <button type="button" class="bo-mini-btn retry" (click)="load()">Tentar de novo</button>
        } @else {
          <div class="grid" role="grid" [attr.aria-label]="label()">
            <div class="row head" role="row">
              @for (w of weekdays; track w) {
                <span role="columnheader">{{ w }}</span>
              }
            </div>
            @for (week of grid(); track week[0]!.key) {
              <div class="row" role="row">
                @for (day of week; track day.key) {
                  <div class="cell" role="gridcell" [class.out]="!day.inMonth" [class.today]="day.isToday">
                    <span class="num">{{ day.day }}</span>
                    @for (e of day.entries; track e.id) {
                      <a class="chip" [class]="'chip st-' + e.status" [routerLink]="['/painel/conteudo/blog', e.id]" [attr.title]="chipTitle(e.title, e.status, e.time)">
                        @if (e.time) {
                          <span class="time">{{ e.time }}</span>
                        }
                        <span class="t">{{ e.title }}</span>
                      </a>
                    }
                  </div>
                }
              </div>
            }
          </div>

          <!-- Telas estreitas: lista por dia, só os dias com post. -->
          <div class="list">
            @for (day of daysWithPosts(); track day.key) {
              <section class="list-day" [class.today]="day.isToday">
                <h3>{{ heading(day.key) }}{{ day.isToday ? ' · hoje' : '' }}</h3>
                @for (e of day.entries; track e.id) {
                  <a class="chip" [class]="'chip st-' + e.status" [routerLink]="['/painel/conteudo/blog', e.id]">
                    @if (e.time) {
                      <span class="time">{{ e.time }}</span>
                    }
                    <span class="t">{{ e.title }}</span>
                    <span class="st">{{ statusLabel(e.status) }}</span>
                  </a>
                }
              </section>
            } @empty {
              <p class="none">Nenhum post com data em {{ label() }}.</p>
            }
          </div>

          <section class="undated">
            <h3>Sem data <span class="count">{{ undated().length }}</span></h3>
            @if (undated().length === 0) {
              <p class="none">Todo rascunho tem data planejada.</p>
            } @else {
              <div class="undated-list">
                @for (p of undated(); track p.id) {
                  <a class="chip" [class]="'chip st-' + p.status" [routerLink]="['/painel/conteudo/blog', p.id]">
                    <span class="t">{{ p.title || 'Sem título' }}</span>
                    <span class="st">{{ statusLabel(p.status) }}</span>
                  </a>
                }
              </div>
            }
          </section>
        }
      </div>
    </bo-panel-shell>
  `,
  styles: `
    .body { padding: 16px 32px 40px; display: flex; flex-direction: column; gap: 14px; min-width: 0; }
    @media (max-width: 760px) { .body { padding: 16px; } }
    a.bo-mini-btn { text-decoration: none; }
    .back { align-self: flex-start; display: inline-flex; align-items: center; gap: 4px; color: var(--nx-text-mute); text-decoration: none; font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; }
    .back:hover { color: var(--nx-text); }
    .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .toolbar h2 { margin: 0 4px; min-width: 150px; text-align: center; font-family: var(--nx-font-display); font-weight: 700; font-size: 17px; }
    .nav-btn { width: 32px; height: 32px; display: grid; place-items: center; border-radius: var(--nx-r-2); border: 1px solid var(--nx-line-strong); background: var(--nx-surface-1); color: var(--nx-text); cursor: pointer; }
    .nav-btn:hover { background: var(--nx-surface-2); }
    .legend { margin-left: auto; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; font-size: 11.5px; color: var(--nx-text-dim); }
    .chip-dot { display: inline-block; width: 8px; height: 8px; margin-right: 5px; border-radius: 2px; }

    .grid { display: flex; flex-direction: column; border: 1px solid var(--nx-line); border-radius: var(--nx-r-4); overflow: hidden; background: var(--nx-surface-0); }
    .row { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); }
    .row.head span { padding: 8px 10px; font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); border-bottom: 1px solid var(--nx-line); }
    .cell { min-height: 104px; padding: 6px; display: flex; flex-direction: column; gap: 4px; border-right: 1px solid var(--nx-line); border-bottom: 1px solid var(--nx-line); min-width: 0; }
    .cell:nth-child(7) { border-right: none; }
    .row:last-child .cell { border-bottom: none; }
    .cell.out { background: rgba(255, 255, 255, 0.015); }
    .cell.out .num { color: var(--nx-text-dim); opacity: 0.5; }
    .num { align-self: flex-start; min-width: 22px; height: 22px; padding: 0 4px; box-sizing: border-box; display: grid; place-items: center; border-radius: var(--nx-r-pill); font-family: var(--nx-font-mono); font-size: 11.5px; color: var(--nx-text-mute); }
    .cell.today { background: rgba(255, 106, 26, 0.05); }
    .cell.today .num { background: var(--nx-orange-500); color: var(--nx-text-on-orange); font-weight: 700; }

    .chip { display: flex; align-items: center; gap: 5px; min-width: 0; padding: 3px 6px; border-radius: 6px; border-left: 3px solid; text-decoration: none; font-size: 11.5px; color: var(--nx-text); background: var(--nx-surface-1); }
    .chip:hover { background: var(--nx-surface-2); }
    .chip .t { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; min-width: 0; flex: 1; }
    .chip .time { flex: none; font-family: var(--nx-font-mono); font-size: 10.5px; color: var(--nx-text-mute); }
    .chip .st { flex: none; font-family: var(--nx-font-mono); font-size: 9.5px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--nx-text-dim); }
    .st-published { border-color: var(--nx-win); }
    .st-scheduled { border-color: var(--nx-pending); }
    .st-review { border-color: var(--nx-orange-500); }
    .st-draft { border-color: var(--nx-line-strong); }
    .chip-dot.st-published { background: var(--nx-win); }
    .chip-dot.st-scheduled { background: var(--nx-pending); }
    .chip-dot.st-review { background: var(--nx-orange-500); }
    .chip-dot.st-draft { background: var(--nx-line-strong); }

    .list { display: none; flex-direction: column; gap: 12px; }
    .list-day { display: flex; flex-direction: column; gap: 6px; }
    .list-day.today h3 { color: var(--nx-orange-500); }
    .list .chip { padding: 8px 10px; font-size: 13px; }
    @media (max-width: 760px) {
      .grid { display: none; }
      .list { display: flex; }
    }

    h3 { margin: 0; font-family: var(--nx-font-display); font-weight: 700; font-size: 13px; color: var(--nx-text); }
    .undated { display: flex; flex-direction: column; gap: 8px; padding: 14px 16px; border-radius: var(--nx-r-4); border: 1px dashed var(--nx-line-strong); }
    .count { margin-left: 4px; font-family: var(--nx-font-mono); font-size: 11px; color: var(--nx-text-dim); }
    .undated-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 6px; }
    .undated .chip { padding: 8px 10px; font-size: 13px; }
    .none { margin: 0; font-size: 12.5px; color: var(--nx-text-dim); }
    .skeleton { height: 520px; border-radius: var(--nx-r-4); background: var(--nx-surface-1); opacity: 0.6; }
    .retry { align-self: flex-start; }
  `,
})
export class BlogCalendarComponent {
  private readonly repository = inject(BlogPostsRepository);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly weekdays = WEEKDAY_SHORT;
  protected readonly legend: BlogStatus[] = ['published', 'scheduled', 'review', 'draft'];
  private readonly now = new Date();

  protected readonly state = signal<LoadState>('loading');
  protected readonly error = signal('');
  private readonly posts = signal<BlogPost[]>([]);
  /** `?mes=2026-11` mantém o mês ao recarregar; sem ele, o mês de hoje. */
  protected readonly month = signal<MonthRef>(parseMonthParam(this.route.snapshot.queryParamMap.get('mes')) ?? monthOf(this.now));

  protected readonly label = computed(() => monthLabel(this.month()));
  protected readonly isCurrentMonth = computed(() => monthParam(this.month()) === monthParam(monthOf(this.now)));
  private readonly entries = computed(() => entriesByDay(this.posts()));
  protected readonly grid = computed(() => monthGrid(this.month(), this.entries(), this.now));
  protected readonly daysWithPosts = computed(() => this.grid().flat().filter((d) => d.inMonth && d.entries.length > 0));
  protected readonly undated = computed(() => undatedPosts(this.posts()));

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.posts.set(await this.repository.list());
      this.state.set('ok');
    } catch (error) {
      this.error.set(`Não foi possível carregar os posts. ${callableErrorMessage(error)}`);
      this.state.set('error');
    }
  }

  protected go(delta: number): void {
    this.setMonth(shiftMonth(this.month(), delta));
  }

  protected goToday(): void {
    this.setMonth(monthOf(this.now));
  }

  private setMonth(m: MonthRef): void {
    this.month.set(m);
    void this.router.navigate([], { relativeTo: this.route, queryParams: { mes: monthParam(m) }, replaceUrl: true });
  }

  protected statusLabel(status: BlogStatus): string {
    return BLOG_STATUS_LABELS[status];
  }

  protected heading(key: string): string {
    return dayHeading(key);
  }

  protected chipTitle(title: string, status: BlogStatus, time: string | null): string {
    return [title, BLOG_STATUS_LABELS[status], time].filter(Boolean).join(' · ');
  }
}
