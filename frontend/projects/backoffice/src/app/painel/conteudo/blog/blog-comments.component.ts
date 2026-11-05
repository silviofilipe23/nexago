import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import { AuthService } from '../../../auth/auth.service';
import { callableErrorMessage } from '../../data/callable-error';
import { BlogBadgesService } from '../../data/blog-badges.service';
import { ConfirmDialogComponent } from '../../ui/confirm-dialog.component';
import { IconComponent } from '../../ui/icon.component';
import { PageHeaderComponent } from '../../ui/page-header.component';
import { PanelShellComponent } from '../../ui/panel-shell.component';
import { PillComponent } from '../../ui/pill.component';
import {
  BLOG_COMMENT_REPLY_MAX,
  BLOG_COMMENT_STATUSES,
  COMMENT_TABS,
  applyModeration,
  commentWhen,
  initialsOf,
  onlyQuestions,
  pendingDelta,
  replyIssue,
  type BlogComment,
  type BlogCommentAction,
  type BlogCommentStatus,
} from './data/blog-comments';
import { BlogCommentsRepository } from './data/blog-comments.repository';
import { BlogPostsRepository } from './data/blog-posts.repository';

type LoadState = 'loading' | 'ok' | 'error';

/** `not-found` cru ("NOT FOUND") é callable que ainda não foi publicada, não comentário sumido. */
function errorText(error: unknown): string {
  const code = String((error as { code?: unknown })?.code ?? '');
  const message = String((error as { message?: unknown })?.message ?? '');
  if (code.includes('not-found')) {
    return message && message !== 'NOT FOUND' ? message : 'Função ainda não publicada no servidor.';
  }
  return callableErrorMessage(error);
}

/**
 * Conteúdo › Blog › Comentários: a fila de moderação de comentários e dúvidas do app. Tudo nasce
 * pendente; aprovar, recusar, responder e excluir vão pela callable `moderateBlogComment`, com a
 * lista atualizada antes da resposta (e desfeita se der erro).
 */
@Component({
  selector: 'bo-blog-comments',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PanelShellComponent, PageHeaderComponent, IconComponent, PillComponent, ConfirmDialogComponent],
  template: `
    <bo-panel-shell>
      <bo-page-header title="Comentários" subtitle="Conteúdo › Blog">
        @if (pendingBadge() !== null) {
          <bo-pill [tone]="pendingBadge() ? 'orange' : 'dim'">{{ pendingBadge() }} {{ pendingBadge() === 1 ? 'pendente' : 'pendentes' }}</bo-pill>
        }
      </bo-page-header>

      <div class="body">
        <a class="back" routerLink="/painel/conteudo/blog">
          <bo-icon name="chevron-left" [size]="13" />
          Posts
        </a>

        <div class="bar">
          <div class="tabs" role="tablist" aria-label="Status">
            @for (t of tabs; track t.id) {
              <button type="button" role="tab" [class.active]="tab() === t.id" [attr.aria-selected]="tab() === t.id" (click)="setTab(t.id)">
                {{ t.label }}
              </button>
            }
          </div>
          <button type="button" class="bo-chip" [class.active]="questions()" [attr.aria-pressed]="questions()" (click)="questions.set(!questions())">
            Só dúvidas
          </button>
          @if (postId(); as id) {
            <span class="post-filter">
              Post: <strong>{{ titleOf(id) }}</strong>
              <button type="button" aria-label="Ver comentários de todos os posts" (click)="clearPost()">✕</button>
            </span>
          }
        </div>

        @if (actionError(); as text) {
          <div class="bo-alert" role="alert"><bo-icon name="alert" [size]="16" /><span>{{ text }}</span></div>
        }

        @if (state() === 'loading') {
          @for (slot of [0, 1, 2]; track slot) {
            <div class="skeleton"></div>
          }
        } @else if (state() === 'error') {
          <div class="bo-alert" role="alert"><bo-icon name="alert" [size]="16" /><span>{{ loadError() }}</span></div>
          <button type="button" class="bo-mini-btn retry" (click)="reload()">Tentar de novo</button>
        } @else {
          <div class="items">
            @for (c of visible(); track c.id) {
              <article class="item" [class.busy]="busy().has(c.id)">
                <div class="who">
                  @if (c.author.photoUrl; as src) {
                    <img class="avatar" [src]="src" alt="" />
                  } @else {
                    <span class="avatar initials" aria-hidden="true">{{ initials(c.author.name) }}</span>
                  }
                  <div class="who-text">
                    <span class="line">
                      <strong>{{ c.author.name }}</strong>
                      @if (c.kind === 'question') {
                        <bo-pill tone="yellow">Dúvida</bo-pill>
                      }
                      <span class="when">{{ when(c.createdAt) }}</span>
                    </span>
                    <a class="post-link" [routerLink]="['/painel/conteudo/blog', c.postId]">{{ titleOf(c.postId) }}</a>
                  </div>
                </div>
                <p class="text">{{ c.text }}</p>

                @if (c.reply && replyingId() !== c.id) {
                  <div class="reply">
                    <span class="reply-by">Resposta de {{ c.reply.byName }}</span>
                    <p>{{ c.reply.text }}</p>
                  </div>
                }

                @if (replyingId() === c.id) {
                  <div class="reply-form">
                    <textarea
                      class="bo-input area"
                      rows="3"
                      [attr.maxlength]="replyMax"
                      [attr.aria-label]="'Resposta para ' + c.author.name"
                      placeholder="Resposta da equipe nexaGO"
                      [value]="replyText()"
                      (input)="replyText.set(value($event))"
                    ></textarea>
                    <div class="reply-foot">
                      <span class="hint">
                        {{ replyText().length }} de {{ replyMax }}
                        @if (!c.reply) {
                          · a primeira resposta avisa o atleta por push
                        }
                        @if (c.status !== 'approved') {
                          · responder aprova
                        }
                      </span>
                      <button type="button" class="bo-mini-btn" (click)="cancelReply()">Cancelar</button>
                      <button type="button" class="bo-mini-btn bo-mini-btn-primary" [disabled]="!!replyProblem() || busy().has(c.id)" [attr.title]="replyProblem()" (click)="sendReply(c)">
                        {{ c.reply ? 'Salvar resposta' : 'Enviar resposta' }}
                      </button>
                    </div>
                  </div>
                } @else {
                  <div class="actions">
                    @if (c.status !== 'approved') {
                      <button type="button" class="bo-mini-btn bo-mini-btn-primary" [disabled]="busy().has(c.id)" (click)="act(c, 'approve')">
                        <bo-icon name="check" [size]="13" />
                        Aprovar
                      </button>
                    }
                    @if (c.status !== 'rejected') {
                      <button type="button" class="bo-mini-btn" [disabled]="busy().has(c.id)" (click)="startReply(c)">
                        {{ c.reply ? 'Editar resposta' : 'Responder' }}
                      </button>
                      <button type="button" class="bo-mini-btn" [disabled]="busy().has(c.id)" (click)="act(c, 'reject')">Recusar</button>
                    }
                    <button type="button" class="bo-ghost-btn danger" [disabled]="busy().has(c.id)" (click)="askDelete(c)">
                      <bo-icon name="trash" [size]="13" />
                      Excluir
                    </button>
                  </div>
                }
              </article>
            } @empty {
              <div class="empty">
                <bo-icon name="mail" [size]="20" />
                <p>{{ emptyText() }}</p>
              </div>
            }
          </div>
          @if (hasMore()) {
            <button type="button" class="bo-mini-btn more" [disabled]="loadingMore()" (click)="loadMore()">
              {{ loadingMore() ? 'Carregando…' : 'Carregar mais' }}
            </button>
          }
        }
      </div>

      @if (deleting(); as c) {
        <bo-confirm-dialog
          [open]="true"
          title="Excluir comentário?"
          [description]="'O comentário de ' + c.author.name + ' some do app e não dá para desfazer.'"
          confirmLabel="Excluir"
          tone="danger"
          [busy]="busy().has(c.id)"
          [error]="deleteError()"
          (confirmed)="confirmDelete(c)"
          (dismissed)="deleting.set(null)"
        />
      }
    </bo-panel-shell>
  `,
  styles: `
    .body { padding: 16px 32px 40px; display: flex; flex-direction: column; gap: 14px; max-width: 920px; min-width: 0; }
    @media (max-width: 760px) { .body { padding: 16px; } }
    .back { align-self: flex-start; display: inline-flex; align-items: center; gap: 4px; color: var(--nx-text-mute); text-decoration: none; font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; }
    .bar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
    .tabs { display: flex; gap: 6px; }
    .tabs button { height: 34px; padding: 0 13px; border-radius: var(--nx-r-2); border: 1px solid transparent; background: transparent; color: var(--nx-text-mute); font-family: var(--nx-font-display); font-weight: 500; font-size: 13px; cursor: pointer; }
    .tabs button.active { background: var(--nx-surface-1); border-color: var(--nx-line-strong); color: var(--nx-text); font-weight: 700; }
    .post-filter { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 6px 0 12px; border-radius: var(--nx-r-pill); background: var(--nx-surface-1); font-size: 12.5px; color: var(--nx-text-mute); }
    .post-filter strong { color: var(--nx-text); max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .post-filter button { width: 22px; height: 22px; border: none; border-radius: var(--nx-r-pill); background: transparent; color: var(--nx-text-dim); cursor: pointer; font-size: 10px; }
    .items { display: flex; flex-direction: column; gap: 10px; }
    .item { display: flex; flex-direction: column; gap: 10px; padding: 16px; border-radius: var(--nx-r-4); border: 1px solid var(--nx-line); background: var(--nx-surface-0); }
    .item.busy { opacity: 0.6; }
    .who { display: flex; align-items: center; gap: 10px; }
    .avatar { flex: none; width: 36px; height: 36px; border-radius: 50%; object-fit: cover; background: var(--nx-surface-2); }
    .avatar.initials { display: grid; place-items: center; font-family: var(--nx-font-display); font-weight: 700; font-size: 12px; color: var(--nx-orange-500); background: var(--nx-orange-tint); }
    .who-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .line { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 13.5px; }
    .when { font-size: 12px; color: var(--nx-text-dim); }
    .post-link { font-size: 12px; color: var(--nx-orange-400); text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .text { margin: 0; font-size: 14px; line-height: 1.55; color: var(--nx-text); white-space: pre-wrap; overflow-wrap: anywhere; }
    .reply { padding: 10px 12px; border-left: 3px solid var(--nx-orange-500); border-radius: 0 var(--nx-r-2) var(--nx-r-2) 0; background: var(--nx-surface-1); }
    .reply-by { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--nx-orange-500); }
    .reply p { margin: 4px 0 0; font-size: 13.5px; line-height: 1.5; white-space: pre-wrap; }
    .reply-form { display: flex; flex-direction: column; gap: 8px; }
    .bo-input.area { height: auto; min-height: 84px; padding: 10px 13px; resize: vertical; line-height: 1.45; font-family: var(--nx-font-ui); }
    .reply-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .hint { flex: 1 1 200px; font-size: 11.5px; color: var(--nx-text-dim); }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .skeleton { height: 120px; border-radius: var(--nx-r-4); background: var(--nx-surface-1); opacity: 0.6; }
    .retry, .more { align-self: flex-start; }
    .empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 40px 16px; border-radius: var(--nx-r-4); border: 1px solid var(--nx-line); color: var(--nx-text-dim); text-align: center; }
    .empty p { margin: 0; font-size: 13px; color: var(--nx-text); }
  `,
})
export class BlogCommentsComponent {
  private readonly repository = inject(BlogCommentsRepository);
  private readonly posts = inject(BlogPostsRepository);
  private readonly badges = inject(BlogBadgesService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly tabs = COMMENT_TABS;
  protected readonly replyMax = BLOG_COMMENT_REPLY_MAX;
  private readonly now = signal(new Date());

  private readonly query = this.route.snapshot.queryParamMap;
  protected readonly tab = signal<BlogCommentStatus>(
    BLOG_COMMENT_STATUSES.find((s) => s === this.query.get('aba')) ?? 'pending',
  );
  /** `?post=<id>`: só os comentários desse post (vem do "Resultado do post" no editor). */
  protected readonly postId = signal<string | null>(this.query.get('post'));
  protected readonly questions = signal(false);

  protected readonly state = signal<LoadState>('loading');
  protected readonly loadError = signal('');
  private readonly comments = signal<BlogComment[]>([]);
  private cursor: QueryDocumentSnapshot<DocumentData> | null = null;
  protected readonly hasMore = signal(false);
  protected readonly loadingMore = signal(false);
  private readonly titles = signal<Map<string, string>>(new Map());

  protected readonly busy = signal<ReadonlySet<string>>(new Set());
  protected readonly actionError = signal('');
  protected readonly replyingId = signal<string | null>(null);
  protected readonly replyText = signal('');
  protected readonly deleting = signal<BlogComment | null>(null);
  protected readonly deleteError = signal<string | null>(null);

  protected readonly pendingBadge = this.badges.pendingComments;
  protected readonly visible = computed(() => onlyQuestions(this.comments(), this.questions()));
  protected readonly replyProblem = computed(() => replyIssue(this.replyText()));
  protected readonly emptyText = computed(() => {
    const what = this.questions() ? 'dúvida' : 'comentário';
    const tab = this.tab();
    if (tab === 'pending') {
      return this.hasMore() ? `Nenhuma ${what} pendente nesta página.` : `Nenhum${this.questions() ? 'a' : ''} ${what} esperando moderação.`;
    }
    return tab === 'approved' ? `Nada aprovado ainda.` : `Nada recusado.`;
  });

  constructor() {
    void this.reload();
    void this.loadTitles();
    void this.badges.refresh();
  }

  async reload(): Promise<void> {
    this.state.set('loading');
    this.actionError.set('');
    this.replyingId.set(null);
    this.now.set(new Date());
    try {
      const page = await this.repository.page(this.tab(), null, this.postId());
      this.comments.set(page.comments);
      this.cursor = page.cursor;
      this.hasMore.set(page.hasMore);
      this.state.set('ok');
    } catch (error) {
      this.loadError.set(`Não foi possível carregar os comentários. ${errorText(error)}`);
      this.state.set('error');
    }
  }

  protected async loadMore(): Promise<void> {
    this.loadingMore.set(true);
    try {
      const page = await this.repository.page(this.tab(), this.cursor, this.postId());
      const seen = new Set(this.comments().map((c) => c.id));
      this.comments.update((list) => [...list, ...page.comments.filter((c) => !seen.has(c.id))]);
      this.cursor = page.cursor;
      this.hasMore.set(page.hasMore);
    } catch (error) {
      this.actionError.set(`Não foi possível carregar mais. ${errorText(error)}`);
    } finally {
      this.loadingMore.set(false);
    }
  }

  /** Título dos posts para o link de cada item (o blog tem poucas dezenas de posts). */
  private async loadTitles(): Promise<void> {
    try {
      this.titles.set(new Map((await this.posts.list()).map((p) => [p.id, p.title || 'Sem título'])));
    } catch {
      // Sem título, o link mostra "Post".
    }
  }

  protected titleOf(postId: string): string {
    return this.titles().get(postId) ?? 'Post';
  }

  protected setTab(tab: BlogCommentStatus): void {
    if (tab === this.tab()) {
      return;
    }
    this.tab.set(tab);
    this.syncUrl();
    void this.reload();
  }

  protected clearPost(): void {
    this.postId.set(null);
    this.syncUrl();
    void this.reload();
  }

  private syncUrl(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { aba: this.tab() === 'pending' ? null : this.tab(), post: this.postId() },
      replaceUrl: true,
    });
  }

  protected value(event: Event): string {
    return (event.target as HTMLTextAreaElement).value;
  }

  protected when(at: Date | null): string {
    return commentWhen(at, this.now());
  }

  protected initials(name: string): string {
    return initialsOf(name);
  }

  protected startReply(c: BlogComment): void {
    this.replyingId.set(c.id);
    this.replyText.set(c.reply?.text ?? '');
  }

  protected cancelReply(): void {
    this.replyingId.set(null);
  }

  protected sendReply(c: BlogComment): void {
    if (!this.replyProblem()) {
      void this.moderate(c, 'reply', this.replyText());
    }
  }

  protected act(c: BlogComment, action: 'approve' | 'reject'): void {
    void this.moderate(c, action);
  }

  protected askDelete(c: BlogComment): void {
    this.deleteError.set(null);
    this.deleting.set(c);
  }

  protected async confirmDelete(c: BlogComment): Promise<void> {
    const ok = await this.moderate(c, 'delete');
    if (ok) {
      this.deleting.set(null);
    }
  }

  /** Otimista: a lista e o selo mudam antes; erro desfaz e mostra a mensagem. */
  private async moderate(c: BlogComment, action: BlogCommentAction, reply?: string): Promise<boolean> {
    const before = this.comments();
    const byName = this.auth.displayName() ?? 'Equipe nexaGO';
    this.actionError.set('');
    this.deleteError.set(null);
    this.busy.update((s) => new Set(s).add(c.id));
    if (action !== 'delete') {
      this.comments.set(applyModeration(before, c.id, action, this.tab(), reply ? { text: reply, byName } : null, new Date()));
      this.replyingId.set(null);
    }
    const delta = pendingDelta(action, c.status);
    this.badges.adjust(delta);
    try {
      await this.repository.moderate({ postId: c.postId, commentId: c.id, action, ...(reply ? { reply } : {}) });
      if (action === 'delete') {
        this.comments.update((list) => list.filter((x) => x.id !== c.id));
      }
      return true;
    } catch (error) {
      this.comments.set(before);
      this.badges.adjust(-delta);
      if (action === 'reply') {
        // A resposta digitada continua no campo para tentar de novo.
        this.replyingId.set(c.id);
      }
      const message = errorText(error);
      if (action === 'delete') {
        this.deleteError.set(message);
      } else {
        this.actionError.set(message);
      }
      return false;
    } finally {
      this.busy.update((s) => {
        const next = new Set(s);
        next.delete(c.id);
        return next;
      });
    }
  }
}
