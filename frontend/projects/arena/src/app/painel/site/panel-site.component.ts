import { ChangeDetectionStrategy, Component, computed, effect, inject, linkedSignal, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { arenaFunctions } from '../data/functions';
import { arenaStorage } from '../data/storage';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { ToggleComponent } from '../ui/toggle.component';
import {
  ARENA_SITE_EMPTY,
  ARENA_SITE_MAX_ABOUT_IMAGES,
  ARENA_SITE_PALETTES,
  slugifyArenaSite,
  validateArenaSiteForPublish,
  type ArenaSiteDraft,
} from './arena-site.model';
import {
  fetchArenaSiteDraft,
  publishArenaSite,
  saveArenaSiteDraft,
  unpublishArenaSite,
  uploadArenaSiteImage,
  type ArenaSiteImageKind,
} from './arena-site-repository';

/** Tela "Meu site": edita o rascunho do mini-site público da arena
 *  (`arenaSites/{arenaId}`) e publica via `publishArenaSite`. Fase 1:
 *  hero + sobre + contato + tema (catálogo fechado). Produto separado do
 *  link-in-bio da tela Links. */
@Component({
  selector: 'ar-panel-site',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, IconComponent, ToggleComponent],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Meu site" subtitle="Landing page pública da arena">
        <button type="button" class="ar-mini-btn" [disabled]="busy()" (click)="saveDraft()">
          {{ saving() ? 'Salvando…' : 'Salvar rascunho' }}
        </button>
        <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="busy()" (click)="publish()">
          <ar-icon name="check" [size]="14" />
          {{ publishing() ? 'Publicando…' : 'Publicar' }}
        </button>
      </ar-page-header>

      <div class="body">
        @if (arenaNotFound()) {
          <p class="state-text">Nenhuma arena vinculada à sua conta ainda. Fale com o suporte para concluir o cadastro.</p>
        } @else if (arenaLoading() || loading()) {
          <p class="state-text">Carregando site…</p>
        } @else if (loadError(); as err) {
          <p class="state-text">{{ err }}</p>
        } @else {
          @if (actionError(); as aerr) {
            <div class="error-banner">{{ aerr }}</div>
          }
          @if (feedback(); as msg) {
            <div class="ok-banner">{{ msg }}</div>
          }

          <ar-panel-card title="Endereço">
            <div class="status-row">
              <span class="status-pill" [class.live]="status() === 'published'">
                {{ status() === 'published' ? 'Publicado' : 'Rascunho' }}
              </span>
              @if (status() === 'published' && publishedSlug()) {
                <a class="ar-text-link" [href]="publicUrl()" target="_blank" rel="noopener">
                  {{ publicUrl() }}
                </a>
                <button type="button" class="ar-ghost-btn small" [disabled]="busy()" (click)="unpublish()">
                  Despublicar
                </button>
              }
            </div>
            <div class="field-label row-gap">Endereço da página</div>
            <div class="slug-row">
              <span class="slug-prefix">{{ publicBaseUrl }}/s/</span>
              <input
                type="text"
                class="input-box slug-input"
                [value]="slug()"
                (input)="slug.set(normalizeSlugInput($any($event.target).value))"
                placeholder="minha-arena"
              />
            </div>
          </ar-panel-card>

          <ar-panel-card title="Tema">
            <div class="field-label">Cor de destaque</div>
            <div class="palette-row">
              @for (p of palettes; track p.id) {
                <button
                  type="button"
                  class="swatch"
                  [class.active]="paletteId() === p.id"
                  [style.background]="p.hex"
                  [attr.aria-label]="'Cor ' + p.label"
                  [attr.aria-pressed]="paletteId() === p.id"
                  (click)="paletteId.set(p.id)"
                ></button>
              }
            </div>
          </ar-panel-card>

          <ar-panel-card title="Hero">
            <div class="field-label">Título principal *</div>
            <input type="text" class="input-box" maxlength="80" [value]="heroHeadline()" (input)="heroHeadline.set($any($event.target).value)" placeholder="Ex.: Sua praia é aqui" />

            <div class="field-label row-gap">Subtítulo</div>
            <input type="text" class="input-box" maxlength="140" [value]="heroTagline()" (input)="heroTagline.set($any($event.target).value)" placeholder="Ex.: Beach tennis e vôlei de praia no coração da cidade" />

            <div class="field-label row-gap">Imagem de fundo</div>
            <div class="image-row">
              @if (heroImageUrl().trim()) {
                <img [src]="heroImageUrl()" alt="" class="image-thumb wide" />
              }
              <button type="button" class="ar-mini-btn" [disabled]="uploading()" (click)="heroFileInput.click()">
                <ar-icon name="camera" [size]="14" />
                {{ heroImageUrl().trim() ? 'Trocar imagem' : 'Enviar imagem' }}
              </button>
              @if (heroImageUrl().trim()) {
                <button type="button" class="ar-ghost-btn small" (click)="heroImageUrl.set('')">Remover</button>
              }
              <input #heroFileInput type="file" accept="image/*" class="visually-hidden-input" aria-label="Selecionar imagem do hero" (change)="onImageSelected($event, 'site-hero')" />
            </div>

            <div class="two-col row-gap">
              <div>
                <div class="field-label">Texto do botão</div>
                <input type="text" class="input-box" maxlength="24" [value]="heroCtaLabel()" (input)="heroCtaLabel.set($any($event.target).value)" placeholder="Ex.: Reservar quadra" />
              </div>
              <div>
                <div class="field-label">Link do botão</div>
                <input type="url" class="input-box" maxlength="300" [value]="heroCtaUrl()" (input)="heroCtaUrl.set($any($event.target).value)" placeholder="https://…" />
              </div>
            </div>
          </ar-panel-card>

          <ar-panel-card title="Sobre a arena">
            <div class="section-toggle">
              <span>Mostrar seção</span>
              <ar-toggle [checked]="aboutEnabled()" (changed)="aboutEnabled.set($event)" />
            </div>

            <div class="field-label row-gap">Título</div>
            <input type="text" class="input-box" maxlength="60" [value]="aboutTitle()" (input)="aboutTitle.set($any($event.target).value)" placeholder="Ex.: Sobre a arena" />

            <div class="field-label row-gap">Texto</div>
            <textarea class="input-box textarea" rows="5" maxlength="1200" [value]="aboutBody()" (input)="aboutBody.set($any($event.target).value)" placeholder="Conte a história da arena, estrutura, diferenciais…"></textarea>

            <div class="field-label row-gap">Fotos (até {{ maxAboutImages }})</div>
            <div class="image-row">
              @for (url of aboutImageUrls(); track url; let i = $index) {
                <div class="image-thumb-wrap">
                  <img [src]="url" alt="" class="image-thumb" />
                  <button type="button" class="thumb-remove" aria-label="Remover foto" (click)="removeAboutImage(i)">×</button>
                </div>
              }
              @if (aboutImageUrls().length < maxAboutImages) {
                <button type="button" class="ar-mini-btn" [disabled]="uploading()" (click)="aboutFileInput.click()">
                  <ar-icon name="plus" [size]="14" />
                  Adicionar foto
                </button>
              }
              <input #aboutFileInput type="file" accept="image/*" class="visually-hidden-input" aria-label="Selecionar foto da seção sobre" (change)="onAboutImageSelected($event)" />
            </div>
          </ar-panel-card>

          <ar-panel-card title="Contato">
            <div class="section-toggle">
              <span>Mostrar seção</span>
              <ar-toggle [checked]="contactEnabled()" (changed)="contactEnabled.set($event)" />
            </div>

            <div class="two-col row-gap">
              <div>
                <div class="field-label">WhatsApp</div>
                <input type="tel" class="input-box" maxlength="20" [value]="contactWhatsapp()" (input)="contactWhatsapp.set($any($event.target).value)" placeholder="(11) 91234-5678" />
              </div>
              <div>
                <div class="field-label">Instagram</div>
                <input type="text" class="input-box" maxlength="40" [value]="contactInstagram()" (input)="contactInstagram.set($any($event.target).value)" placeholder="@minhaarena" />
              </div>
            </div>

            <div class="field-label row-gap">Endereço</div>
            <input type="text" class="input-box" maxlength="160" [value]="contactAddress()" (input)="contactAddress.set($any($event.target).value)" placeholder="Rua, número, bairro — cidade/UF" />
          </ar-panel-card>

          @if (uploading()) {
            <p class="state-text">Enviando imagem…</p>
          }
        }
      </div>
    </ar-panel-shell>
  `,
  styles: `
    .body {
      display: flex;
      flex-direction: column;
      gap: 16px;
      max-width: 760px;
    }

    .state-text {
      color: var(--nx-text-mute);
      font-size: 13px;
      padding: 24px 0;
    }

    .error-banner {
      border: 1px solid rgba(255, 92, 92, 0.4);
      background: rgba(255, 92, 92, 0.08);
      color: #ff8a8a;
      border-radius: var(--nx-r-2);
      padding: 10px 14px;
      font-size: 13px;
    }

    .ok-banner {
      border: 1px solid rgba(43, 209, 126, 0.4);
      background: rgba(43, 209, 126, 0.08);
      color: #2bd17e;
      border-radius: var(--nx-r-2);
      padding: 10px 14px;
      font-size: 13px;
    }

    .status-row {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    .status-pill {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      padding: 4px 10px;
      border-radius: 999px;
      border: 1px solid var(--nx-line);
      color: var(--nx-text-mute);
    }

    .status-pill.live {
      border-color: rgba(43, 209, 126, 0.5);
      color: #2bd17e;
    }

    .field-label {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 10px;
    }

    .row-gap {
      margin-top: 18px;
    }

    .input-box {
      width: 100%;
      height: 46px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 14px;
      padding: 0 14px;
      box-sizing: border-box;
    }

    .input-box:focus {
      outline: none;
      border-color: var(--nx-orange-500);
    }

    .textarea {
      height: auto;
      padding: 12px 14px;
      resize: vertical;
      font-family: var(--nx-font-ui);
    }

    .slug-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .slug-prefix {
      font-family: var(--nx-font-mono);
      font-size: 12px;
      color: var(--nx-text-mute);
      white-space: nowrap;
    }

    .slug-input {
      flex: 1;
      min-width: 0;
      font-family: var(--nx-font-mono);
    }

    .palette-row {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }

    .swatch {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      border: 2px solid transparent;
      cursor: pointer;
      padding: 0;
    }

    .swatch.active {
      border-color: var(--nx-text);
      box-shadow: 0 0 0 3px var(--nx-surface-1);
    }

    .two-col {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
    }

    @media (max-width: 640px) {
      .two-col {
        grid-template-columns: 1fr;
      }
    }

    .section-toggle {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 13px;
      color: var(--nx-text-mute);
    }

    .image-row {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    .image-thumb {
      width: 72px;
      height: 72px;
      object-fit: cover;
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-line);
      display: block;
    }

    .image-thumb.wide {
      width: 128px;
    }

    .image-thumb-wrap {
      position: relative;
    }

    .thumb-remove {
      position: absolute;
      top: -6px;
      right: -6px;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      border: 1px solid var(--nx-line);
      background: var(--nx-surface-1);
      color: var(--nx-text-mute);
      font-size: 12px;
      line-height: 1;
      cursor: pointer;
    }

    .ar-ghost-btn.small {
      font-size: 12px;
      padding: 6px 10px;
    }

    .visually-hidden-input {
      position: absolute;
      width: 1px;
      height: 1px;
      opacity: 0;
      pointer-events: none;
    }
  `,
})
export class PanelSiteComponent {
  private readonly arenaContext = inject(ArenaContextService);

  protected readonly palettes = ARENA_SITE_PALETTES;
  protected readonly maxAboutImages = ARENA_SITE_MAX_ABOUT_IMAGES;
  protected readonly publicBaseUrl = environment.publicSiteUrl;

  protected readonly arenaLoading = computed(() => this.arenaContext.loading());
  protected readonly arenaNotFound = computed(() => this.arenaContext.notFound());

  protected readonly draft = signal<ArenaSiteDraft | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly publishing = signal(false);
  protected readonly uploading = signal(false);
  protected readonly actionError = signal<string | null>(null);
  protected readonly feedback = signal<string | null>(null);

  protected readonly status = linkedSignal(() => this.draft()?.status ?? 'draft');
  protected readonly publishedSlug = linkedSignal(() => this.draft()?.slug ?? '');
  protected readonly slug = linkedSignal(() => this.draft()?.slug || slugifyArenaSite(this.arenaContext.arenaName() ?? ''));
  protected readonly paletteId = linkedSignal(() => this.draft()?.theme.paletteId ?? ARENA_SITE_EMPTY.theme.paletteId);
  protected readonly heroHeadline = linkedSignal(() => this.draft()?.hero.headline ?? '');
  protected readonly heroTagline = linkedSignal(() => this.draft()?.hero.tagline ?? '');
  protected readonly heroImageUrl = linkedSignal(() => this.draft()?.hero.imageUrl ?? '');
  protected readonly heroCtaLabel = linkedSignal(() => this.draft()?.hero.ctaLabel ?? '');
  protected readonly heroCtaUrl = linkedSignal(() => this.draft()?.hero.ctaUrl ?? '');
  protected readonly aboutEnabled = linkedSignal(() => this.draft()?.about.enabled ?? true);
  protected readonly aboutTitle = linkedSignal(() => this.draft()?.about.title ?? '');
  protected readonly aboutBody = linkedSignal(() => this.draft()?.about.body ?? '');
  protected readonly aboutImageUrls = linkedSignal(() => this.draft()?.about.imageUrls ?? []);
  protected readonly contactEnabled = linkedSignal(() => this.draft()?.contact.enabled ?? true);
  protected readonly contactWhatsapp = linkedSignal(() => this.draft()?.contact.whatsapp ?? '');
  protected readonly contactInstagram = linkedSignal(() => this.draft()?.contact.instagram ?? '');
  protected readonly contactAddress = linkedSignal(() => this.draft()?.contact.address ?? '');

  protected readonly busy = computed(() => this.loading() || this.saving() || this.publishing() || this.uploading());
  protected readonly publicUrl = computed(() => `${this.publicBaseUrl}/s/${this.publishedSlug()}`);

  constructor() {
    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      if (!arenaId) return;
      void this.load(arenaId);
    });
  }

  private async load(arenaId: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.draft.set(await fetchArenaSiteDraft(arenaFirestore(), arenaId));
    } catch {
      this.loadError.set('Não foi possível carregar o site.');
    } finally {
      this.loading.set(false);
    }
  }

  protected normalizeSlugInput(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9-]/g, '');
  }

  private collectDraft(): ArenaSiteDraft {
    return {
      status: this.status(),
      slug: this.publishedSlug(),
      theme: { paletteId: this.paletteId(), dark: true },
      hero: {
        headline: this.heroHeadline(),
        tagline: this.heroTagline(),
        imageUrl: this.heroImageUrl(),
        ctaLabel: this.heroCtaLabel(),
        ctaUrl: this.heroCtaUrl(),
      },
      about: {
        enabled: this.aboutEnabled(),
        title: this.aboutTitle(),
        body: this.aboutBody(),
        imageUrls: this.aboutImageUrls(),
      },
      contact: {
        enabled: this.contactEnabled(),
        whatsapp: this.contactWhatsapp(),
        instagram: this.contactInstagram(),
        address: this.contactAddress(),
      },
    };
  }

  protected async saveDraft(): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId) return;

    this.saving.set(true);
    this.actionError.set(null);
    this.feedback.set(null);
    try {
      await saveArenaSiteDraft(arenaFirestore(), arenaId, this.collectDraft());
      this.feedback.set('Rascunho salvo.');
    } catch {
      this.actionError.set('Não foi possível salvar o rascunho.');
    } finally {
      this.saving.set(false);
    }
  }

  protected async publish(): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId) return;

    const slug = this.slug().trim();
    const validationError = validateArenaSiteForPublish(this.collectDraft(), slug);
    if (validationError) {
      this.actionError.set(validationError);
      return;
    }

    this.publishing.set(true);
    this.actionError.set(null);
    this.feedback.set(null);
    try {
      await saveArenaSiteDraft(arenaFirestore(), arenaId, this.collectDraft());
      const result = await publishArenaSite(arenaFunctions(), arenaId, slug);
      this.status.set('published');
      this.publishedSlug.set(result.slug);
      this.feedback.set('Site publicado.');
    } catch (err) {
      this.actionError.set(callableErrorMessage(err, 'Não foi possível publicar o site.'));
    } finally {
      this.publishing.set(false);
    }
  }

  protected async unpublish(): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId) return;

    this.publishing.set(true);
    this.actionError.set(null);
    this.feedback.set(null);
    try {
      await unpublishArenaSite(arenaFunctions(), arenaId);
      this.status.set('draft');
      this.feedback.set('Site despublicado.');
    } catch (err) {
      this.actionError.set(callableErrorMessage(err, 'Não foi possível despublicar o site.'));
    } finally {
      this.publishing.set(false);
    }
  }

  protected onImageSelected(event: Event, kind: ArenaSiteImageKind): void {
    void this.handleImageSelected(event, kind, (url) => this.heroImageUrl.set(url));
  }

  protected onAboutImageSelected(event: Event): void {
    const slot = (this.aboutImageUrls().length + 1) as 1 | 2 | 3;
    const kind = `site-about-${Math.min(slot, ARENA_SITE_MAX_ABOUT_IMAGES)}` as ArenaSiteImageKind;
    void this.handleImageSelected(event, kind, (url) => {
      this.aboutImageUrls.update((current) => [...current, url].slice(0, ARENA_SITE_MAX_ABOUT_IMAGES));
    });
  }

  protected removeAboutImage(index: number): void {
    this.aboutImageUrls.update((current) => current.filter((_, i) => i !== index));
  }

  private async handleImageSelected(event: Event, kind: ArenaSiteImageKind, apply: (url: string) => void): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file) return;

    const arenaId = this.arenaContext.arenaId();
    if (!arenaId) return;

    this.actionError.set(null);
    this.uploading.set(true);
    try {
      const url = await uploadArenaSiteImage(arenaStorage(), arenaId, kind, file);
      apply(url);
    } catch (err) {
      this.actionError.set(err instanceof Error ? err.message : 'Não foi possível enviar a imagem.');
    } finally {
      this.uploading.set(false);
    }
  }
}

/** Extrai a mensagem legível de um erro de callable (as functions mandam mensagens em PT). */
function callableErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    const message = (err as { message: string }).message;
    if (message && !/^internal$/i.test(message.trim())) return message;
  }
  return fallback;
}
