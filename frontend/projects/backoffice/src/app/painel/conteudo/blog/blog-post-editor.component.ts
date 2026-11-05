import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SPORT_CATALOG } from '@nexago/sports';
import { AuthService } from '../../../auth/auth.service';
import { callableErrorMessage } from '../../data/callable-error';
import { ConfirmDialogComponent } from '../../ui/confirm-dialog.component';
import { FieldComponent } from '../../ui/field.component';
import { IconComponent } from '../../ui/icon.component';
import { PageHeaderComponent } from '../../ui/page-header.component';
import { PanelCardComponent } from '../../ui/panel-card.component';
import { PanelShellComponent } from '../../ui/panel-shell.component';
import { ToggleComponent } from '../../ui/toggle.component';
import {
  draftFromPost,
  embedBlock,
  embedCount,
  emptyBlock,
  moveBlock,
  newBlogDraft,
  payloadFromDraft,
  payloadIssues,
  saveLabel,
  withSlug,
  withTag,
  withTitle,
  type BlockDraft,
  type BlogDraft,
} from './data/blog-form';
import { BLOG_COVER_SPEC } from './data/blog-image';
import {
  BLOG_AUTHOR_FIELD_MAX,
  BLOG_BLOCKS_MAX,
  BLOG_CATEGORIES,
  BLOG_CTA_DESTINATIONS,
  BLOG_CTA_LABEL_MAX,
  BLOG_EMBEDS_MAX,
  BLOG_SEO_DESCRIPTION_MAX,
  BLOG_SITE_HOST,
  BLOG_SLUG_MAX,
  BLOG_SUBTITLE_MAX,
  BLOG_TAGS_MAX,
  BLOG_TAG_MAX,
  BLOG_TITLE_MAX,
  dayMonthLabel,
  pushSentLabel,
  readMinutes,
  saoPauloParts,
  savedAgoLabel,
  type BlogBlockType,
  type BlogCategory,
  type BlogCtaDestination,
  type BlogPushResult,
  type BlogStatus,
} from './data/blog-post';
import { BlogPostsRepository } from './data/blog-posts.repository';
import { BlogStatusPillComponent } from './ui/blog-badges.component';
import { BLOCK_LABELS, BlogBlockEditorComponent } from './ui/blog-block-editor.component';
import { BlogEmbedMenuComponent, type BlogEmbedChoice } from './ui/blog-embed-menu.component';
import { BlogEmbedPickerComponent } from './ui/blog-embed-picker.component';
import { BlogPostResultComponent } from './ui/blog-post-result.component';
import { BlogPushSettingsComponent } from './ui/blog-push-settings.component';
import { BlogImagePickerComponent } from './ui/blog-image-picker.component';

type LoadState = 'loading' | 'ok' | 'missing' | 'error';
type Confirm = 'delete' | 'unpublish';
type EmbedKind = 'tournament' | 'product';

const PUBLISH_OPTIONS: ReadonlyArray<{ id: BlogStatus; label: string; hint: string }> = [
  { id: 'draft', label: 'Rascunho', hint: 'Só o time vê.' },
  { id: 'review', label: 'Em revisão', hint: 'Pronto para alguém revisar; ainda fora do ar.' },
  { id: 'scheduled', label: 'Agendar', hint: 'Sai sozinho na data e hora escolhidas.' },
  { id: 'published', label: 'Publicar agora', hint: 'Vai ao ar assim que salvar.' },
];

const ADD_BLOCKS: ReadonlyArray<BlogBlockType> = ['paragraph', 'heading', 'list', 'quote', 'image'];

/** `not-found` cru ("NOT FOUND") é callable que ainda não foi publicada, não post sumido. */
function errorText(error: unknown): string {
  const code = String((error as { code?: unknown })?.code ?? '');
  const message = String((error as { message?: unknown })?.message ?? '');
  if (code.includes('not-found')) {
    return message && message !== 'NOT FOUND' ? message : 'Função ainda não publicada no servidor.';
  }
  return callableErrorMessage(error);
}

function isConflict(error: unknown): boolean {
  return String((error as { code?: unknown })?.code ?? '').includes('failed-precondition');
}

/**
 * Conteúdo › Blog › editor. Edita um post num rascunho local e salva pela callable `saveBlogPost`
 * (conflito otimista pela `version`); excluir vai pela `deleteBlogPost`.
 */
@Component({
  selector: 'bo-blog-post-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
  imports: [
    RouterLink,
    PanelShellComponent,
    PageHeaderComponent,
    PanelCardComponent,
    FieldComponent,
    IconComponent,
    ToggleComponent,
    ConfirmDialogComponent,
    BlogStatusPillComponent,
    BlogBlockEditorComponent,
    BlogImagePickerComponent,
    BlogEmbedPickerComponent,
    BlogEmbedMenuComponent,
    BlogPushSettingsComponent,
    BlogPostResultComponent,
  ],
  template: `
    <bo-panel-shell>
      <bo-page-header [title]="isNew() ? 'Novo post' : 'Editar post'" subtitle="Conteúdo › Blog">
        @if (savedStatus(); as s) {
          <bo-blog-status-pill [status]="s" />
        }
        @if (savedAgo(); as ago) {
          <span class="saved-ago">{{ ago }}</span>
        }
        @if (dirty() && state() === 'ok') {
          <span class="unsaved">Alterações não salvas</span>
        }
        @if (state() === 'ok') {
          <div class="header-actions">
            @if (!isNew()) {
              <button type="button" class="bo-ghost-btn danger" [disabled]="busy()" (click)="ask('delete')">
                <bo-icon name="trash" [size]="13" />
                Excluir
              </button>
            }
            <button
              type="button"
              class="bo-mini-btn bo-mini-btn-primary"
              [disabled]="!canSave()"
              [attr.title]="issues().length ? issues()[0] : null"
              (click)="save()"
            >
              @if (saving()) {
                <span class="bo-spinner small" aria-hidden="true"></span>
              }
              {{ primaryLabel() }}
            </button>
          </div>
        }
      </bo-page-header>

      <div class="body">
        <a class="back" routerLink="/painel/conteudo/blog">
          <bo-icon name="chevron-left" [size]="13" />
          Posts
        </a>

        @if (state() === 'loading') {
          <div class="skeleton tall"></div>
        } @else if (state() === 'missing') {
          <div class="empty">
            <bo-icon name="file" [size]="20" />
            <p>Este post não existe mais.</p>
            <a class="bo-mini-btn" routerLink="/painel/conteudo/blog">Voltar aos posts</a>
          </div>
        } @else if (state() === 'error') {
          <div class="bo-alert" role="alert"><bo-icon name="alert" [size]="16" /><span>{{ loadError() }}</span></div>
          <button type="button" class="bo-mini-btn retry" (click)="load()">Tentar de novo</button>
        } @else {
          @let d = draft();
          <div class="grid">
            <div class="main">
              @if (notice(); as text) {
                <div class="bo-feedback" role="status" aria-live="polite">
                  <bo-icon name="check" [size]="15" />
                  <span>{{ text }}</span>
                </div>
              }
              @if (actionError(); as text) {
                <div class="bo-alert" role="alert">
                  <bo-icon name="alert" [size]="16" />
                  <span>{{ text }}</span>
                  @if (conflict()) {
                    <button type="button" class="bo-mini-btn alert-action" (click)="load()">Recarregar</button>
                  }
                </div>
              }

              <bo-panel-card pad="sm">
                <div class="canvas">
                  <bo-blog-image-picker
                    [url]="d.coverUrl"
                    [height]="230"
                    [spec]="coverSpec"
                    [disabled]="saving()"
                    alt="Capa do post"
                    pickLabel="Enviar capa"
                    replaceLabel="Trocar capa"
                    (urlChange)="patch({ coverUrl: $event })"
                    (uploading)="trackUpload($event)"
                  >
                    <span class="cover-empty">Sem capa · o app e o site usam a cor da categoria</span>
                  </bo-blog-image-picker>

                  <div class="titles">
                    <div class="counted">
                      <input
                        class="title-input"
                        placeholder="Título do post"
                        aria-label="Título"
                        [attr.maxlength]="limits.title"
                        [value]="d.title"
                        [disabled]="saving()"
                        (input)="setTitle(text($event))"
                      />
                      <span class="count" [class.near]="d.title.length >= limits.title * 0.9">{{ d.title.length }} de {{ limits.title }}</span>
                    </div>
                    <div class="counted">
                      <input
                        class="subtitle-input"
                        placeholder="Linha fina: uma frase que puxa a leitura"
                        aria-label="Subtítulo"
                        [attr.maxlength]="limits.subtitle"
                        [value]="d.subtitle"
                        [disabled]="saving()"
                        (input)="patch({ subtitle: text($event) })"
                      />
                      <span class="count" [class.near]="d.subtitle.length >= limits.subtitle * 0.9">{{ d.subtitle.length }} de {{ limits.subtitle }}</span>
                    </div>
                  </div>

                  <div class="blocks">
                    @for (b of d.body; track b.key; let i = $index) {
                      <bo-blog-block-editor
                        [block]="b"
                        [index]="i"
                        [total]="d.body.length"
                        [disabled]="saving()"
                        (changed)="updateBlock(i, $event)"
                        (move)="move(i, $event)"
                        (remove)="removeBlock(i)"
                        (uploading)="trackUpload($event)"
                        (swap)="swapEmbed(i)"
                      />
                    } @empty {
                      <p class="none">O corpo está vazio. Comece por um parágrafo.</p>
                    }
                  </div>

                  <div class="add-bar" role="toolbar" aria-label="Adicionar bloco">
                    <span class="add-label">Adicionar</span>
                    @for (type of addBlocks; track type) {
                      <button type="button" class="add-btn" [disabled]="saving() || d.body.length >= limits.blocks" (click)="addBlock(type)">
                        <bo-icon name="plus" [size]="12" />
                        {{ blockLabel(type) }}
                      </button>
                    }
                    <span class="add-sep" aria-hidden="true"></span>
                    <bo-blog-embed-menu [disabled]="saving() || d.body.length >= limits.blocks" [embedsFull]="embedsFull()" (chosen)="onEmbedChosen($event)" />
                    <span class="add-count">{{ d.body.length }} de {{ limits.blocks }} blocos</span>
                  </div>
                </div>
              </bo-panel-card>
            </div>

            <div class="side">
              <bo-panel-card pad="sm" title="Publicação">
                <div class="options" role="radiogroup" aria-label="Publicação">
                  @for (o of publishOptions; track o.id) {
                    <button
                      type="button"
                      role="radio"
                      class="option"
                      [class.on]="d.status === o.id"
                      [attr.aria-checked]="d.status === o.id"
                      [disabled]="saving()"
                      (click)="setStatus(o.id)"
                    >
                      <span class="radio" aria-hidden="true"></span>
                      <span class="o-text">
                        <span class="o-label">{{ o.label }}</span>
                        <span class="o-hint">{{ optionHint(o.id, o.hint) }}</span>
                      </span>
                    </button>
                  }
                </div>
                @if (d.status !== 'published') {
                  <div class="when">
                    <bo-field [label]="d.status === 'scheduled' ? 'Data' : 'Data planejada'" [hint]="d.status === 'scheduled' ? 'Horário de Brasília.' : 'Opcional · aparece na fila de próximas publicações.'">
                      <input type="date" class="bo-input mono" [value]="d.date" [disabled]="saving()" (input)="patch({ date: text($event) })" />
                    </bo-field>
                    <bo-field label="Hora">
                      <input type="time" class="bo-input mono" [value]="d.time" [disabled]="saving() || !d.date" (input)="patch({ time: text($event) })" />
                    </bo-field>
                  </div>
                }
                @if (issues().length > 0) {
                  <ul class="issues" aria-label="Falta para salvar">
                    @for (issue of issues(); track issue) {
                      <li>{{ issue }}</li>
                    }
                  </ul>
                }
              </bo-panel-card>

              @if (savedStatus() === 'published' && postId(); as id) {
                <bo-blog-post-result
                  [postId]="id"
                  [hasCta]="savedCounts().hasCta"
                  [helpfulCount]="savedCounts().helpful"
                  [readCount]="savedCounts().readers"
                />
              }

              <bo-panel-card pad="sm" title="Onde aparece">
                <div class="toggles">
                  <div class="toggle-row">
                    <span><strong>Blog no app</strong><span class="dim">Seção “Do blog” na Início e leitura no app.</span></span>
                    <bo-toggle ariaLabel="Blog no app" [checked]="d.app" [disabled]="saving()" (checkedChange)="patch({ app: $event })" />
                  </div>
                  <div class="toggle-row">
                    <span><strong>Site {{ siteHost }}/blog</strong><span class="dim">Página pública, indexada no Google.</span></span>
                    <bo-toggle [ariaLabel]="'Site ' + siteHost + '/blog'" [checked]="d.site" [disabled]="saving()" (checkedChange)="patch({ site: $event })" />
                  </div>
                  <div class="toggle-row">
                    <span><strong>Destaque no topo</strong><span class="dim">Card grande no topo do blog do app.</span></span>
                    <bo-toggle ariaLabel="Destaque no topo" [checked]="d.featured" [disabled]="saving()" (checkedChange)="patch({ featured: $event })" />
                  </div>
                  <bo-blog-push-settings
                    [enabled]="d.pushEnabled"
                    [city]="d.pushCity"
                    [sport]="d.pushSport"
                    [category]="d.category"
                    [disabled]="saving()"
                    [summary]="pushSummary()"
                    [live]="savedStatus() === 'published'"
                    (changed)="patch($event)"
                  />
                </div>
              </bo-panel-card>

              <bo-panel-card pad="sm" title="Organização">
                <div class="stack">
                  <div class="two">
                    <bo-field label="Categoria">
                      <select class="bo-select" [disabled]="saving()" (change)="patch({ category: categoryOf($event) })">
                        @for (c of categories; track c.id) {
                          <option [value]="c.id" [selected]="d.category === c.id">{{ c.label }}</option>
                        }
                      </select>
                    </bo-field>
                    <bo-field label="Esporte">
                      <select class="bo-select" [disabled]="saving()" (change)="patch({ sport: text($event) })">
                        <option value="all" [selected]="d.sport === 'all'">Todos</option>
                        @for (s of sports; track s.code) {
                          <option [value]="s.code" [selected]="d.sport === s.code">{{ s.label }}</option>
                        }
                      </select>
                    </bo-field>
                  </div>
                  <bo-field label="Tags" [hint]="d.tags.length + ' de ' + limits.tags + ' · Enter para adicionar'">
                    <div class="tags">
                      @for (tag of d.tags; track tag) {
                        <span class="tag">
                          {{ tag }}
                          <button type="button" [attr.aria-label]="'Remover tag ' + tag" [disabled]="saving()" (click)="removeTag(tag)">✕</button>
                        </span>
                      }
                      @if (d.tags.length < limits.tags) {
                        <input
                          class="tag-input"
                          placeholder="nova tag"
                          aria-label="Nova tag"
                          [attr.maxlength]="limits.tag"
                          [value]="tagInput()"
                          [disabled]="saving()"
                          (input)="tagInput.set(text($event))"
                          (keydown.enter)="addTag($event)"
                          (keydown.backspace)="onTagBackspace()"
                          (blur)="addTag()"
                        />
                      }
                    </div>
                  </bo-field>
                  <div class="two">
                    <bo-field label="Autor">
                      <input class="bo-input" placeholder="Nome" [attr.maxlength]="limits.author" [value]="d.authorName" [disabled]="saving()" (input)="patch({ authorName: text($event) })" />
                    </bo-field>
                    <bo-field label="Função">
                      <input class="bo-input" placeholder="Equipe nexaGO" [attr.maxlength]="limits.author" [value]="d.authorRole" [disabled]="saving()" (input)="patch({ authorRole: text($event) })" />
                    </bo-field>
                  </div>
                  <div class="read-time">
                    <span>Tempo de leitura</span>
                    <strong>{{ readTime() }} min · calculado</strong>
                  </div>
                </div>
              </bo-panel-card>

              <bo-panel-card pad="sm" title="Chamada no fim do post" kicker="Botão fixo na leitura">
                <bo-toggle card-actions ariaLabel="Chamada no fim do post" [checked]="d.ctaEnabled" [disabled]="saving()" (checkedChange)="patch({ ctaEnabled: $event })" />
                @if (d.ctaEnabled) {
                  <div class="stack">
                    <bo-field label="Texto" [hint]="d.ctaLabel.length + ' de ' + limits.cta">
                      <input class="bo-input" placeholder="Ex.: Ver torneios abertos" [attr.maxlength]="limits.cta" [value]="d.ctaLabel" [disabled]="saving()" (input)="patch({ ctaLabel: text($event) })" />
                    </bo-field>
                    <bo-field label="Leva para">
                      <select class="bo-select" [disabled]="saving()" (change)="patch({ ctaDestination: destinationOf($event) })">
                        @for (dest of destinations; track dest.id) {
                          <option [value]="dest.id" [selected]="d.ctaDestination === dest.id">{{ dest.label }}</option>
                        }
                      </select>
                    </bo-field>
                    @if (d.ctaDestination === 'url') {
                      <bo-field label="Endereço" hint="https://… — abre fora do app, no navegador.">
                        <input class="bo-input mono" placeholder="https://" [value]="d.ctaUrl" [disabled]="saving()" (input)="patch({ ctaUrl: text($event) })" />
                      </bo-field>
                    }
                  </div>
                } @else {
                  <p class="dim">Sem chamada: o post termina no texto.</p>
                }
              </bo-panel-card>

              <bo-panel-card pad="sm" title="Google e compartilhamento">
                <div class="stack">
                  <bo-field label="Endereço" [hint]="d.slugTouched ? 'Editado à mão.' : 'Gerado do título até você editar.'">
                    <div class="slug">
                      <span class="slug-prefix">/blog/</span>
                      <input class="slug-input" aria-label="Endereço do post" [attr.maxlength]="limits.slug" [value]="d.slug" [disabled]="saving()" (input)="setSlug($event)" />
                    </div>
                  </bo-field>
                  @if (slugLocked()) {
                    <p class="warn-line">Este post já tem link no ar: trocar o endereço quebra quem compartilhou o antigo.</p>
                  }
                  <bo-field label="Descrição" [hint]="'Descrição: ' + d.seoDescription.length + ' de ' + limits.seo + ' caracteres' + (d.seoDescription ? '' : ' · vazio usa o subtítulo')">
                    <textarea class="bo-input area" rows="3" [attr.maxlength]="limits.seo" [value]="d.seoDescription" [disabled]="saving()" (input)="patch({ seoDescription: text($event) })"></textarea>
                  </bo-field>
                  <div class="google" aria-label="Prévia no Google">
                    <span class="g-url">{{ siteHost }} › blog › {{ payload().slug || '…' }}</span>
                    <span class="g-title">{{ d.title || 'Título do post' }}</span>
                    <span class="g-desc">{{ googleDescription() }}</span>
                  </div>
                </div>
              </bo-panel-card>
            </div>
          </div>
        }
      </div>

      @if (picker(); as pk) {
        <bo-blog-embed-picker [kind]="pk.kind" [current]="pk.current" (picked)="onPicked($event)" (dismissed)="picker.set(null)" />
      }

      @if (confirming(); as kind) {
        <bo-confirm-dialog
          [open]="true"
          [title]="kind === 'delete' ? 'Excluir post?' : 'Tirar o post do ar?'"
          [description]="confirmText(kind)"
          [confirmLabel]="kind === 'delete' ? 'Excluir' : 'Tirar do ar e salvar'"
          tone="danger"
          [busy]="saving()"
          [error]="confirmError()"
          (confirmed)="confirm(kind)"
          (dismissed)="closeConfirm()"
        />
      }

      <bo-confirm-dialog
        [open]="leaveOpen()"
        title="Sair sem salvar?"
        description="As alterações neste post serão descartadas."
        confirmLabel="Sair sem salvar"
        tone="danger"
        (confirmed)="resolveLeave(true)"
        (dismissed)="resolveLeave(false)"
      />
    </bo-panel-shell>
  `,
  styles: `
    .saved-ago, .unsaved { font-size: 12px; color: var(--nx-text-dim); white-space: nowrap; }
    .unsaved { color: var(--nx-pending); }
    .header-actions { display: flex; align-items: center; gap: 10px; }
    .bo-spinner.small { width: 13px; height: 13px; border-width: 2px; border-color: rgba(10, 10, 10, 0.3); border-top-color: currentColor; }

    .body { padding: 16px 32px 40px; display: flex; flex-direction: column; gap: 14px; min-width: 0; }
    @media (max-width: 760px) { .body { padding: 16px; } }
    .back { align-self: flex-start; display: inline-flex; align-items: center; gap: 4px; color: var(--nx-text-mute); text-decoration: none; font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; }
    .back:hover { color: var(--nx-text); }
    .grid { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 18px; align-items: start; }
    @media (max-width: 1180px) { .grid { grid-template-columns: minmax(0, 1fr); } }
    .main, .side { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .skeleton.tall { height: 420px; border-radius: var(--nx-r-4); background: var(--nx-surface-1); opacity: 0.6; }
    .retry { align-self: flex-start; }
    .alert-action { margin-left: auto; flex: none; }
    .empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 48px 16px; border-radius: var(--nx-r-4); border: 1px solid var(--nx-line); background: var(--nx-surface-0); color: var(--nx-text-dim); text-align: center; }
    .empty p { margin: 0; font-size: 13px; color: var(--nx-text); }
    .empty a { text-decoration: none; }

    .canvas { display: flex; flex-direction: column; gap: 14px; }
    .cover-empty { font-size: 12.5px; color: var(--nx-text-mute); }
    .titles { display: flex; flex-direction: column; gap: 4px; }
    .counted { position: relative; }
    .count { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); font-family: var(--nx-font-mono); font-size: 10px; color: var(--nx-text-dim); pointer-events: none; opacity: 0; transition: opacity 140ms; }
    .counted:focus-within .count, .count.near { opacity: 1; }
    .count.near { color: var(--nx-pending); }
    .title-input, .subtitle-input { width: 100%; box-sizing: border-box; padding: 4px 90px 4px 6px; border: 1px solid transparent; border-radius: var(--nx-r-2); background: transparent; color: var(--nx-text); outline: none; }
    .title-input:hover:not(:disabled), .subtitle-input:hover:not(:disabled) { border-color: var(--nx-line); }
    .title-input:focus, .subtitle-input:focus { border-color: rgba(255, 106, 26, 0.5); background: var(--nx-surface-1); }
    .title-input::placeholder, .subtitle-input::placeholder { color: var(--nx-text-dim); }
    .title-input { font-family: var(--nx-font-display); font-weight: 800; font-size: 30px; letter-spacing: -0.02em; line-height: 1.2; }
    .subtitle-input { font-family: var(--nx-font-ui); font-size: 16px; color: var(--nx-text-mute); }
    .blocks { display: flex; flex-direction: column; gap: 2px; }
    .none { margin: 0; padding: 18px 6px; font-size: 13px; color: var(--nx-text-dim); }
    .add-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; padding: 6px; border-radius: var(--nx-r-3); background: var(--nx-surface-1); border: 1px solid var(--nx-line); }
    .add-label { padding: 0 8px; font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .add-btn { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 11px; border-radius: 8px; border: none; background: transparent; color: var(--nx-text-mute); font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; cursor: pointer; }
    .add-btn:hover:not(:disabled) { background: var(--nx-surface-2); color: var(--nx-text); }
    .add-btn:disabled { opacity: 0.4; cursor: default; }
    .add-sep { width: 1px; height: 20px; margin: 0 4px; background: var(--nx-line-strong); }
    .add-count { margin-left: auto; padding: 0 8px; font-family: var(--nx-font-mono); font-size: 10.5px; color: var(--nx-text-dim); }

    .options { display: flex; flex-direction: column; gap: 6px; }
    .option { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border-radius: var(--nx-r-2); border: 1px solid var(--nx-line); background: transparent; color: inherit; text-align: left; cursor: pointer; }
    .option:hover:not(:disabled) { background: var(--nx-surface-1); }
    .option.on { border-color: rgba(255, 106, 26, 0.55); background: rgba(255, 106, 26, 0.07); }
    .option:focus-visible { outline: 2px solid var(--nx-orange-500); outline-offset: 2px; }
    .radio { flex: none; width: 14px; height: 14px; margin-top: 2px; border-radius: var(--nx-r-pill); border: 2px solid var(--nx-line-strong); box-sizing: border-box; }
    .option.on .radio { border: 4px solid var(--nx-orange-500); }
    .o-text { display: flex; flex-direction: column; gap: 2px; }
    .o-label { font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; color: var(--nx-text); }
    .o-hint { font-size: 11.5px; color: var(--nx-text-dim); }
    .when { display: grid; grid-template-columns: 1.3fr 1fr; gap: 10px; margin-top: 14px; }
    .mono { font-family: var(--nx-font-mono); letter-spacing: 0.02em; }
    .issues { margin: 14px 0 0; padding: 10px 12px 10px 28px; border-radius: var(--nx-r-2); background: rgba(244, 197, 67, 0.07); border: 1px solid rgba(244, 197, 67, 0.25); font-size: 12px; line-height: 1.5; color: var(--nx-pending); }

    .toggles { display: flex; flex-direction: column; gap: 12px; }
    .toggle-row { display: flex; align-items: center; gap: 12px; }
    .toggle-row > span { flex: 1; display: flex; flex-direction: column; gap: 2px; }
    .toggle-row strong { font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; color: var(--nx-text); }
    .dim { margin: 0; font-size: 11.5px; color: var(--nx-text-dim); }
    .stack { display: flex; flex-direction: column; gap: 14px; }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    @media (max-width: 480px) { .two, .when { grid-template-columns: 1fr; } }

    .tags { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-height: 42px; padding: 6px 8px; box-sizing: border-box; border-radius: var(--nx-r-2); background: var(--nx-surface-1); border: 1px solid var(--nx-line); }
    .tags:focus-within { border-color: rgba(255, 106, 26, 0.5); }
    .tag { display: inline-flex; align-items: center; gap: 4px; height: 26px; padding: 0 4px 0 10px; border-radius: var(--nx-r-pill); background: var(--nx-surface-2); font-size: 12px; color: var(--nx-text); }
    .tag button { width: 18px; height: 18px; border: none; border-radius: var(--nx-r-pill); background: transparent; color: var(--nx-text-dim); font-size: 9px; cursor: pointer; }
    .tag button:hover { color: var(--nx-text); }
    .tag-input { flex: 1; min-width: 90px; border: none; outline: none; background: transparent; color: var(--nx-text); font-family: var(--nx-font-ui); font-size: 13px; }
    .tag-input::placeholder { color: var(--nx-text-dim); }
    .read-time { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 12px; border-radius: var(--nx-r-2); background: var(--nx-surface-1); font-size: 12.5px; color: var(--nx-text-mute); }
    .read-time strong { font-family: var(--nx-font-mono); font-size: 12px; font-weight: 600; color: var(--nx-text); }

    .slug { display: flex; align-items: center; height: 42px; padding: 0 13px; box-sizing: border-box; border-radius: var(--nx-r-2); background: var(--nx-surface-1); border: 1px solid var(--nx-line); font-family: var(--nx-font-mono); font-size: 13px; }
    .slug:focus-within { border-color: rgba(255, 106, 26, 0.5); }
    .slug-prefix { flex: none; color: var(--nx-text-dim); }
    .slug-input { flex: 1; min-width: 0; border: none; outline: none; background: transparent; color: var(--nx-text); font: inherit; }
    .warn-line { margin: -6px 0 0; font-size: 11.5px; line-height: 1.4; color: var(--nx-pending); }
    .bo-input.area { height: auto; min-height: 76px; padding: 10px 13px; resize: vertical; line-height: 1.45; font-family: var(--nx-font-ui); }
    .google { display: flex; flex-direction: column; gap: 3px; padding: 12px; border-radius: var(--nx-r-3); background: #f4f4f5; color: #121214; font-family: Arial, sans-serif; }
    .g-url { font-size: 12px; color: #3a5a3a; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .g-title { font-size: 16px; color: #1a0dab; }
    .g-desc { font-size: 12.5px; line-height: 1.4; color: #4d5156; }
  `,
})
export class BlogPostEditorComponent {
  private readonly repository = inject(BlogPostsRepository);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  protected readonly coverSpec = BLOG_COVER_SPEC;
  protected readonly siteHost = BLOG_SITE_HOST;
  protected readonly categories = BLOG_CATEGORIES;
  protected readonly destinations = BLOG_CTA_DESTINATIONS;
  protected readonly sports = SPORT_CATALOG;
  protected readonly publishOptions = PUBLISH_OPTIONS;
  protected readonly addBlocks = ADD_BLOCKS;
  protected readonly limits = {
    title: BLOG_TITLE_MAX,
    subtitle: BLOG_SUBTITLE_MAX,
    seo: BLOG_SEO_DESCRIPTION_MAX,
    slug: BLOG_SLUG_MAX,
    tags: BLOG_TAGS_MAX,
    tag: BLOG_TAG_MAX,
    author: BLOG_AUTHOR_FIELD_MAX,
    cta: BLOG_CTA_LABEL_MAX,
    blocks: BLOG_BLOCKS_MAX,
    embeds: BLOG_EMBEDS_MAX,
  };

  /** `null` = post novo (rota `novo`). */
  protected readonly postId = signal<string | null>(this.route.snapshot.paramMap.get('id'));
  protected readonly isNew = computed(() => this.postId() === null);

  protected readonly state = signal<LoadState>('loading');
  protected readonly loadError = signal('');
  protected readonly draft = signal<BlogDraft>(newBlogDraft(this.auth.displayName() ?? ''));
  /** O `post` como está gravado (ou o do rascunho em branco, no post novo): base do "não salvo". */
  private readonly savedJson = signal('');
  protected readonly savedStatus = signal<BlogStatus | null>(null);
  private readonly savedPublishAt = signal<Date | null>(null);
  private readonly savedAt = signal<Date | null>(null);
  private readonly savedPushSentAt = signal<Date | null>(null);
  private readonly savedPushResult = signal<BlogPushResult | null>(null);
  /** Do doc gravado, para o "Resultado do post". */
  protected readonly savedCounts = signal({ hasCta: false, helpful: 0, readers: 0 });

  /** Seletor de torneio/produto aberto: `index` `null` = bloco novo no fim; número = trocar aquele. */
  protected readonly picker = signal<{ kind: EmbedKind; index: number | null; current: string | null } | null>(null);
  private readonly version = signal(0);

  protected readonly saving = signal(false);
  private readonly uploads = signal(0);
  protected readonly notice = signal('');
  protected readonly actionError = signal('');
  protected readonly conflict = signal(false);
  protected readonly tagInput = signal('');
  protected readonly confirming = signal<Confirm | null>(null);
  protected readonly confirmError = signal<string | null>(null);
  protected readonly leaveOpen = signal(false);
  private leaveResolver: ((ok: boolean) => void) | null = null;
  /** Relógio de 30 s: "Salvo há X" e o agendamento que passou da hora. */
  private readonly now = signal(new Date());

  protected readonly payload = computed(() => payloadFromDraft(this.draft()));
  protected readonly issues = computed(() => payloadIssues(this.payload(), this.now()));
  protected readonly dirty = computed(() => JSON.stringify(this.payload()) !== this.savedJson());
  protected readonly busy = computed(() => this.saving() || this.uploads() > 0);
  protected readonly canSave = computed(
    () => this.state() === 'ok' && !this.busy() && this.issues().length === 0 && (this.isNew() || this.dirty()),
  );
  protected readonly primaryLabel = computed(() => saveLabel(this.draft().status, this.savedStatus()));
  protected readonly embedsFull = computed(() => embedCount(this.draft().body) >= BLOG_EMBEDS_MAX);
  protected readonly pushSummary = computed(() =>
    pushSentLabel({ pushSentAt: this.savedPushSentAt(), pushResult: this.savedPushResult() }, this.now()),
  );
  protected readonly readTime = computed(() => readMinutes(this.payload().title, this.payload().body));
  protected readonly savedAgo = computed(() => {
    const at = this.savedAt();
    return at ? savedAgoLabel(at, this.now()) : null;
  });
  protected readonly googleDescription = computed(() => {
    const d = this.draft();
    return d.seoDescription.trim() || d.subtitle.trim() || 'A descrição aparece aqui. Vazia, o Google usa o subtítulo.';
  });
  /** Já esteve no ar (publicado ou agendado) e o endereço foi mudado. */
  protected readonly slugLocked = computed(() => {
    const status = this.savedStatus();
    if (status !== 'published' && status !== 'scheduled') {
      return false;
    }
    return this.payload().slug !== (JSON.parse(this.savedJson() || '{}') as { slug?: string }).slug;
  });

  private noticeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    const clock = setInterval(() => this.now.set(new Date()), 30_000);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(clock);
      if (this.noticeTimer !== null) {
        clearTimeout(this.noticeTimer);
      }
    });
    void this.load();
  }

  async load(): Promise<void> {
    this.actionError.set('');
    this.conflict.set(false);
    const id = this.postId();
    if (id === null) {
      this.savedJson.set(JSON.stringify(this.payload()));
      this.state.set('ok');
      return;
    }
    this.state.set('loading');
    try {
      const post = await this.repository.get(id);
      if (!post) {
        this.state.set('missing');
        return;
      }
      const draft = draftFromPost(post);
      this.draft.set(draft);
      this.savedJson.set(JSON.stringify(payloadFromDraft(draft)));
      this.savedStatus.set(post.status);
      this.savedPublishAt.set(post.publishAt);
      this.savedAt.set(post.updatedAt);
      this.savedPushSentAt.set(post.pushSentAt);
      this.savedPushResult.set(post.pushResult);
      this.savedCounts.set({ hasCta: post.cta !== null, helpful: post.helpfulCount, readers: post.readCount });
      this.version.set(post.version);
      this.state.set('ok');
    } catch (error) {
      this.loadError.set(`Não foi possível carregar o post. ${callableErrorMessage(error)}`);
      this.state.set('error');
    }
  }

  // ---------- edição ----------

  protected text(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
  }

  protected patch(change: Partial<BlogDraft>): void {
    this.draft.update((d) => ({ ...d, ...change }));
  }

  protected setTitle(title: string): void {
    this.draft.update((d) => withTitle(d, title));
  }

  protected setSlug(event: Event): void {
    const el = event.target as HTMLInputElement;
    this.draft.update((d) => withSlug(d, el.value));
    // O campo mostra o slug já limpo (acento e espaço viram hífen enquanto digita).
    if (el.value !== this.draft().slug) {
      el.value = this.draft().slug;
    }
  }

  protected setStatus(status: BlogStatus): void {
    this.draft.update((d) => ({ ...d, status }));
  }

  protected categoryOf(event: Event): BlogCategory {
    return this.text(event) as BlogCategory;
  }

  protected destinationOf(event: Event): BlogCtaDestination {
    return this.text(event) as BlogCtaDestination;
  }

  protected optionHint(id: BlogStatus, fallback: string): string {
    const saved = this.savedStatus();
    const at = this.savedPublishAt();
    if (id === 'published' && saved === 'published' && at) {
      return `No ar desde ${dayMonthLabel(at, this.now())} · ${saoPauloParts(at).time}.`;
    }
    return fallback;
  }

  protected blockLabel(type: BlogBlockType): string {
    return BLOCK_LABELS[type];
  }

  protected addBlock(type: BlogBlockType): void {
    this.draft.update((d) => (d.body.length >= BLOG_BLOCKS_MAX ? d : { ...d, body: [...d.body, emptyBlock(type)] }));
  }

  protected updateBlock(index: number, block: BlockDraft): void {
    this.draft.update((d) => ({ ...d, body: d.body.map((b, i) => (i === index ? block : b)) }));
  }

  protected move(index: number, delta: -1 | 1): void {
    this.draft.update((d) => ({ ...d, body: moveBlock(d.body, index, delta) }));
  }

  protected removeBlock(index: number): void {
    this.draft.update((d) => ({ ...d, body: d.body.filter((_, i) => i !== index) }));
  }

  protected onEmbedChosen(choice: BlogEmbedChoice): void {
    if (choice === 'video') {
      this.addBlock('video');
    } else {
      this.openPicker(choice, null);
    }
  }

  protected openPicker(kind: EmbedKind, index: number | null): void {
    const block = index === null ? null : this.draft().body[index];
    const current = block?.type === 'tournament' ? block.tournamentId : block?.type === 'product' ? block.productId : null;
    this.picker.set({ kind, index, current });
  }

  protected swapEmbed(index: number): void {
    const block = this.draft().body[index];
    if (block?.type === 'tournament' || block?.type === 'product') {
      this.openPicker(block.type, index);
    }
  }

  protected onPicked(id: string): void {
    const pk = this.picker();
    this.picker.set(null);
    if (!pk) {
      return;
    }
    const block = embedBlock(pk.kind, id);
    this.draft.update((d) => {
      if (pk.index === null) {
        return d.body.length >= BLOG_BLOCKS_MAX ? d : { ...d, body: [...d.body, block] };
      }
      return { ...d, body: d.body.map((b, i) => (i === pk.index ? { ...block, key: b.key } : b)) };
    });
  }


  protected trackUpload(active: boolean): void {
    this.uploads.update((n) => Math.max(0, n + (active ? 1 : -1)));
  }

  protected addTag(event?: Event): void {
    event?.preventDefault();
    const raw = this.tagInput();
    if (!raw.trim()) {
      return;
    }
    this.draft.update((d) => withTag(d, raw));
    this.tagInput.set('');
  }

  protected onTagBackspace(): void {
    if (!this.tagInput()) {
      this.draft.update((d) => ({ ...d, tags: d.tags.slice(0, -1) }));
    }
  }

  protected removeTag(tag: string): void {
    this.draft.update((d) => ({ ...d, tags: d.tags.filter((t) => t !== tag) }));
  }

  // ---------- salvar / excluir ----------

  protected save(): void {
    if (!this.canSave()) {
      return;
    }
    if (this.savedStatus() === 'published' && this.draft().status !== 'published') {
      this.ask('unpublish');
      return;
    }
    void this.persist();
  }

  protected ask(kind: Confirm): void {
    this.confirmError.set(null);
    this.confirming.set(kind);
  }

  protected closeConfirm(): void {
    if (!this.saving()) {
      this.confirming.set(null);
    }
  }

  protected confirmText(kind: Confirm): string {
    const d = this.draft();
    if (kind === 'unpublish') {
      return 'O post sai do app e do site até ser publicado de novo. O endereço continua reservado para ele.';
    }
    return `“${d.title.trim() || 'Sem título'}” sai do app e do site e o endereço /blog/${this.payload().slug} fica livre. Não dá para desfazer.`;
  }

  protected confirm(kind: Confirm): void {
    if (kind === 'unpublish') {
      void this.persist();
    } else {
      void this.remove();
    }
  }

  private async persist(): Promise<void> {
    const post = this.payload();
    this.saving.set(true);
    this.actionError.set('');
    this.conflict.set(false);
    this.confirmError.set(null);
    try {
      const result = await this.repository.save({ id: this.postId(), version: this.version(), post });
      const wasNew = this.isNew();
      const pushGoesOut = result.status === 'published' && this.savedStatus() !== 'published' && post.push.enabled && !this.pushSummary();
      this.version.set(result.version);
      this.savedStatus.set(result.status);
      this.savedPublishAt.set(result.publishAt ? new Date(result.publishAt) : null);
      this.savedAt.set(new Date());
      this.now.set(new Date());
      if (result.slug !== this.draft().slug) {
        this.draft.update((d) => ({ ...d, slug: result.slug }));
      }
      this.savedJson.set(JSON.stringify({ ...post, slug: result.slug }));
      this.savedCounts.update((c) => ({ ...c, hasCta: post.cta !== null }));
      this.postId.set(result.id);
      this.confirming.set(null);
      this.showNotice(pushGoesOut ? 'Post publicado. O push sai em instantes.' : this.savedMessage(result.status));
      if (wasNew) {
        await this.router.navigate(['/painel/conteudo/blog', result.id], { replaceUrl: true });
      }
    } catch (error) {
      const message = errorText(error);
      if (this.confirming()) {
        this.confirmError.set(message);
      } else {
        this.actionError.set(message);
      }
      this.conflict.set(isConflict(error));
    } finally {
      this.saving.set(false);
    }
  }

  private async remove(): Promise<void> {
    const id = this.postId();
    if (id === null) {
      return;
    }
    this.saving.set(true);
    this.confirmError.set(null);
    try {
      await this.repository.delete(id);
      // Já não há o que salvar: libera a saída sem o "Sair sem salvar?".
      this.savedJson.set(JSON.stringify(this.payload()));
      this.confirming.set(null);
      await this.router.navigate(['/painel/conteudo/blog']);
    } catch (error) {
      this.confirmError.set(errorText(error));
    } finally {
      this.saving.set(false);
    }
  }

  private savedMessage(status: BlogStatus): string {
    switch (status) {
      case 'published':
        return 'Post publicado.';
      case 'scheduled':
        return 'Post agendado.';
      case 'review':
        return 'Post enviado para revisão.';
      default:
        return 'Rascunho salvo.';
    }
  }

  private showNotice(text: string): void {
    this.notice.set(text);
    if (this.noticeTimer !== null) {
      clearTimeout(this.noticeTimer);
    }
    this.noticeTimer = setTimeout(() => this.notice.set(''), 3000);
  }

  // ---------- sair com alteração ----------

  canLeave(): boolean | Promise<boolean> {
    if (!this.dirty() || this.state() !== 'ok') {
      return true;
    }
    this.leaveOpen.set(true);
    return new Promise<boolean>((resolve) => (this.leaveResolver = resolve));
  }

  protected resolveLeave(ok: boolean): void {
    this.leaveOpen.set(false);
    this.leaveResolver?.(ok);
    this.leaveResolver = null;
  }

  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.dirty() && this.state() === 'ok') {
      event.preventDefault();
    }
  }
}
