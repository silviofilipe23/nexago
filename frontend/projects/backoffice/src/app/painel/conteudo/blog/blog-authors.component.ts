import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { callableErrorMessage } from '../../data/callable-error';
import { FieldComponent } from '../../ui/field.component';
import { IconComponent } from '../../ui/icon.component';
import { PageHeaderComponent } from '../../ui/page-header.component';
import { PanelCardComponent } from '../../ui/panel-card.component';
import { PanelShellComponent } from '../../ui/panel-shell.component';
import { PillComponent } from '../../ui/pill.component';
import { ToggleComponent } from '../../ui/toggle.component';
import { initialsOf } from './data/blog-comments';
import { BlogPostsRepository } from './data/blog-posts.repository';
import {
  BLOG_AUTHOR_BIO_MAX,
  BLOG_AUTHOR_NAME_MAX,
  BLOG_AUTHOR_ROLE_MAX,
  authorErrors,
  sortAuthors,
  taxonomyCounts,
  type BlogAuthorDef,
  type SaveBlogAuthorInput,
} from './data/blog-taxonomy';
import { BlogTaxonomyRepository } from './data/blog-taxonomy.repository';
import { BlogTaxonomyService } from './data/blog-taxonomy.service';
import { BlogImagePickerComponent } from './ui/blog-image-picker.component';

/** `not-found` cru ("NOT FOUND") é callable que ainda não foi publicada. */
function errorText(error: unknown): string {
  const code = String((error as { code?: unknown })?.code ?? '');
  const message = String((error as { message?: unknown })?.message ?? '');
  if (code.includes('not-found') && (!message || message === 'NOT FOUND')) {
    return 'Função ainda não publicada no servidor.';
  }
  return callableErrorMessage(error);
}

const EMPTY: SaveBlogAuthorInput = { id: null, name: '', role: '', photoUrl: null, bio: '', active: true };

/**
 * Conteúdo › Blog › Autores: quem assina os posts. O editor escolhe entre os ativos e o post grava o
 * retrato (nome, função, foto) do cadastro. Escrita pela callable `saveBlogAuthor`.
 */
@Component({
  selector: 'bo-blog-authors',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    PanelShellComponent,
    PageHeaderComponent,
    PanelCardComponent,
    FieldComponent,
    IconComponent,
    PillComponent,
    ToggleComponent,
    BlogImagePickerComponent,
  ],
  template: `
    <bo-panel-shell>
      <bo-page-header title="Autores" subtitle="Conteúdo › Blog">
        <button type="button" class="bo-mini-btn bo-mini-btn-primary" [disabled]="saving()" (click)="edit(null)">
          <bo-icon name="plus" [size]="13" />
          Novo autor
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

        <div class="grid">
          <bo-panel-card pad="sm" title="Time do blog">
            @if (!loaded()) {
              @for (slot of [0, 1, 2]; track slot) {
                <div class="skeleton"></div>
              }
            } @else {
              <div class="rows">
                @for (a of authors(); track a.id) {
                  <div class="row" [class.off]="!a.active" [class.editing]="form()?.id === a.id">
                    @if (a.photoUrl; as src) {
                      <img class="avatar" [src]="src" alt="" />
                    } @else {
                      <span class="avatar initials" aria-hidden="true">{{ initials(a.name) }}</span>
                    }
                    <span class="info">
                      <span class="name">{{ a.name }}</span>
                      <span class="meta">{{ a.role || 'Sem função' }} · {{ countLabel(a.id) }}</span>
                    </span>
                    <bo-pill [tone]="a.active ? 'green' : 'dim'">{{ a.active ? 'Ativo' : 'Inativo' }}</bo-pill>
                    <button type="button" class="bo-mini-btn" [disabled]="saving()" (click)="edit(a)">Editar</button>
                  </div>
                } @empty {
                  <p class="none">Nenhum autor ainda. Os posts seguem com o autor em texto livre.</p>
                }
              </div>
            }
          </bo-panel-card>

          @if (form(); as f) {
            <bo-panel-card pad="sm" [title]="f.id ? 'Editar autor' : 'Novo autor'">
              <div class="stack">
                <div class="photo">
                  <bo-blog-image-picker
                    [url]="f.photoUrl"
                    [height]="140"
                    [disabled]="saving()"
                    alt="Foto do autor"
                    pickLabel="Enviar foto"
                    replaceLabel="Trocar"
                    spec="Quadrada, JPG, PNG ou WebP até 5 MB"
                    (urlChange)="patch({ photoUrl: $event })"
                    (uploading)="uploading.set($event)"
                  />
                </div>
                <bo-field label="Nome" [hint]="f.name.length + ' de ' + limits.name">
                  <input class="bo-input" [attr.maxlength]="limits.name" [value]="f.name" [disabled]="saving()" (input)="patch({ name: value($event) })" />
                </bo-field>
                <bo-field label="Função" [hint]="f.role.length + ' de ' + limits.role">
                  <input class="bo-input" placeholder="Ex.: Professor de vôlei de praia" [attr.maxlength]="limits.role" [value]="f.role" [disabled]="saving()" (input)="patch({ role: value($event) })" />
                </bo-field>
                <bo-field label="Bio" [hint]="f.bio.length + ' de ' + limits.bio">
                  <textarea class="bo-input area" rows="3" [attr.maxlength]="limits.bio" [value]="f.bio" [disabled]="saving()" (input)="patch({ bio: value($event) })"></textarea>
                </bo-field>
                <div class="toggle-row">
                  <span><strong>Ativo</strong><span class="dim">Inativo some da escolha no editor; os posts dele não mudam.</span></span>
                  <bo-toggle ariaLabel="Autor ativo" [checked]="f.active" [disabled]="saving()" (checkedChange)="patch({ active: $event })" />
                </div>
                @if (error(); as text) {
                  <p class="err" role="alert">{{ text }}</p>
                } @else if (errors().length > 0) {
                  <p class="err">{{ errors()[0] }}</p>
                }
                <div class="actions">
                  <button type="button" class="bo-mini-btn" [disabled]="saving()" (click)="form.set(null)">Cancelar</button>
                  <button type="button" class="bo-mini-btn bo-mini-btn-primary" [disabled]="saving() || uploading() || errors().length > 0" (click)="save()">
                    {{ f.id ? 'Salvar' : 'Criar autor' }}
                  </button>
                </div>
              </div>
            </bo-panel-card>
          } @else {
            <p class="explain">
              O post grava o retrato do autor no momento do save: trocar a foto ou a função aqui vale para os próximos saves
              de cada post.
            </p>
          }
        </div>
      </div>
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
    .row.off .avatar, .row.off .name { opacity: 0.55; }
    .row.editing { background: var(--nx-surface-1); }
    .avatar { flex: none; width: 40px; height: 40px; border-radius: 50%; object-fit: cover; background: var(--nx-surface-2); }
    .avatar.initials { display: grid; place-items: center; font-family: var(--nx-font-display); font-weight: 700; font-size: 13px; color: var(--nx-orange-500); background: var(--nx-orange-tint); }
    .info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .name { font-family: var(--nx-font-display); font-weight: 600; font-size: 13.5px; color: var(--nx-text); }
    .meta { font-size: 12px; color: var(--nx-text-dim); }
    .none { margin: 0; padding: 16px; font-size: 12.5px; color: var(--nx-text-dim); border-top: 1px solid var(--nx-line); }
    .stack { display: flex; flex-direction: column; gap: 14px; }
    .photo { width: 140px; }
    .bo-input.area { height: auto; min-height: 76px; padding: 10px 13px; resize: vertical; line-height: 1.45; font-family: var(--nx-font-ui); }
    .toggle-row { display: flex; align-items: center; gap: 12px; }
    .toggle-row > span { flex: 1; display: flex; flex-direction: column; gap: 2px; }
    .toggle-row strong { font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; color: var(--nx-text); }
    .dim { font-size: 11.5px; color: var(--nx-text-dim); }
    .err { margin: 0; font-size: 12px; color: var(--nx-live); }
    .actions { display: flex; justify-content: flex-end; gap: 8px; }
    .skeleton { height: 56px; margin-top: 8px; border-radius: var(--nx-r-2); background: var(--nx-surface-1); opacity: 0.6; }
    .explain { margin: 0; padding: 14px 16px; border-radius: var(--nx-r-3); background: var(--nx-surface-0); border: 1px solid var(--nx-line); font-size: 12.5px; line-height: 1.55; color: var(--nx-text-mute); }
  `,
})
export class BlogAuthorsComponent {
  private readonly taxonomy = inject(BlogTaxonomyService);
  private readonly repository = inject(BlogTaxonomyRepository);
  private readonly posts = inject(BlogPostsRepository);

  protected readonly limits = { name: BLOG_AUTHOR_NAME_MAX, role: BLOG_AUTHOR_ROLE_MAX, bio: BLOG_AUTHOR_BIO_MAX };
  protected readonly loaded = this.taxonomy.loaded;
  /** Ativos primeiro, cada grupo por nome. */
  protected readonly authors = computed(() => {
    const all = sortAuthors(this.taxonomy.authors());
    return [...all.filter((a) => a.active), ...all.filter((a) => !a.active)];
  });
  protected readonly form = signal<SaveBlogAuthorInput | null>(null);
  protected readonly saving = signal(false);
  protected readonly uploading = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  private readonly counts = signal<Map<string, number>>(new Map());

  protected readonly errors = computed(() => {
    const f = this.form();
    return f ? authorErrors(f) : [];
  });

  constructor() {
    void this.taxonomy.refresh();
    void this.loadCounts();
  }

  private async loadCounts(): Promise<void> {
    try {
      this.counts.set(taxonomyCounts(await this.posts.list()).authors);
    } catch {
      // Sem contagem a lista continua.
    }
  }

  protected countLabel(id: string): string {
    const n = this.counts().get(id) ?? 0;
    return n === 1 ? '1 post' : `${n} posts`;
  }

  protected initials(name: string): string {
    return initialsOf(name);
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
  }

  protected edit(a: BlogAuthorDef | null): void {
    this.error.set('');
    this.notice.set('');
    this.form.set(a ? { id: a.id, name: a.name, role: a.role, photoUrl: a.photoUrl, bio: a.bio, active: a.active } : { ...EMPTY });
  }

  protected patch(change: Partial<SaveBlogAuthorInput>): void {
    this.form.update((f) => (f ? { ...f, ...change } : f));
  }

  protected async save(): Promise<void> {
    const f = this.form();
    if (!f || this.errors().length > 0) {
      return;
    }
    this.saving.set(true);
    this.error.set('');
    try {
      await this.repository.saveAuthor({
        ...f,
        name: f.name.replace(/\s+/g, ' ').trim(),
        role: f.role.replace(/\s+/g, ' ').trim(),
        bio: f.bio.trim(),
      });
      await this.taxonomy.refresh();
      this.form.set(null);
      this.notice.set(f.id ? 'Autor salvo.' : 'Autor criado.');
    } catch (error) {
      this.error.set(errorText(error));
    } finally {
      this.saving.set(false);
    }
  }
}
