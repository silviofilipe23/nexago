import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { callableErrorMessage } from '../../data/callable-error';
import { ConfirmDialogComponent } from '../../ui/confirm-dialog.component';
import { FieldComponent } from '../../ui/field.component';
import { IconComponent } from '../../ui/icon.component';
import { PageHeaderComponent } from '../../ui/page-header.component';
import { PanelCardComponent } from '../../ui/panel-card.component';
import { PanelShellComponent } from '../../ui/panel-shell.component';
import { PillComponent } from '../../ui/pill.component';
import {
  CATEGORY_TITLE_MAX,
  MAX_CATEGORIES,
  MAX_TOPICS,
  categoriesFromDrafts,
  categoryIssue,
  cloneDrafts,
  draftsFromCategories,
  emptyTopic,
  newCategoryDraft,
  saveIssues,
  topicCountText,
  topicIssue,
  withIds,
  type CategoryDraft,
  type TopicDraft,
} from './data/app-guide';
import { AppGuideRepository, type AppGuideState } from './data/app-guide.repository';
import { AppGuidePreviewComponent, type AppGuidePreviewMode } from './ui/app-guide-preview.component';
import { AppGuideTopicEditorComponent } from './ui/app-guide-topic-editor.component';

type Confirm = 'delete-category' | 'discard';

/** `not-found` cru ("NOT FOUND") é callable que ainda não foi publicada, não registro sumido. */
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

function publishedCount(categories: readonly CategoryDraft[]): number {
  return categories.reduce((n, c) => n + c.topics.filter((t) => t.published).length, 0);
}

/**
 * App do atleta › Central de ajuda: os guias "como usar" do app, por categoria. A Central inteira é
 * um rascunho local (categorias, ordem e guias) salvo de uma vez pela callable `saveAppGuide`, que
 * grava o espelho do app só com os guias publicados.
 */
@Component({
  selector: 'bo-panel-app-guide',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
  imports: [
    PanelShellComponent,
    PageHeaderComponent,
    PanelCardComponent,
    FieldComponent,
    IconComponent,
    PillComponent,
    ConfirmDialogComponent,
    AppGuideTopicEditorComponent,
    AppGuidePreviewComponent,
  ],
  template: `
    <bo-panel-shell>
      <bo-page-header title="App do atleta" [subtitle]="subtitle()">
        <button
          type="button"
          class="bo-mini-btn bo-mini-btn-primary"
          [disabled]="loading() || saving() || !selected() || selectedFull()"
          [attr.title]="selectedFull() ? 'Limite de ' + maxTopics + ' guias por categoria' : null"
          (click)="addTopic()"
        >
          <bo-icon name="plus" [size]="13" />
          Novo guia
        </button>
      </bo-page-header>

      <div class="body">
        <nav class="cats" aria-label="Categorias">
          <span class="col-label">Categorias</span>
          @if (loading()) {
            @for (slot of [0, 1, 2]; track slot) {
              <div class="skeleton"></div>
            }
          }
          @for (c of categoryItems(); track c.key) {
            <button type="button" class="cat" [class.on]="c.key === selectedKey()" [attr.aria-current]="c.key === selectedKey()" (click)="selectCategory(c.key)">
              <span class="c-line">
                <span class="c-title" [class.untitled]="!c.named">{{ c.title }}</span>
                @if (c.bad) {
                  <bo-icon class="c-bad" name="alert" [size]="13" />
                }
              </span>
              <span class="c-meta">{{ c.meta }}</span>
            </button>
          }
          @if (!loading() && !loadError()) {
            <div class="cat-add">
              <input
                class="bo-input dashed"
                placeholder="Nova categoria"
                aria-label="Nova categoria"
                [attr.maxlength]="categoryTitleMax"
                [value]="newCategoryTitle()"
                [disabled]="saving() || full()"
                (input)="newCategoryTitle.set(text($event))"
                (keydown.enter)="addCategory()"
              />
              <button
                type="button"
                class="bo-mini-btn"
                [disabled]="saving() || full() || !newCategoryTitle().trim()"
                [attr.title]="full() ? 'Limite de ' + maxCategories + ' categorias' : null"
                (click)="addCategory()"
              >
                Criar
              </button>
            </div>
          }
        </nav>

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
                <button type="button" class="bo-mini-btn alert-action" (click)="reload()">Recarregar</button>
              }
            </div>
          }
          @if (imported()) {
            <div class="info" role="note">
              <bo-icon name="phone" [size]="15" />
              <span>Estes guias vieram do que já está no app (gravado pelo script de seed). No primeiro save, o backoffice passa a ser a fonte.</span>
            </div>
          }

          @if (loading()) {
            <div class="skeleton tall"></div>
          } @else if (loadError(); as err) {
            <div class="bo-alert"><bo-icon name="alert" [size]="16" /><span>{{ err }}</span></div>
            <button type="button" class="bo-mini-btn retry" (click)="reload()">Tentar de novo</button>
          } @else if (selected(); as c) {
            <bo-panel-card pad="sm" title="Categoria" [kicker]="categoryKicker()">
              <bo-field label="Nome" hint="Aparece em caixa alta acima dos guias e como selo dentro de cada guia.">
                <span class="counted">
                  <input
                    class="bo-input"
                    placeholder="Ex.: Reservar"
                    [class.invalid]="!!categoryProblem()"
                    [value]="c.title"
                    [disabled]="saving()"
                    (input)="patchCategory({ title: text($event) })"
                  />
                  <span class="count" [class.over]="c.title.trim().length > categoryTitleMax">{{ c.title.trim().length }}/{{ categoryTitleMax }}</span>
                </span>
              </bo-field>
              @if (categoryProblem(); as problem) {
                <p class="cat-issue" role="alert"><bo-icon name="alert" [size]="13" />{{ problem }}</p>
              }
              <div class="cat-actions">
                <button type="button" class="bo-mini-btn" [disabled]="saving() || selectedIndex() === 0" (click)="moveCategory(-1)">
                  <bo-icon class="up" name="chevron-down" [size]="13" />
                  Subir
                </button>
                <button type="button" class="bo-mini-btn" [disabled]="saving() || selectedIndex() === draft().length - 1" (click)="moveCategory(1)">
                  <bo-icon name="chevron-down" [size]="13" />
                  Descer
                </button>
                <button type="button" class="bo-mini-btn quiet" [disabled]="saving()" (click)="askDeleteCategory()">
                  <bo-icon name="trash" [size]="13" />
                  Excluir categoria
                </button>
              </div>
            </bo-panel-card>

            <bo-panel-card pad="sm" title="Guias" [kicker]="topicsKicker()">
              <button card-actions type="button" class="bo-mini-btn" [disabled]="saving() || selectedFull()" (click)="addTopic()">
                <bo-icon name="plus" [size]="13" />
                Adicionar
              </button>
              <div class="feats">
                @for (t of c.topics; track t.key; let i = $index) {
                  <div class="feat" [class.open]="openTopicKey() === t.key">
                    <div class="feat-row">
                      <button type="button" class="feat-main" [attr.aria-expanded]="openTopicKey() === t.key" (click)="toggleTopic(t.key)">
                        <span class="pos">{{ i + 1 }}</span>
                        <span class="feat-text">
                          <span class="feat-line">
                            <span class="feat-title" [class.untitled]="!t.title.trim()">{{ t.title.trim() || 'Sem título' }}</span>
                            <bo-pill [tone]="t.published ? 'green' : 'dim'">{{ t.published ? 'Publicado' : 'Rascunho' }}</bo-pill>
                          </span>
                          <span class="feat-sub" [class.bad]="issueOf(t)">{{ issueOf(t) ?? (t.summary.trim() || 'Sem resumo') }}</span>
                        </span>
                        <bo-icon class="chev" name="chevron-down" [size]="14" />
                      </button>
                      <button type="button" class="icon-btn" [attr.aria-label]="'Subir ' + (t.title || 'guia')" [disabled]="saving() || i === 0" (click)="moveTopic(i, -1)">
                        <bo-icon class="up" name="chevron-down" [size]="13" />
                      </button>
                      <button type="button" class="icon-btn" [attr.aria-label]="'Descer ' + (t.title || 'guia')" [disabled]="saving() || i === c.topics.length - 1" (click)="moveTopic(i, 1)">
                        <bo-icon name="chevron-down" [size]="13" />
                      </button>
                      <button type="button" class="icon-btn" [attr.aria-label]="'Remover ' + (t.title || 'guia')" [disabled]="saving()" (click)="removeTopic(t.key)">
                        <bo-icon name="trash" [size]="13" />
                      </button>
                    </div>
                    @if (openTopicKey() === t.key) {
                      <bo-app-guide-topic-editor [topic]="t" [disabled]="saving()" (changed)="updateTopic($event)" />
                    }
                  </div>
                } @empty {
                  <p class="none">Nenhum guia nesta categoria. Sem guia publicado, ela não aparece no app.</p>
                }
              </div>
            </bo-panel-card>
          } @else {
            <div class="empty">
              <bo-icon name="phone" [size]="20" />
              <p>Nenhuma categoria ainda</p>
              <span>Sem guia publicado, a Central de ajuda do app diz que os guias chegam em breve. Crie a primeira categoria ao lado.</span>
            </div>
          }

          @if (!loading() && !loadError() && (draft().length > 0 || dirty())) {
            <div class="actions" [class.floating]="dirty()">
              <p class="status-line" [class.bad]="issues().length > 0">{{ statusLine() }}</p>
              <button type="button" class="bo-mini-btn" [disabled]="saving() || !dirty()" (click)="ask('discard')">Descartar</button>
              <button type="button" class="bo-mini-btn bo-mini-btn-primary" [disabled]="saving() || !dirty() || issues().length > 0" (click)="save()">
                {{ saving() ? 'Salvando…' : 'Salvar alterações' }}
              </button>
            </div>
          }
        </div>

        <div class="side">
          @if (!loading()) {
            <bo-app-guide-preview [categories]="draft()" [categoryKey]="selectedKey()" [topicKey]="openTopicKey()" [(mode)]="previewMode" />
          }
          <p class="explain">
            O app lê a Central ao abrir Configurações › Sobre › Ajuda e suporte e busca em título, resumo, explicação,
            passos e onde encontrar. Destino que aquele build não conhece esconde o guia; com a Loja desligada, os guias
            que abrem a Loja somem. O app não mede quem leu nem quem tocou no botão.
          </p>
        </div>
      </div>

      @if (confirming(); as kind) {
        <bo-confirm-dialog
          [open]="true"
          [title]="confirmTitle(kind)"
          [description]="confirmText(kind)"
          [confirmLabel]="kind === 'discard' ? 'Descartar' : 'Excluir categoria'"
          tone="danger"
          (confirmed)="confirm(kind)"
          (dismissed)="confirming.set(null)"
        />
      }

      <bo-confirm-dialog
        [open]="leaveOpen()"
        title="Sair sem salvar?"
        description="As alterações na Central de ajuda serão descartadas."
        confirmLabel="Sair sem salvar"
        tone="danger"
        (confirmed)="resolveLeave(true)"
        (dismissed)="resolveLeave(false)"
      />
    </bo-panel-shell>
  `,
  styles: `
    .body { padding: 24px 32px 40px; display: grid; grid-template-columns: 220px minmax(0, 1fr) 340px; gap: 16px; align-items: start; min-width: 0; }
    @media (max-width: 1360px) {
      .body { grid-template-columns: minmax(0, 1fr) 340px; }
      .cats { grid-column: 1 / -1; flex-direction: row !important; overflow-x: auto; padding-bottom: 4px; align-items: stretch; scrollbar-width: thin; scrollbar-color: var(--nx-line-strong) transparent; }
      .cats .col-label { display: none; }
      .cat { flex: none; width: 190px; }
      .cat-add { flex: none; width: 260px; margin-top: 0 !important; }
    }
    @media (max-width: 980px) { .body { grid-template-columns: minmax(0, 1fr); } }
    @media (max-width: 760px) { .body { padding: 16px; } }

    .cats { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .col-label { padding: 0 4px 6px; font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .cat { display: flex; flex-direction: column; gap: 4px; padding: 12px 14px; border-radius: var(--nx-r-2); border: 1px solid transparent; background: transparent; color: inherit; text-align: left; cursor: pointer; min-width: 0; }
    .cat:hover { background: var(--nx-surface-0); }
    .cat.on { background: var(--nx-surface-1); border-color: var(--nx-line-strong); }
    .cat:focus-visible { outline: 2px solid var(--nx-orange-500); outline-offset: 2px; }
    .c-line { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; }
    .c-title { font-family: var(--nx-font-display); font-weight: 700; font-size: 14px; color: var(--nx-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .c-title.untitled { color: var(--nx-text-dim); }
    .c-bad { flex: none; display: grid; color: var(--nx-pending); }
    .c-meta { font-family: var(--nx-font-mono); font-size: 10.5px; color: var(--nx-text-mute); }
    .cat-add { display: flex; gap: 6px; margin-top: 6px; }
    .cat-add .bo-input { height: 36px; font-size: 13px; min-width: 0; }
    .dashed { border-style: dashed; background: transparent; }
    .skeleton { height: 60px; border-radius: var(--nx-r-2); background: var(--nx-surface-1); opacity: 0.6; }
    .skeleton.tall { height: 320px; border-radius: var(--nx-r-4); }

    .main { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .alert-action { margin-left: auto; flex: none; }
    .retry { align-self: flex-start; }
    .info { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border-radius: var(--nx-r-2); border: 1px solid rgba(255, 106, 26, 0.3); background: rgba(255, 106, 26, 0.06); font-size: 12.5px; line-height: 1.45; color: var(--nx-text); }
    .info bo-icon { flex: none; color: var(--nx-orange-500); margin-top: 1px; }

    .counted { position: relative; display: block; }
    .counted .bo-input { padding-right: 58px; }
    .count { position: absolute; right: 12px; top: 13px; font-family: var(--nx-font-mono); font-size: 10.5px; color: var(--nx-text-dim); pointer-events: none; }
    .count.over { color: var(--nx-live); }
    .bo-input.invalid { border-color: rgba(255, 59, 48, 0.6); }
    .cat-issue { margin: 10px 0 0; display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--nx-live); }
    .cat-actions { margin-top: 14px; display: flex; flex-wrap: wrap; gap: 8px; }
    .quiet { color: var(--nx-live); }

    .feats { margin: 0 -16px -16px; }
    .feat { border-top: 1px solid var(--nx-line); }
    .feat.open { background: var(--nx-surface-1); }
    .feat-row { display: flex; align-items: center; gap: 6px; padding: 10px 12px 10px 0; }
    .feat-main { flex: 1; min-width: 0; display: flex; align-items: center; gap: 12px; padding: 2px 4px 2px 16px; border: none; background: transparent; color: inherit; text-align: left; cursor: pointer; }
    .feat-main:focus-visible { outline: 2px solid var(--nx-orange-500); outline-offset: 2px; border-radius: 4px; }
    .pos { flex: none; width: 16px; font-family: var(--nx-font-mono); font-size: 11px; color: var(--nx-text-dim); text-align: center; }
    .feat-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .feat-line { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .feat-title { font-family: var(--nx-font-display); font-weight: 600; font-size: 13.5px; color: var(--nx-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
    .feat-title.untitled { color: var(--nx-text-dim); }
    .feat-sub { font-size: 11.5px; color: var(--nx-text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .feat-sub.bad { color: var(--nx-pending); }
    /* bo-icon é inline sem display próprio: sem grid o transform não gira. */
    .chev, .up { display: grid; }
    .chev { flex: none; color: var(--nx-text-dim); transition: transform 120ms ease; }
    .feat.open .chev { transform: rotate(180deg); }
    .icon-btn { flex: none; width: 30px; height: 30px; display: grid; place-items: center; border: 1px solid var(--nx-line); border-radius: 8px; background: transparent; color: var(--nx-text-mute); cursor: pointer; font-size: 11px; }
    .icon-btn:hover:not(:disabled) { color: var(--nx-text); background: var(--nx-surface-2); }
    .icon-btn:disabled { opacity: 0.3; cursor: default; }
    .up { transform: rotate(180deg); }
    .none { margin: 0; padding: 24px 16px; text-align: center; font-size: 12.5px; color: var(--nx-text-dim); border-top: 1px solid var(--nx-line); }

    .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 14px 16px; border-radius: var(--nx-r-3); border: 1px solid var(--nx-line); background: var(--nx-surface-0); }
    /* Com alteração pendente fica à vista: a Central inteira é um rascunho só, salvo daqui. */
    .actions.floating { position: sticky; bottom: 12px; z-index: 2; border-color: var(--nx-line-strong); box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35); }
    .status-line { flex: 1 1 220px; margin: 0; font-size: 12px; line-height: 1.4; color: var(--nx-text-dim); }
    .status-line.bad { color: var(--nx-pending); }

    .empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 48px 16px; border-radius: var(--nx-r-4); border: 1px solid var(--nx-line); background: var(--nx-surface-0); color: var(--nx-text-dim); text-align: center; }
    .empty p { margin: 0; font-size: 13px; color: var(--nx-text); }
    .empty span { max-width: 420px; font-size: 12px; line-height: 1.5; }

    .side { position: sticky; top: 16px; display: flex; flex-direction: column; gap: 12px; min-width: 0; }
    @media (max-width: 980px) { .side { position: static; } }
    .explain { margin: 0; padding: 14px 16px; border-radius: var(--nx-r-3); background: var(--nx-surface-0); border: 1px solid var(--nx-line); font-size: 12px; line-height: 1.55; color: var(--nx-text-mute); }
  `,
})
export class PanelAppGuideComponent {
  private readonly repository = inject(AppGuideRepository);

  protected readonly maxCategories = MAX_CATEGORIES;
  protected readonly maxTopics = MAX_TOPICS;
  protected readonly categoryTitleMax = CATEGORY_TITLE_MAX;

  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  /** O que está salvo, na ordem da Central. */
  private readonly saved = signal<CategoryDraft[]>([]);
  /** A Central em edição: categorias, ordem e guias, até salvar. */
  protected readonly draft = signal<CategoryDraft[]>([]);
  private readonly version = signal(0);
  protected readonly imported = signal(false);
  protected readonly saving = signal(false);
  protected readonly notice = signal('');
  protected readonly actionError = signal('');
  protected readonly conflict = signal(false);

  protected readonly selectedKey = signal<string | null>(null);
  protected readonly openTopicKey = signal<string | null>(null);
  protected readonly previewMode = signal<AppGuidePreviewMode>('central');
  protected readonly newCategoryTitle = signal('');
  protected readonly confirming = signal<Confirm | null>(null);
  protected readonly leaveOpen = signal(false);
  private leaveResolver: ((ok: boolean) => void) | null = null;

  protected readonly full = computed(() => this.draft().length >= MAX_CATEGORIES);
  protected readonly selectedIndex = computed(() => this.draft().findIndex((c) => c.key === this.selectedKey()));
  protected readonly selected = computed(() => this.draft()[this.selectedIndex()] ?? null);
  protected readonly selectedFull = computed(() => (this.selected()?.topics.length ?? 0) >= MAX_TOPICS);
  protected readonly categoryProblem = computed(() => {
    const c = this.selected();
    return c ? categoryIssue(c) : null;
  });
  protected readonly dirty = computed(
    () => JSON.stringify(categoriesFromDrafts(this.draft())) !== JSON.stringify(categoriesFromDrafts(this.saved())),
  );
  protected readonly issues = computed(() => saveIssues(categoriesFromDrafts(this.draft())));
  protected readonly subtitle = computed(() => {
    const n = publishedCount(this.saved());
    const live = this.saved().filter((c) => c.topics.some((t) => t.published)).length;
    const guides = n === 1 ? '1 guia publicado' : `${n} guias publicados`;
    return `Central de ajuda · ${guides} em ${live === 1 ? '1 categoria' : `${live} categorias`}`;
  });
  protected readonly categoryItems = computed(() =>
    this.draft().map((c) => ({
      key: c.key,
      title: c.title.trim() || 'Sem nome',
      named: c.title.trim().length > 0,
      meta: topicCountText(c),
      bad: categoryIssue(c) !== null || c.topics.some((t) => topicIssue(t, t.published) !== null),
    })),
  );
  protected readonly categoryKicker = computed(() => `Posição ${this.selectedIndex() + 1} de ${this.draft().length} na Central`);
  protected readonly topicsKicker = computed(() => {
    const c = this.selected();
    return c ? `Na ordem da Central · ${topicCountText(c)}` : '';
  });
  protected readonly statusLine = computed(() => {
    const issues = this.issues();
    if (issues.length > 0) {
      return `Para salvar: ${issues.join(' ')}`;
    }
    return this.dirty() ? 'Alterações não salvas. Vão ao app quando você salvar.' : 'Sem alterações. O app mostra o que está salvo.';
  });

  private noticeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    void this.reload();
  }

  protected async reload(): Promise<void> {
    this.loading.set(true);
    this.loadError.set('');
    this.actionError.set('');
    this.conflict.set(false);
    try {
      this.apply(await this.repository.load(), 0, -1);
    } catch (error) {
      this.loadError.set(errorText(error));
    } finally {
      this.loading.set(false);
    }
  }

  /** Estado vindo do servidor; a categoria e o guia abertos continuam abertos pela posição. */
  private apply(state: AppGuideState, categoryIndex: number, topicIndex: number): void {
    const saved = draftsFromCategories(state.categories);
    this.saved.set(saved);
    this.draft.set(cloneDrafts(saved));
    this.version.set(state.version);
    this.imported.set(state.imported);
    const category = saved[Math.min(Math.max(categoryIndex, 0), saved.length - 1)] ?? null;
    this.selectedKey.set(category?.key ?? null);
    this.openTopicKey.set(category?.topics[topicIndex]?.key ?? null);
  }

  protected text(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  /** O que falta para publicar, mesmo no rascunho: a lista mostra o que ainda está incompleto. */
  protected issueOf(t: TopicDraft): string | null {
    return topicIssue(t, true);
  }

  protected selectCategory(key: string): void {
    if (key === this.selectedKey()) {
      return;
    }
    this.selectedKey.set(key);
    this.openTopicKey.set(null);
  }

  protected addCategory(): void {
    const title = this.newCategoryTitle().trim();
    if (!title || this.full()) {
      return;
    }
    const category = newCategoryDraft(title);
    this.draft.update((list) => [...list, category]);
    this.newCategoryTitle.set('');
    this.selectCategory(category.key);
  }

  private updateSelected(fn: (c: CategoryDraft) => CategoryDraft): void {
    const key = this.selectedKey();
    this.draft.update((list) => list.map((c) => (c.key === key ? fn(c) : c)));
  }

  protected patchCategory(change: Partial<Pick<CategoryDraft, 'title'>>): void {
    this.updateSelected((c) => ({ ...c, ...change }));
  }

  protected moveCategory(delta: -1 | 1): void {
    const index = this.selectedIndex();
    this.draft.update((list) => {
      if (index < 0 || index + delta < 0 || index + delta >= list.length) {
        return list;
      }
      const next = [...list];
      [next[index], next[index + delta]] = [next[index + delta]!, next[index]!];
      return next;
    });
  }

  /** Categoria vazia sai direto; com guias, confirma (eles saem do app no save). */
  protected askDeleteCategory(): void {
    if ((this.selected()?.topics.length ?? 0) > 0) {
      this.ask('delete-category');
    } else {
      this.removeSelectedCategory();
    }
  }

  private removeSelectedCategory(): void {
    const index = this.selectedIndex();
    const list = this.draft().filter((_, i) => i !== index);
    this.draft.set(list);
    this.selectedKey.set(list[Math.min(index, list.length - 1)]?.key ?? null);
    this.openTopicKey.set(null);
  }

  protected toggleTopic(key: string): void {
    const opening = this.openTopicKey() !== key;
    this.openTopicKey.set(opening ? key : null);
    if (opening) {
      this.previewMode.set('guia');
    }
  }

  protected addTopic(): void {
    if (!this.selected() || this.selectedFull()) {
      return;
    }
    const topic = emptyTopic();
    this.updateSelected((c) => ({ ...c, topics: [...c.topics, topic] }));
    this.openTopicKey.set(topic.key);
    this.previewMode.set('guia');
  }

  protected updateTopic(next: TopicDraft): void {
    this.updateSelected((c) => ({ ...c, topics: c.topics.map((t) => (t.key === next.key ? next : t)) }));
  }

  protected moveTopic(index: number, delta: -1 | 1): void {
    this.updateSelected((c) => {
      if (index + delta < 0 || index + delta >= c.topics.length) {
        return c;
      }
      const topics = [...c.topics];
      [topics[index], topics[index + delta]] = [topics[index + delta]!, topics[index]!];
      return { ...c, topics };
    });
  }

  protected removeTopic(key: string): void {
    this.updateSelected((c) => ({ ...c, topics: c.topics.filter((t) => t.key !== key) }));
    if (this.openTopicKey() === key) {
      this.openTopicKey.set(null);
    }
  }

  protected ask(kind: Confirm): void {
    this.confirming.set(kind);
  }

  protected confirmTitle(kind: Confirm): string {
    return kind === 'discard' ? 'Descartar as alterações?' : `Excluir a categoria ${this.selected()?.title.trim() || 'sem nome'}?`;
  }

  protected confirmText(kind: Confirm): string {
    if (kind === 'discard') {
      return 'Tudo o que você mudou na Central desde o último save se perde.';
    }
    const n = this.selected()?.topics.length ?? 0;
    return `${n === 1 ? 'O guia dela sai' : `Os ${n} guias dela saem`} da Central de ajuda do app quando você salvar.`;
  }

  protected confirm(kind: Confirm): void {
    this.confirming.set(null);
    if (kind === 'delete-category') {
      this.removeSelectedCategory();
      return;
    }
    const index = this.selectedIndex();
    this.draft.set(cloneDrafts(this.saved()));
    const list = this.draft();
    // A categoria aberta pode ter sido criada agora: volta para a da mesma posição.
    if (!list.some((c) => c.key === this.selectedKey())) {
      this.selectedKey.set(list[Math.min(Math.max(index, 0), list.length - 1)]?.key ?? null);
    }
    if (!this.selected()?.topics.some((t) => t.key === this.openTopicKey())) {
      this.openTopicKey.set(null);
    }
  }

  /** Grava a Central inteira com a versão lida. Versão velha (outra pessoa salvou) pede recarregar. */
  protected async save(): Promise<void> {
    if (this.saving() || this.issues().length > 0) {
      return;
    }
    const categoryIndex = this.selectedIndex();
    const topicIndex = this.selected()?.topics.findIndex((t) => t.key === this.openTopicKey()) ?? -1;
    this.saving.set(true);
    this.actionError.set('');
    this.conflict.set(false);
    try {
      const state = await this.repository.save(withIds(categoriesFromDrafts(this.draft())), this.version());
      this.apply(state, categoryIndex, topicIndex);
      const n = publishedCount(this.saved());
      this.showNotice(`Central de ajuda salva · ${n === 1 ? '1 guia' : `${n} guias`} no app`);
    } catch (error) {
      this.conflict.set(isConflict(error));
      this.actionError.set(errorText(error));
    } finally {
      this.saving.set(false);
    }
  }

  /** Guard de rota (`canDeactivate`): rascunho sujo pergunta antes de sair. */
  canLeave(): boolean | Promise<boolean> {
    if (!this.dirty()) {
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
    if (this.dirty()) {
      event.preventDefault();
    }
  }

  private showNotice(text: string): void {
    this.notice.set(text);
    if (this.noticeTimer !== null) {
      clearTimeout(this.noticeTimer);
    }
    this.noticeTimer = setTimeout(() => this.notice.set(''), 3000);
  }
}
