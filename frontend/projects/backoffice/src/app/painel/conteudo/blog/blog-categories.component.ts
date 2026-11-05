import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { callableErrorMessage } from '../../data/callable-error';
import { ConfirmDialogComponent } from '../../ui/confirm-dialog.component';
import { IconComponent } from '../../ui/icon.component';
import { PageHeaderComponent } from '../../ui/page-header.component';
import { PanelCardComponent } from '../../ui/panel-card.component';
import { PanelShellComponent } from '../../ui/panel-shell.component';
import { PillComponent } from '../../ui/pill.component';
import { BlogPostsRepository } from './data/blog-posts.repository';
import {
  BLOG_CATEGORIES_MAX,
  changedOrders,
  moveCategory,
  nextOrder,
  taxonomyCounts,
  type BlogCategoryDef,
  type SaveBlogCategoryInput,
} from './data/blog-taxonomy';
import { BlogTaxonomyRepository } from './data/blog-taxonomy.repository';
import { BlogTaxonomyService } from './data/blog-taxonomy.service';
import { BlogCategoryFormComponent } from './ui/blog-category-form.component';

/** `not-found` cru ("NOT FOUND") é callable que ainda não foi publicada. */
function errorText(error: unknown): string {
  const code = String((error as { code?: unknown })?.code ?? '');
  const message = String((error as { message?: unknown })?.message ?? '');
  if (code.includes('not-found') && (!message || message === 'NOT FOUND')) {
    return 'Função ainda não publicada no servidor.';
  }
  return callableErrorMessage(error);
}

/**
 * Conteúdo › Blog › Categorias: a lista efetiva (6 de origem ⊕ `blogCategories`), com prévia do chip
 * nos dois temas, nº de posts, ordem e situação. Escrita pela callable `saveBlogCategory`.
 */
@Component({
  selector: 'bo-blog-categories',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    PanelShellComponent,
    PageHeaderComponent,
    PanelCardComponent,
    IconComponent,
    PillComponent,
    ConfirmDialogComponent,
    BlogCategoryFormComponent,
  ],
  template: `
    <bo-panel-shell>
      <bo-page-header title="Categorias" subtitle="Conteúdo › Blog">
        <button type="button" class="bo-mini-btn bo-mini-btn-primary" [disabled]="full() || saving()" [attr.title]="full() ? 'Até ' + max + ' categorias' : null" (click)="startNew()">
          <bo-icon name="plus" [size]="13" />
          Nova categoria
        </button>
      </bo-page-header>

      <div class="body">
        <a class="back" routerLink="/painel/conteudo/blog">
          <bo-icon name="chevron-left" [size]="13" />
          Posts
        </a>
        @if (notice(); as text) {
          <div class="bo-feedback" role="status"><bo-icon name="check" [size]="15" /><span>{{ text }}</span></div>
        }
        @if (error(); as text) {
          <div class="bo-alert" role="alert"><bo-icon name="alert" [size]="16" /><span>{{ text }}</span></div>
        }

        <div class="grid">
          <bo-panel-card pad="sm" title="Na ordem do app" kicker="Chips e filtros seguem esta ordem">
            @if (!loaded()) {
              @for (slot of [0, 1, 2]; track slot) {
                <div class="skeleton"></div>
              }
            } @else {
              <div class="rows">
                @for (c of list(); track c.id; let i = $index) {
                  <div class="row" [class.off]="!c.active" [class.editing]="editing()?.id === c.id">
                    <div class="order">
                      <button type="button" class="icon-btn" [attr.aria-label]="'Subir ' + c.label" [disabled]="saving() || i === 0" (click)="move(i, -1)">
                        <bo-icon class="up" name="chevron-down" [size]="13" />
                      </button>
                      <button type="button" class="icon-btn" [attr.aria-label]="'Descer ' + c.label" [disabled]="saving() || i === list().length - 1" (click)="move(i, 1)">
                        <bo-icon name="chevron-down" [size]="13" />
                      </button>
                    </div>
                    <div class="previews" aria-hidden="true">
                      <span class="chip dark" [style.color]="c.color" [style.border-color]="c.color + '59'" [style.background]="c.color + '1a'">{{ c.label }}</span>
                      <span class="chip light" [style.color]="c.colorLight" [style.border-color]="c.colorLight + '40'">{{ c.label }}</span>
                    </div>
                    <div class="info">
                      <span class="name">{{ c.label }}</span>
                      <span class="meta">{{ c.id }} · {{ countLabel(c.id) }}{{ c.isDefault ? ' · de origem' : '' }}</span>
                    </div>
                    <bo-pill [tone]="c.active ? 'green' : 'dim'">{{ c.active ? 'Ativa' : 'Inativa' }}</bo-pill>
                    <button type="button" class="bo-mini-btn" [disabled]="saving()" (click)="edit(c)">Editar</button>
                  </div>
                }
              </div>
            }
          </bo-panel-card>

          @if (editing(); as e) {
            <bo-blog-category-form
              [category]="e.id === null ? null : e"
              [saving]="saving()"
              (saved)="onFormSave($event)"
              (cancelled)="editing.set(null)"
            />
          } @else {
            <p class="explain">
              As 6 categorias de origem valem sem cadastro; editar uma delas grava a sua versão. Categoria inativa some do
              editor e dos filtros do app, mas os posts que já estão nela continuam com o mesmo rótulo e cor.
            </p>
          }
        </div>
      </div>

      @if (confirmDeactivate(); as pending) {
        <bo-confirm-dialog
          [open]="true"
          title="Desativar categoria?"
          [description]="deactivateText(pending)"
          confirmLabel="Desativar"
          [busy]="saving()"
          [error]="confirmError()"
          (confirmed)="save(pending)"
          (dismissed)="confirmDeactivate.set(null)"
        />
      }
    </bo-panel-shell>
  `,
  styles: `
    .body { padding: 16px 32px 40px; display: flex; flex-direction: column; gap: 14px; min-width: 0; }
    @media (max-width: 760px) { .body { padding: 16px; } }
    .back { align-self: flex-start; display: inline-flex; align-items: center; gap: 4px; color: var(--nx-text-mute); text-decoration: none; font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; }
    .grid { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 18px; align-items: start; }
    @media (max-width: 1180px) { .grid { grid-template-columns: minmax(0, 1fr); } }
    .rows { display: flex; flex-direction: column; margin: 0 -16px -16px; }
    .row { display: flex; align-items: center; gap: 12px; padding: 10px 16px; border-top: 1px solid var(--nx-line); }
    .row.off .previews, .row.off .name { opacity: 0.55; }
    .row.editing { background: var(--nx-surface-1); }
    .order { display: flex; flex-direction: column; gap: 2px; }
    .icon-btn { width: 26px; height: 22px; display: grid; place-items: center; border: 1px solid var(--nx-line); border-radius: 6px; background: transparent; color: var(--nx-text-mute); cursor: pointer; }
    .icon-btn:disabled { opacity: 0.3; cursor: default; }
    bo-icon.up { display: grid; transform: rotate(180deg); }
    .previews { display: flex; flex-direction: column; gap: 4px; flex: none; width: 150px; }
    .chip { align-self: flex-start; max-width: 100%; display: inline-flex; align-items: center; height: 22px; padding: 0 9px; border-radius: var(--nx-r-pill); border: 1px solid; font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .chip.dark { background: #0b0b0c; }
    .chip.light { background: #faf8f4; }
    .info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .name { font-family: var(--nx-font-display); font-weight: 600; font-size: 13.5px; color: var(--nx-text); }
    .meta { font-family: var(--nx-font-mono); font-size: 11px; color: var(--nx-text-dim); }
    .skeleton { height: 56px; margin-top: 8px; border-radius: var(--nx-r-2); background: var(--nx-surface-1); opacity: 0.6; }
    .explain { margin: 0; padding: 14px 16px; border-radius: var(--nx-r-3); background: var(--nx-surface-0); border: 1px solid var(--nx-line); font-size: 12.5px; line-height: 1.55; color: var(--nx-text-mute); }
  `,
})
export class BlogCategoriesComponent {
  private readonly taxonomy = inject(BlogTaxonomyService);
  private readonly repository = inject(BlogTaxonomyRepository);
  private readonly posts = inject(BlogPostsRepository);

  protected readonly max = BLOG_CATEGORIES_MAX;
  protected readonly list = this.taxonomy.categories;
  protected readonly loaded = this.taxonomy.loaded;
  /** Categoria em edição; `{id: null}` = nova. */
  protected readonly editing = signal<BlogCategoryDef | { id: null } | null>(null);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly confirmDeactivate = signal<SaveBlogCategoryInput | null>(null);
  protected readonly confirmError = signal<string | null>(null);
  private readonly counts = signal<Map<string, number>>(new Map());

  /** O servidor conta os docs (inclusive os das de origem já editadas); as de origem sem doc não contam. */
  protected readonly full = computed(() => this.list().filter((c) => c.hasDoc && !c.isDefault).length >= BLOG_CATEGORIES_MAX);

  constructor() {
    void this.taxonomy.refresh();
    void this.loadCounts();
  }

  private async loadCounts(): Promise<void> {
    try {
      this.counts.set(taxonomyCounts(await this.posts.list()).categories);
    } catch {
      // Sem contagem a lista continua; o número só some.
    }
  }

  protected countLabel(id: string): string {
    const n = this.counts().get(id) ?? 0;
    return n === 1 ? '1 post' : `${n} posts`;
  }

  protected startNew(): void {
    this.notice.set('');
    this.editing.set({ id: null });
  }

  protected edit(c: BlogCategoryDef): void {
    this.notice.set('');
    this.editing.set(c);
  }

  /** O formulário devolve o input pronto; desativar categoria com posts pede confirmação. */
  protected onFormSave(input: Omit<SaveBlogCategoryInput, 'order'> & { order: number | null }): void {
    const order = input.order ?? nextOrder(this.list());
    const full: SaveBlogCategoryInput = { ...input, order };
    const current = input.id ? this.list().find((c) => c.id === input.id) : null;
    if (current?.active && !input.active && (this.counts().get(input.id!) ?? 0) > 0) {
      this.confirmError.set(null);
      this.confirmDeactivate.set(full);
      return;
    }
    void this.save(full);
  }

  protected deactivateText(input: SaveBlogCategoryInput): string {
    const n = this.counts().get(input.id ?? '') ?? 0;
    return (
      `${n === 1 ? '1 post está' : `${n} posts estão`} em “${input.label}”. Eles continuam com ela, com o mesmo rótulo e cor; ` +
      'ela só some do editor e dos filtros do app.'
    );
  }

  protected async save(input: SaveBlogCategoryInput): Promise<void> {
    this.saving.set(true);
    this.error.set('');
    this.confirmError.set(null);
    try {
      await this.repository.saveCategory(input);
      await this.taxonomy.refresh();
      this.editing.set(null);
      this.confirmDeactivate.set(null);
      this.notice.set(input.id ? 'Categoria salva.' : 'Categoria criada.');
    } catch (error) {
      if (this.confirmDeactivate()) {
        this.confirmError.set(errorText(error));
      } else {
        this.error.set(errorText(error));
      }
    } finally {
      this.saving.set(false);
    }
  }

  /** Troca com o vizinho e grava a ordem nova das que mudaram (um save por categoria). */
  protected async move(index: number, delta: -1 | 1): Promise<void> {
    const before = this.list();
    const after = moveCategory(before, index, delta);
    const changed = changedOrders(before, after);
    if (changed.length === 0) {
      return;
    }
    this.list.set(after);
    this.saving.set(true);
    this.error.set('');
    try {
      for (const c of changed) {
        await this.repository.saveCategory({ id: c.id, label: c.label, color: c.color, colorLight: c.colorLight, order: c.order, active: c.active });
      }
      await this.taxonomy.refresh();
    } catch (error) {
      this.error.set(`Não foi possível salvar a ordem. ${errorText(error)}`);
      await this.taxonomy.refresh();
    } finally {
      this.saving.set(false);
    }
  }
}
