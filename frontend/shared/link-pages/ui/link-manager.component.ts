import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import type { Firestore } from 'firebase/firestore';
import type { Functions } from 'firebase/functions';
import {
  LINK_PAGE_MAX_LINKS,
  displayLinkUrl,
  linkPageIdFor,
  linkPagePath,
  topLinkOf,
  viewsTrendPercent,
  type LinkIconName,
  type LinkPage,
  type LinkPageOwnerType,
  type PageLink,
} from '../link-page.model';
import {
  createPageLink,
  deletePageLink,
  fetchLinkPage,
  fetchPageLinks,
  reorderPageLinks,
  saveLinkPageProfile,
  setPageLinkActive,
  updatePageLink,
  type PageLinkInput,
} from '../link-pages-repository';
import { LinkEditorDialogComponent } from './link-editor-dialog.component';
import { LinkIconComponent } from './link-icon.component';
import { LinkPagePreviewComponent } from './link-page-preview.component';
import {
  LinkPageSettingsDialogComponent,
  type LinkPageSettingsValue,
} from './link-page-settings-dialog.component';

/** Atalho de criação oferecido pelo portal (ex.: um torneio com inscrições abertas). */
export interface LinkSuggestion {
  label: string;
  title: string;
  subtitle: string;
  url: string;
  icon: LinkIconName;
}

/** Gestão completa da página de links, compartilhada pelos painéis da arena e do organizador.
 *
 *  O portal fornece só o contexto (dono, nome padrão, sugestões) e o cabeçalho da página —
 *  toda a lógica de carregar, criar, reordenar, ativar e pré-visualizar vive aqui, para que as
 *  duas superfícies não divirjam com o tempo. */
@Component({
  selector: 'nx-link-manager',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    LinkIconComponent,
    LinkPagePreviewComponent,
    LinkEditorDialogComponent,
    LinkPageSettingsDialogComponent,
  ],
  template: `
    @if (loading()) {
      <p class="state">Carregando sua página de links…</p>
    } @else if (loadError(); as msg) {
      <p class="state">{{ msg }}</p>
    } @else if (!page()) {
      <div class="card onboarding">
        <h2 class="onboarding-title">Crie sua página de links</h2>
        <p class="onboarding-text">
          Um endereço único com tudo o que importa — reservas, torneios, WhatsApp e redes sociais.
          Perfeito para a bio do Instagram.
        </p>
        <button type="button" class="btn primary" (click)="openSettings()">Criar página</button>
      </div>
    } @else {
      <div class="layout">
        <div class="main">
          <div class="kpis">
            <div class="card kpi">
              <div class="kpi-label accent">Visitas na página</div>
              <div class="kpi-value">{{ views30d() }}</div>
              <div class="kpi-foot" [class.up]="trendUp()" [class.down]="trendDown()">{{ trendLabel() }}</div>
            </div>
            <div class="card kpi">
              <div class="kpi-label">Cliques nos links</div>
              <div class="kpi-value">{{ clicks30d() }}</div>
              <div class="kpi-foot">últimos 30 dias</div>
            </div>
            <div class="card kpi">
              <div class="kpi-label">Mais clicado</div>
              <div class="kpi-value small">{{ topLink()?.link?.title ?? '—' }}</div>
              <div class="kpi-foot">{{ topLinkFoot() }}</div>
            </div>
          </div>

          <div class="card list-card">
            <header class="card-head">
              <div>
                <div class="card-kicker">{{ activeCount() }} de {{ links().length }} ativos</div>
                <h2 class="card-title">Seus links</h2>
              </div>
              <span class="card-hint">Arraste para reordenar</span>
            </header>

            @if (suggestions().length) {
              <div class="suggestions">
                @for (s of suggestions(); track s.url) {
                  <button type="button" class="chip" (click)="openCreateFrom(s)">+ {{ s.label }}</button>
                }
              </div>
            }

            <div class="table-head">
              <span></span>
              <span></span>
              <span>Link</span>
              <span>Destino</span>
              <span>Cliques 30d</span>
              <span>Ativo</span>
              <span></span>
            </div>

            <div class="table-body">
              @for (link of links(); track link.id; let i = $index) {
                <div
                  class="row"
                  draggable="true"
                  [class.inactive]="!link.active"
                  [class.dragging]="draggingIndex() === i"
                  (dragstart)="onDragStart(i)"
                  (dragover)="onDragOver($event, i)"
                  (drop)="onDrop($event)"
                  (dragend)="onDragEnd()"
                >
                  <span class="grip" aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="9" cy="6" r="1.1" /><circle cx="15" cy="6" r="1.1" />
                      <circle cx="9" cy="12" r="1.1" /><circle cx="15" cy="12" r="1.1" />
                      <circle cx="9" cy="18" r="1.1" /><circle cx="15" cy="18" r="1.1" />
                    </svg>
                  </span>

                  <span class="row-icon">
                    <nx-link-icon [name]="link.icon" [size]="18" />
                  </span>

                  <div class="row-main">
                    <div class="row-title-line">
                      <span class="row-title">{{ link.title }}</span>
                      @if (link.featured) {
                        <span class="tag orange">Destaque</span>
                      }
                      @if (link.live) {
                        <span class="tag red">Ao vivo</span>
                      }
                    </div>
                    @if (link.subtitle) {
                      <div class="row-sub">{{ link.subtitle }}</div>
                    }
                  </div>

                  <div class="row-url" [title]="link.url">{{ shortUrl(link.url) }}</div>

                  <div class="row-clicks" [class.zero]="link.clicks30d === 0">
                    {{ link.clicks30d }}<span class="unit"> cliques</span>
                  </div>

                  <button
                    type="button"
                    class="toggle"
                    role="switch"
                    [class.on]="link.active"
                    [attr.aria-checked]="link.active"
                    [attr.aria-label]="(link.active ? 'Desativar ' : 'Ativar ') + link.title"
                    (click)="toggleActive(link)"
                  >
                    <span class="knob"></span>
                  </button>

                  <div class="row-actions">
                    <button type="button" class="btn small" (click)="openEdit(link)">Editar</button>
                  </div>
                </div>
              } @empty {
                <p class="state empty">Nenhum link ainda. Comece pelo botão “Novo link”.</p>
              }
            </div>
          </div>
        </div>

        <aside class="side">
          <div class="card url-card">
            <h2 class="card-title small">Sua página</h2>
            <div class="url-box">
              <nx-link-icon name="link" [size]="15" class="url-icon" />
              <span class="url-text">{{ publicUrlDisplay() }}</span>
            </div>
            <div class="url-actions">
              <button type="button" class="btn" (click)="copyUrl()">{{ copied() ? 'Copiado!' : 'Copiar link' }}</button>
              <a class="btn" [href]="publicUrl()" target="_blank" rel="noopener">Abrir página</a>
            </div>
            @if (!page()!.published) {
              <p class="unpublished">Página despublicada — só você consegue ver.</p>
            }
            <button type="button" class="btn wide" (click)="openSettings()">Configurar página</button>
          </div>

          <div class="card preview-card">
            <div class="preview-badge">PRÉVIA · COMO O PÚBLICO VÊ</div>
            <div class="preview-viewport">
              <div class="preview-scale">
                <nx-link-page-preview [page]="page()!" [links]="links()" />
              </div>
            </div>
            <div class="preview-fade"></div>
          </div>
        </aside>
      </div>
    }

    @if (editorOpen()) {
      <nx-link-editor-dialog
        [link]="editingLink()"
        [saving]="saving()"
        [serverError]="actionError()"
        (save)="submitLink($event)"
        (remove)="removeLink($event)"
        (dismiss)="closeEditor()"
      />
    }

    @if (settingsOpen()) {
      <nx-link-page-settings-dialog
        [page]="page()"
        [baseUrl]="baseHost()"
        [prefix]="pathPrefix()"
        [defaultTitle]="defaultTitle()"
        [saving]="saving()"
        [serverError]="actionError()"
        (save)="submitSettings($event)"
        (dismiss)="closeSettings()"
      />
    }
  `,
  styles: `
    :host {
      display: block;
      flex: 1;
      min-height: 0;
      padding: 22px 32px 28px;
      overflow: auto;
    }

    .state {
      font-size: 13.5px;
      color: var(--nx-text-mute);
      margin: 0;
    }

    .empty {
      padding: 18px 0;
    }

    .card {
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-3, 14px);
      padding: 18px;
    }

    .onboarding {
      max-width: 520px;
      padding: 28px;
    }

    .onboarding-title {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 20px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
      margin: 0 0 8px;
    }

    .onboarding-text {
      font-size: 13.5px;
      line-height: 1.6;
      color: var(--nx-text-mute);
      margin: 0 0 18px;
    }

    .layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 348px;
      gap: 16px;
      align-items: start;
    }

    .main {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-width: 0;
    }

    .kpis {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 16px;
    }

    .kpi-label {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .kpi-label.accent {
      color: var(--nx-orange-500);
    }

    .kpi-value {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 28px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
      margin-top: 8px;
    }

    .kpi-value.small {
      font-size: 19px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .kpi-foot {
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      color: var(--nx-text-dim);
      margin-top: 4px;
    }

    .kpi-foot.up {
      color: var(--nx-win);
    }

    .kpi-foot.down {
      color: var(--nx-live);
    }

    .card-head {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 12px;
      padding-bottom: 12px;
    }

    .card-kicker {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--nx-orange-500);
    }

    .card-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 15px;
      color: var(--nx-text);
      margin: 4px 0 0;
    }

    .card-title.small {
      font-size: 14px;
      margin: 0 0 10px;
    }

    .card-hint {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      color: var(--nx-text-dim);
    }

    .suggestions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding-bottom: 12px;
    }

    .chip {
      height: 26px;
      padding: 0 10px;
      border-radius: var(--nx-r-pill);
      border: 1px solid var(--nx-line-strong);
      background: var(--nx-surface-1);
      color: var(--nx-text-mute);
      font-family: var(--nx-font-ui);
      font-size: 11.5px;
      font-weight: 600;
      cursor: pointer;
      transition: all 140ms var(--nx-ease-out);
    }

    .chip:hover {
      color: var(--nx-orange-500);
      border-color: var(--nx-orange-500);
    }

    .table-head,
    .row {
      display: grid;
      grid-template-columns: 20px 40px minmax(0, 1.6fr) minmax(0, 1fr) 96px 44px 82px;
      gap: 12px;
      align-items: center;
    }

    .table-head {
      padding-bottom: 8px;
      border-bottom: 1px solid var(--nx-line-strong);
    }

    .table-head span {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .row {
      padding: 12px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .row:last-child {
      border-bottom: none;
    }

    .row.inactive {
      opacity: 0.5;
    }

    .row.dragging {
      opacity: 0.35;
    }

    .grip {
      color: var(--nx-text-dim);
      cursor: grab;
      display: flex;
    }

    .row-icon {
      width: 38px;
      height: 38px;
      border-radius: 11px;
      display: grid;
      place-items: center;
      background: var(--nx-orange-tint);
      color: var(--nx-orange-500);
    }

    .row-main {
      min-width: 0;
    }

    .row-title-line {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .row-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 13.5px;
      color: var(--nx-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .tag {
      flex: none;
      padding: 2px 7px;
      border-radius: var(--nx-r-pill);
      font-family: var(--nx-font-mono);
      font-size: 8.5px;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      border: 1px solid transparent;
    }

    .tag.orange {
      background: var(--nx-orange-tint);
      border-color: rgba(255, 106, 26, 0.3);
      color: var(--nx-orange-500);
    }

    .tag.red {
      background: rgba(255, 59, 48, 0.1);
      border-color: rgba(255, 59, 48, 0.28);
      color: var(--nx-live);
    }

    .row-sub {
      font-size: 11.5px;
      color: var(--nx-text-dim);
      margin-top: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .row-url {
      font-family: var(--nx-font-mono);
      font-size: 11px;
      color: var(--nx-text-dim);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .row-clicks {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 13px;
      color: var(--nx-text);
    }

    .row-clicks.zero {
      color: var(--nx-text-dim);
      font-weight: 500;
    }

    .unit {
      font-weight: 500;
      font-size: 9.5px;
      color: var(--nx-text-dim);
    }

    .toggle {
      width: 36px;
      height: 21px;
      padding: 0;
      border-radius: var(--nx-r-pill);
      border: 1px solid var(--nx-line-strong);
      background: var(--nx-surface-2);
      position: relative;
      cursor: pointer;
      transition: background 150ms var(--nx-ease-out);
    }

    .toggle.on {
      background: var(--nx-orange-500);
      border-color: var(--nx-orange-500);
    }

    .knob {
      position: absolute;
      top: 2px;
      left: 2px;
      width: 15px;
      height: 15px;
      border-radius: 99px;
      background: var(--nx-text-dim);
      transition: left 150ms var(--nx-ease-out);
    }

    .toggle.on .knob {
      left: 17px;
      background: #fff;
    }

    .row-actions {
      display: flex;
      justify-content: flex-end;
    }

    .side {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-width: 0;
    }

    .url-box {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 11px 13px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
    }

    .url-icon {
      color: var(--nx-orange-500);
      flex: none;
      display: flex;
    }

    .url-text {
      font-family: var(--nx-font-mono);
      font-size: 12px;
      font-weight: 600;
      color: var(--nx-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .url-actions {
      display: flex;
      gap: 8px;
      margin-top: 10px;
    }

    .url-actions .btn {
      flex: 1;
    }

    .unpublished {
      font-size: 11.5px;
      color: var(--nx-pending);
      margin: 10px 0 0;
    }

    .wide {
      width: 100%;
      margin-top: 8px;
    }

    .preview-card {
      padding: 0;
      position: relative;
      height: 520px;
      overflow: hidden;
      background: #050505;
    }

    .preview-badge {
      position: absolute;
      top: 14px;
      left: 16px;
      z-index: 2;
      padding: 4px 10px;
      border-radius: 7px;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(6px);
      font-family: var(--nx-font-mono);
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.16em;
      color: var(--nx-text-dim);
    }

    .preview-viewport {
      position: absolute;
      inset: 0;
      overflow: hidden;
      display: flex;
      justify-content: center;
    }

    .preview-scale {
      transform: scale(0.78);
      transform-origin: top center;
      flex: none;
    }

    .preview-fade {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 70px;
      background: linear-gradient(to bottom, transparent, #050505);
      pointer-events: none;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      height: 32px;
      padding: 0 12px;
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-line-strong);
      background: var(--nx-surface-1);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 12px;
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
      transition: all 140ms var(--nx-ease-out);
    }

    .btn:hover:not(:disabled) {
      background: var(--nx-surface-2);
    }

    .btn.primary {
      background: var(--nx-orange-500);
      border-color: var(--nx-orange-500);
      color: #140a04;
    }

    .btn.small {
      height: 28px;
      padding: 0 10px;
      font-size: 11.5px;
    }

    @media (max-width: 1180px) {
      .layout {
        grid-template-columns: minmax(0, 1fr);
      }

      .kpis {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
})
export class LinkManagerComponent {
  readonly db = input.required<Firestore>();
  readonly functions = input.required<Functions>();
  readonly ownerType = input.required<LinkPageOwnerType>();
  readonly ownerId = input.required<string | null>();
  /** Nome sugerido ao criar a página (nome da arena / do organizador). */
  readonly defaultTitle = input('');
  /** Host público sem barra final, ex.: `https://nexago.com.br`. */
  readonly publicBaseUrl = input.required<string>();
  readonly suggestions = input<readonly LinkSuggestion[]>([]);

  protected readonly page = signal<LinkPage | null>(null);
  protected readonly links = signal<PageLink[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly actionError = signal<string | null>(null);
  protected readonly copied = signal(false);

  protected readonly editorOpen = signal(false);
  protected readonly editingLink = signal<PageLink | null>(null);
  protected readonly settingsOpen = signal(false);
  protected readonly draggingIndex = signal<number | null>(null);

  protected readonly shortUrl = displayLinkUrl;

  protected readonly activeCount = computed(() => this.links().filter((l) => l.active).length);
  protected readonly clicks30d = computed(() => this.links().reduce((sum, l) => sum + l.clicks30d, 0));
  protected readonly views30d = computed(() => this.page()?.views30d ?? 0);
  protected readonly topLink = computed(() => topLinkOf(this.links()));

  private readonly trend = computed(() => {
    const page = this.page();
    return page ? viewsTrendPercent(page) : null;
  });

  protected readonly trendUp = computed(() => (this.trend() ?? 0) > 0);
  protected readonly trendDown = computed(() => (this.trend() ?? 0) < 0);

  protected readonly trendLabel = computed(() => {
    const trend = this.trend();
    if (trend == null) return 'últimos 30 dias';
    const sign = trend > 0 ? '+' : '';
    return `${sign}${trend}% vs. 30 dias anteriores`;
  });

  protected readonly topLinkFoot = computed(() => {
    const top = this.topLink();
    if (!top) return 'sem cliques ainda';
    return `${top.link.clicks30d} cliques · ${top.share}% do total`;
  });

  protected readonly pathPrefix = computed(() => (this.ownerType() === 'arena' ? 'a' : 'o'));
  protected readonly baseHost = computed(() => displayLinkUrl(this.publicBaseUrl()));

  protected readonly publicUrl = computed(() => {
    const page = this.page();
    return page ? `${this.publicBaseUrl()}${linkPagePath(page)}` : this.publicBaseUrl();
  });

  protected readonly publicUrlDisplay = computed(() => displayLinkUrl(this.publicUrl()));

  private readonly pageId = computed(() => {
    const ownerId = this.ownerId();
    return ownerId ? linkPageIdFor(this.ownerType(), ownerId) : null;
  });

  constructor() {
    effect(() => {
      const ownerId = this.ownerId();
      if (!ownerId) return;
      void this.load(ownerId);
    });
  }

  /** Abre o editor em branco — chamado pelo botão "Novo link" do cabeçalho de cada portal. */
  openCreate(): void {
    this.actionError.set(null);
    this.editingLink.set(null);
    this.editorOpen.set(true);
  }

  openSettings(): void {
    this.actionError.set(null);
    this.settingsOpen.set(true);
  }

  private async load(ownerId: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const page = await fetchLinkPage(this.db(), this.ownerType(), ownerId);
      this.page.set(page);
      this.links.set(page ? await fetchPageLinks(this.db(), page.id) : []);
    } catch {
      this.loadError.set('Não foi possível carregar a página de links.');
    } finally {
      this.loading.set(false);
    }
  }

  private async reload(): Promise<void> {
    const ownerId = this.ownerId();
    if (ownerId) await this.load(ownerId);
  }

  protected openEdit(link: PageLink): void {
    this.actionError.set(null);
    this.editingLink.set(link);
    this.editorOpen.set(true);
  }

  protected openCreateFrom(suggestion: LinkSuggestion): void {
    this.actionError.set(null);
    this.editingLink.set({
      id: '',
      title: suggestion.title,
      subtitle: suggestion.subtitle,
      url: suggestion.url,
      icon: suggestion.icon,
      active: true,
      featured: false,
      live: false,
      order: 0,
      clicks: 0,
      clicks30d: 0,
    });
    this.editorOpen.set(true);
  }

  protected closeEditor(): void {
    this.editorOpen.set(false);
    this.editingLink.set(null);
    this.actionError.set(null);
  }

  protected closeSettings(): void {
    this.settingsOpen.set(false);
    this.actionError.set(null);
  }

  protected async submitLink(input: PageLinkInput): Promise<void> {
    const pageId = this.pageId();
    if (!pageId) return;

    const editing = this.editingLink();
    // Sugestão preenchida vem com id vazio: é criação, não edição.
    const editingId = editing && editing.id ? editing.id : null;

    if (!editingId && this.links().length >= LINK_PAGE_MAX_LINKS) {
      this.actionError.set(`Você já atingiu o limite de ${LINK_PAGE_MAX_LINKS} links.`);
      return;
    }

    this.saving.set(true);
    this.actionError.set(null);
    try {
      if (editingId) {
        await updatePageLink(this.db(), pageId, editingId, input, this.links());
      } else {
        await createPageLink(this.db(), pageId, input, this.links());
      }
      this.closeEditor();
      await this.reload();
    } catch (error) {
      this.actionError.set(messageOf(error, 'Não foi possível salvar o link.'));
    } finally {
      this.saving.set(false);
    }
  }

  protected async removeLink(linkId: string): Promise<void> {
    const pageId = this.pageId();
    if (!pageId || !linkId) return;

    this.saving.set(true);
    this.actionError.set(null);
    try {
      await deletePageLink(this.db(), pageId, linkId);
      this.closeEditor();
      await this.reload();
    } catch (error) {
      this.actionError.set(messageOf(error, 'Não foi possível excluir o link.'));
    } finally {
      this.saving.set(false);
    }
  }

  protected async submitSettings(value: LinkPageSettingsValue): Promise<void> {
    const ownerId = this.ownerId();
    if (!ownerId) return;

    this.saving.set(true);
    this.actionError.set(null);
    try {
      await saveLinkPageProfile(this.functions(), {
        ownerType: this.ownerType(),
        ownerId,
        slug: value.slug,
        title: value.title,
        handle: value.handle,
        bio: value.bio,
        avatarUrl: this.page()?.avatarUrl ?? null,
        highlights: value.highlights,
        published: value.published,
      });
      this.closeSettings();
      await this.reload();
    } catch (error) {
      this.actionError.set(messageOf(error, 'Não foi possível salvar a página.'));
    } finally {
      this.saving.set(false);
    }
  }

  protected async toggleActive(link: PageLink): Promise<void> {
    const pageId = this.pageId();
    if (!pageId) return;

    const next = !link.active;
    // Atualização otimista: o toggle responde na hora e reverte se a escrita falhar.
    this.links.update((list) => list.map((l) => (l.id === link.id ? { ...l, active: next } : l)));
    try {
      await setPageLinkActive(this.db(), pageId, link.id, next);
    } catch {
      this.links.update((list) => list.map((l) => (l.id === link.id ? { ...l, active: !next } : l)));
    }
  }

  protected async copyUrl(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.publicUrl());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1600);
    } catch {
      // Sem permissão de clipboard (ou contexto inseguro) — o endereço segue visível na tela.
    }
  }

  // ── Reordenação por arrastar ────────────────────────────────────────────────

  protected onDragStart(index: number): void {
    this.draggingIndex.set(index);
  }

  protected onDragOver(event: DragEvent, index: number): void {
    event.preventDefault();
    const from = this.draggingIndex();
    if (from == null || from === index) return;
    this.links.update((list) => {
      const next = [...list];
      const [moved] = next.splice(from, 1);
      if (moved) next.splice(index, 0, moved);
      return next;
    });
    this.draggingIndex.set(index);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    void this.persistOrder();
  }

  protected onDragEnd(): void {
    this.draggingIndex.set(null);
  }

  private async persistOrder(): Promise<void> {
    const pageId = this.pageId();
    this.draggingIndex.set(null);
    if (!pageId) return;
    try {
      await reorderPageLinks(this.db(), pageId, this.links().map((l) => l.id));
      this.links.update((list) => list.map((l, index) => ({ ...l, order: index })));
    } catch {
      await this.reload();
    }
  }
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
