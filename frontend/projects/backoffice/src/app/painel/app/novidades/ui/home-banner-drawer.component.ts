import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { callableErrorMessage } from '../../../data/callable-error';
import { readImageSize, type ImageSize } from '../../../loja/campanhas/data/campaign-image';
import { FieldComponent } from '../../../ui/field.component';
import { IconComponent } from '../../../ui/icon.component';
import { PillComponent, type PillTone } from '../../../ui/pill.component';
import { ToggleComponent } from '../../../ui/toggle.component';
import {
  AUDIENCES,
  CROWDED_CAROUSEL,
  CTA_MAX,
  DESCRIPTION_MAX,
  DESTINATIONS,
  TITLE_MAX,
  homeBannerStatus,
  num,
  pct,
  type HomeBanner,
  type HomeBannerStats,
  type HomeBannerStatus,
} from '../data/home-banner';
import {
  emptyHomeBannerForm,
  formFromHomeBanner,
  previewHomeBanner,
  publishLabel,
  validateHomeBannerForm,
  type HomeBannerContent,
  type HomeBannerForm,
  type HomeBannerFormErrors,
  type SaveIntent,
} from '../data/home-banner-form';
import { ART_HEIGHT, ART_SPEC, ART_WIDTH, artFileError, artSizeCheck } from '../data/home-banner-image';
import { HomeBannersRepository } from '../data/home-banners.repository';
import { HomeBannerPreviewComponent } from './home-banner-preview.component';

export type HomeBannerDrawerMode =
  | { kind: 'new' }
  | { kind: 'edit'; banner: HomeBanner }
  | { kind: 'duplicate'; banner: HomeBanner };

export const STATUS_META: Record<HomeBannerStatus, { label: string; tone: PillTone; hint: string }> = {
  'no-ar': { label: 'No ar', tone: 'green', hint: 'Aparece na Home de quem está no público' },
  agendado: { label: 'Agendado', tone: 'yellow', hint: 'Entra no ar na data de início' },
  pausado: { label: 'Pausado', tone: 'dim', hint: 'Publicado, mas fora do app até reativar' },
  rascunho: { label: 'Rascunho', tone: 'dim', hint: 'Guardado, nunca foi ao app' },
  encerrado: { label: 'Encerrado', tone: 'dim', hint: 'Passou da data de fim' },
};

/**
 * Drawer "Novo banner" / edição, com a prévia fiel ao app no topo. Recriado a cada abertura: o
 * form nasce do `mode`. Não grava: emite o conteúdo e a intenção (rascunho ou publicar) e a tela
 * salva a lista inteira — a ordem do carrossel é a da lista.
 */
@Component({
  selector: 'bo-home-banner-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FieldComponent, IconComponent, PillComponent, ToggleComponent, HomeBannerPreviewComponent],
  host: { '(document:keydown.escape)': 'close()' },
  template: `
    <div class="backdrop" (click)="close()"></div>
    <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="home-banner-title">
      <header class="head">
        <div class="who">
          <span class="kicker">{{ kicker() }} · Home do atleta</span>
          <h2 id="home-banner-title">{{ form().title.trim() || 'Sem título' }}</h2>
          @if (editing(); as b) {
            <span class="meta">
              <bo-pill [tone]="statusMeta(b).tone">{{ statusMeta(b).label }}</bo-pill>
              @if (stats().seen > 0) {
                <span>
                  {{ num(stats().seen) }} viram · {{ num(stats().clicked) }} tocaram ·
                  {{ pct(stats().dismissed, stats().seen) }} dispensaram
                </span>
              }
            </span>
          }
        </div>
        <button type="button" class="close" aria-label="Fechar" [disabled]="saving()" (click)="close()">✕</button>
      </header>

      <div class="body">
        <div class="phone">
          <div class="phone-head">
            <span>Prévia no app</span>
            <span>{{ form().format === 'compact' ? 'Compacto · 1 linha' : 'Carrossel' }}</span>
          </div>
          <bo-home-banner-preview [banner]="preview()" [total]="previewTotal()" [position]="1" />
        </div>

        <div class="segmented" role="radiogroup" aria-label="Formato">
          @for (f of formats; track f.id) {
            <button
              type="button"
              role="radio"
              [attr.aria-checked]="form().format === f.id"
              [class.on]="form().format === f.id"
              (click)="patch({ format: f.id })"
            >
              {{ f.label }}
            </button>
          }
        </div>

        <bo-field label="Título" [hint]="errors().title ?? '2–3 palavras. O nome da funcionalidade.'">
          <span class="counted">
            <input
              class="bo-input"
              [class.invalid]="errors().title || form().title.trim().length > titleMax"
              [value]="form().title"
              (input)="patch({ title: text($event) })"
            />
            <span class="count" [class.over]="form().title.trim().length > titleMax">{{ form().title.trim().length }}/{{ titleMax }}</span>
          </span>
        </bo-field>

        <bo-field
          label="Descrição"
          [hint]="errors().description ?? (form().format === 'compact' ? 'Uma linha com o benefício. No compacto, corta em ~40 caracteres.' : 'Uma linha com o benefício para o atleta.')"
        >
          <span class="counted">
            <input
              class="bo-input"
              [class.invalid]="errors().description || form().description.trim().length > descriptionMax"
              [value]="form().description"
              (input)="patch({ description: text($event) })"
            />
            <span class="count" [class.over]="form().description.trim().length > descriptionMax">
              {{ form().description.trim().length }}/{{ descriptionMax }}
            </span>
          </span>
        </bo-field>

        @if (form().format === 'carousel') {
          <bo-field label="Texto do botão" [hint]="errors().ctaLabel ?? 'Um verbo: Reservar agora, Montar jogo. Evite “Saiba mais”.'">
            <span class="counted">
              <input
                class="bo-input"
                [class.invalid]="errors().ctaLabel || form().ctaLabel.trim().length > ctaMax"
                [value]="form().ctaLabel"
                (input)="patch({ ctaLabel: text($event) })"
              />
              <span class="count" [class.over]="form().ctaLabel.trim().length > ctaMax">{{ form().ctaLabel.trim().length }}/{{ ctaMax }}</span>
            </span>
          </bo-field>

          <div class="art-field">
            <span class="label">Imagem · {{ artWidth }}×{{ artHeight }} px</span>
            <div class="art-row">
              <div class="art" [class.has-image]="form().imageUrl" (dragover)="$event.preventDefault()" (drop)="onDrop($event)">
                @if (form().imageUrl; as img) {
                  <img [src]="img" alt="Imagem do banner" (load)="onImageLoad($event)" />
                }
                @if (uploadProgress() !== null) {
                  <div class="bar" aria-label="Enviando imagem"><span [style.width.%]="uploadProgress()"></span></div>
                }
              </div>
              <div class="art-side">
                <div class="art-actions">
                  <label class="bo-mini-btn" [class.disabled]="saving() || uploadProgress() !== null">
                    <bo-icon name="camera" [size]="13" />
                    {{ form().imageUrl ? 'Trocar' : 'Enviar imagem' }}
                    <input
                      type="file"
                      hidden
                      accept="image/jpeg,image/png,image/webp"
                      [disabled]="saving() || uploadProgress() !== null"
                      (change)="onPick($event)"
                    />
                  </label>
                  @if (form().imageUrl) {
                    <button type="button" class="bo-mini-btn" [disabled]="saving()" (click)="removeImage()">Remover</button>
                  }
                </div>
                <span class="hint spec">{{ artSpec }}</span>
                @if (uploadError(); as err) {
                  <span class="hint err" role="alert">{{ err }}</span>
                } @else if (imageWarning(); as warn) {
                  <span class="hint warn">{{ warn }}</span>
                } @else {
                  <span class="hint">A tela da funcionalidade, em pé. Arraste o arquivo para o quadro. Sem imagem, o app usa o ícone do destino.</span>
                }
              </div>
            </div>
          </div>
        }

        <div class="group">
          <span class="label">Ao tocar, abre</span>
          <div class="chips">
            @for (d of destinations; track d.id) {
              <button type="button" class="chip" [class.on]="form().destination === d.id" (click)="patch({ destination: d.id })">
                {{ d.label }}
              </button>
            }
          </div>
          @if (form().destination === 'url') {
            <bo-field label="Endereço" [hint]="errors().url ?? 'Abre fora do app, no navegador.'">
              <input
                class="bo-input mono"
                placeholder="https://"
                inputmode="url"
                [class.invalid]="errors().url"
                [value]="form().url"
                (input)="patch({ url: text($event) })"
              />
            </bo-field>
          }
        </div>

        <div class="group">
          <span class="label">Quem vê</span>
          <div class="chips">
            @for (a of audiences; track a.id) {
              <button type="button" class="chip" [class.on]="form().audience === a.id" (click)="patch({ audience: a.id })">
                {{ a.label }}
              </button>
            }
          </div>
        </div>

        <div class="two">
          <bo-field label="Início" [hint]="errors().startDate ?? 'Vazio = ao publicar'">
            <input class="bo-input mono" type="date" [value]="form().startDate" (input)="patch({ startDate: text($event) })" />
          </bo-field>
          <bo-field label="Fim" [hint]="errors().endDate ?? 'Vazio = até pausar'">
            <input
              class="bo-input mono"
              type="date"
              [class.invalid]="errors().endDate"
              [value]="form().endDate"
              (input)="patch({ endDate: text($event) })"
            />
          </bo-field>
        </div>

        <div class="toggles">
          <div class="toggle-row">
            <span>
              <strong>Esconder depois do primeiro toque</strong>
              <span class="dim">O atleta que já tocou no botão não vê de novo.</span>
            </span>
            <bo-toggle ariaLabel="Esconder depois do primeiro toque" [checked]="form().hideAfterClick" (checkedChange)="patch({ hideAfterClick: $event })" />
          </div>
          <div class="toggle-row">
            <span>
              <strong>Atleta pode dispensar (X)</strong>
              <span class="dim">Dispensado não volta para aquele atleta.</span>
            </span>
            <bo-toggle ariaLabel="Atleta pode dispensar" [checked]="form().dismissible" (checkedChange)="patch({ dismissible: $event })" />
          </div>
        </div>

        @if (serverError(); as err) {
          <div class="bo-alert" role="alert"><bo-icon name="alert" [size]="16" /><span>{{ err }}</span></div>
        }
      </div>

      <footer class="foot">
        <span class="note" [class.warn]="footNote().warn">{{ footNote().text }}</span>
        @if (isPublished()) {
          <button type="button" class="bo-ghost-btn" [disabled]="saving()" (click)="close()">Cancelar</button>
          <button type="button" class="bo-mini-btn bo-mini-btn-primary" [disabled]="busy()" (click)="submit('publish')">
            {{ saving() ? 'Salvando…' : 'Salvar' }}
          </button>
        } @else {
          <button type="button" class="bo-mini-btn" [disabled]="busy()" (click)="submit('draft')">Salvar rascunho</button>
          <button type="button" class="bo-mini-btn bo-mini-btn-primary" [disabled]="busy()" (click)="submit('publish')">
            {{ saving() ? 'Salvando…' : publishText() }}
          </button>
        }
      </footer>
    </aside>
  `,
  styles: `
    .backdrop { position: fixed; inset: 0; z-index: 40; background: rgba(0, 0, 0, 0.55); }
    .drawer { position: fixed; z-index: 41; top: 0; right: 0; bottom: 0; width: min(580px, 100%); display: flex; flex-direction: column; background: var(--nx-surface-0); border-left: 1px solid var(--nx-line-strong); box-shadow: -24px 0 48px rgba(0, 0, 0, 0.45); }
    .head { display: flex; align-items: flex-start; gap: 12px; padding: 22px 24px; border-bottom: 1px solid var(--nx-line); }
    .who { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
    .kicker, .label { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    h2 { margin: 0; font-family: var(--nx-font-display); font-weight: 800; font-size: 20px; color: var(--nx-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 3px; font-size: 12px; color: var(--nx-text-dim); }
    .close { flex: none; width: 34px; height: 34px; border-radius: 10px; background: var(--nx-surface-1); border: 1px solid var(--nx-line-strong); color: var(--nx-text-mute); cursor: pointer; }
    .close:hover:not(:disabled) { color: var(--nx-text); }
    .body { flex: 1; overflow-y: auto; padding: 20px 24px; display: flex; flex-direction: column; gap: 18px; }
    .foot { display: flex; align-items: center; gap: 10px; padding: 16px 24px; border-top: 1px solid var(--nx-line); background: var(--nx-surface-1); }
    .note { flex: 1; min-width: 0; font-size: 11.5px; line-height: 1.4; color: var(--nx-text-dim); }
    .note.warn { color: var(--nx-pending); }

    .phone { padding: 20px 22px 22px; border-radius: var(--nx-r-4); background: #050505; border: 1px solid var(--nx-line); }
    .phone-head { display: flex; justify-content: space-between; margin-bottom: 16px; font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }

    .segmented { display: grid; grid-template-columns: 1fr 1fr; padding: 3px; gap: 3px; border-radius: var(--nx-r-2); background: var(--nx-surface-1); border: 1px solid var(--nx-line); }
    .segmented button { height: 34px; border: none; border-radius: var(--nx-r-2); background: transparent; color: var(--nx-text-mute); font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; cursor: pointer; }
    .segmented button.on { background: var(--nx-surface-0); color: var(--nx-text); }

    .counted { position: relative; display: block; }
    .counted .bo-input { padding-right: 58px; }
    .count { position: absolute; right: 12px; top: 13px; font-family: var(--nx-font-mono); font-size: 10.5px; color: var(--nx-text-dim); pointer-events: none; }
    .count.over { color: var(--nx-live); }
    .bo-input.invalid { border-color: rgba(255, 59, 48, 0.6); }
    .mono { font-family: var(--nx-font-mono); letter-spacing: 0.02em; }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }

    .art-field { display: flex; flex-direction: column; gap: 8px; }
    .art-row { display: flex; gap: 16px; align-items: flex-start; }
    /* Na proporção do card do app (112×132): o que aparece aqui é o recorte que o app faz. */
    .art { position: relative; flex: none; width: 112px; height: 132px; border-radius: 18px; overflow: hidden; border: 1px dashed var(--nx-line-strong); background: repeating-linear-gradient(135deg, rgba(255, 106, 26, 0.1) 0 7px, rgba(255, 106, 26, 0.03) 7px 14px); }
    .art.has-image { border-style: solid; border-color: var(--nx-line); }
    .art img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .bar { position: absolute; left: 10px; right: 10px; bottom: 10px; height: 4px; border-radius: var(--nx-r-pill); background: rgba(255, 255, 255, 0.15); overflow: hidden; }
    .bar span { display: block; height: 100%; background: var(--nx-orange-500); transition: width 120ms linear; }
    .art-side { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
    .art-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .art-actions label { cursor: pointer; }
    .art-actions label.disabled { opacity: 0.5; pointer-events: none; }
    .hint { font-size: 11px; line-height: 1.35; color: var(--nx-text-dim); }
    .hint.spec { color: var(--nx-text-mute); }
    .hint.err { color: var(--nx-live); }
    .hint.warn { color: var(--nx-orange-500); }

    .group { display: flex; flex-direction: column; gap: 10px; }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .chip { height: 30px; padding: 0 12px; border-radius: var(--nx-r-pill); border: 1px solid var(--nx-line-strong); background: transparent; color: var(--nx-text-mute); font-family: var(--nx-font-display); font-weight: 600; font-size: 12px; cursor: pointer; }
    .chip:hover { color: var(--nx-text); }
    .chip.on { border-color: rgba(255, 106, 26, 0.6); background: rgba(255, 106, 26, 0.12); color: var(--nx-text); }

    .toggles { display: flex; flex-direction: column; gap: 8px; }
    .toggle-row { display: flex; align-items: center; gap: 14px; padding: 12px 14px; border-radius: var(--nx-r-2); background: var(--nx-surface-1); }
    .toggle-row > span { flex: 1; display: flex; flex-direction: column; gap: 2px; }
    .toggle-row strong { font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; color: var(--nx-text); }
    .dim { font-size: 11.5px; color: var(--nx-text-dim); }

    @media (max-width: 560px) {
      .head, .body, .foot { padding-left: 16px; padding-right: 16px; }
      .foot { flex-wrap: wrap; }
      .note { flex-basis: 100%; }
      .two { grid-template-columns: 1fr; }
    }
  `,
})
export class HomeBannerDrawerComponent implements OnInit {
  private readonly repository = inject(HomeBannersRepository);

  readonly mode = input.required<HomeBannerDrawerMode>();
  readonly today = input.required<string>();
  readonly stats = input<HomeBannerStats>({ seen: 0, clicked: 0, dismissed: 0 });
  /** Cards de carrossel no ar hoje, sem contar este: dá o total da prévia e o aviso de lotação. */
  readonly otherLiveCarousel = input(0);
  readonly saving = input(false);
  readonly serverError = input('');

  readonly closed = output<void>();
  readonly submitted = output<{ content: HomeBannerContent; intent: SaveIntent }>();

  protected readonly titleMax = TITLE_MAX;
  protected readonly descriptionMax = DESCRIPTION_MAX;
  protected readonly ctaMax = CTA_MAX;
  protected readonly destinations = DESTINATIONS;
  protected readonly audiences = AUDIENCES;
  protected readonly artSpec = ART_SPEC;
  protected readonly artWidth = ART_WIDTH;
  protected readonly artHeight = ART_HEIGHT;
  protected readonly num = num;
  protected readonly pct = pct;
  protected readonly formats = [
    { id: 'carousel', label: 'Carrossel · card com imagem' },
    { id: 'compact', label: 'Compacto · uma linha' },
  ] as const;

  protected readonly form = signal<HomeBannerForm>(emptyHomeBannerForm());
  /** Erros só depois da primeira tentativa de salvar; antes, o contador avisa o teto. */
  protected readonly errors = signal<HomeBannerFormErrors>({});
  protected readonly uploadProgress = signal<number | null>(null);
  protected readonly uploadError = signal('');
  protected readonly imageSize = signal<ImageSize | null>(null);

  protected readonly editing = computed(() => {
    const m = this.mode();
    return m.kind === 'edit' ? m.banner : null;
  });
  protected readonly isPublished = computed(() => this.editing()?.published === true);
  protected readonly kicker = computed(() => {
    const kind = this.mode().kind;
    return kind === 'edit' ? 'Editar banner' : kind === 'duplicate' ? 'Duplicar banner' : 'Novo banner';
  });
  protected readonly preview = computed(() => previewHomeBanner(this.form()));
  protected readonly previewTotal = computed(() =>
    this.form().format === 'carousel' ? this.otherLiveCarousel() + 1 : 1,
  );
  protected readonly publishText = computed(() => publishLabel(this.form(), this.today()));
  protected readonly busy = computed(() => this.saving() || this.uploadProgress() !== null);
  protected readonly imageWarning = computed(() => {
    const size = this.imageSize();
    if (!size || !this.form().imageUrl) {
      return null;
    }
    const check = artSizeCheck(size);
    return check.error ?? check.warning;
  });
  /** A linha do rodapé: o que falta para publicar ou, completo, onde o banner aparece. */
  protected readonly footNote = computed<{ text: string; warn: boolean }>(() => {
    const check = validateHomeBannerForm(this.form(), 'publish');
    if (!check.ok) {
      const over = Object.values(check.errors).some((e) => e?.startsWith('Até'));
      return { text: over ? 'Texto acima do limite.' : 'Para publicar: título, descrição, botão e destino.', warn: true };
    }
    if (this.form().format === 'carousel' && this.otherLiveCarousel() + 1 >= CROWDED_CAROUSEL) {
      return { text: `Carrossel com ${CROWDED_CAROUSEL}+ cards perde clique. Considere encerrar um.`, warn: true };
    }
    return { text: 'Aparece logo abaixo dos atalhos da Home.', warn: false };
  });

  ngOnInit(): void {
    const m = this.mode();
    this.form.set(m.kind === 'new' ? emptyHomeBannerForm() : formFromHomeBanner(m.banner));
  }

  protected statusMeta(b: HomeBanner): { label: string; tone: PillTone } {
    return STATUS_META[homeBannerStatus(b, this.today())];
  }

  protected patch(patch: Partial<HomeBannerForm>): void {
    this.form.update((f) => ({ ...f, ...patch }));
    const keys = Object.keys(patch);
    this.errors.update((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !keys.includes(k))));
  }

  protected close(): void {
    if (!this.saving()) {
      this.closed.emit();
    }
  }

  protected onPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) {
      void this.upload(file);
    }
  }

  protected onDrop(event: DragEvent): void {
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      event.preventDefault();
      void this.upload(file);
    }
  }

  protected onImageLoad(event: Event): void {
    const img = event.target as HTMLImageElement;
    this.imageSize.set({ width: img.naturalWidth, height: img.naturalHeight });
  }

  protected removeImage(): void {
    this.imageSize.set(null);
    this.patch({ imageUrl: null });
  }

  /** Confere tipo, bytes e pixels antes de subir: imagem pequena demais nem chega ao Storage. */
  private async upload(file: File): Promise<void> {
    if (this.uploadProgress() !== null) {
      return;
    }
    const problem = artFileError(file);
    this.uploadError.set(problem ?? '');
    if (problem) {
      return;
    }
    this.uploadProgress.set(0);
    try {
      const size = await readImageSize(file).catch(() => null);
      if (!size) {
        this.uploadError.set('Não foi possível ler a imagem. Tente outro arquivo.');
        return;
      }
      const tooSmall = artSizeCheck(size).error;
      if (tooSmall) {
        this.uploadError.set(tooSmall);
        return;
      }
      const url = await this.repository.uploadImage(file, (p) => this.uploadProgress.set(p));
      this.imageSize.set(size);
      this.patch({ imageUrl: url });
    } catch (error) {
      this.uploadError.set(`Não foi possível enviar a imagem. ${callableErrorMessage(error)}`);
    } finally {
      this.uploadProgress.set(null);
    }
  }

  protected submit(intent: SaveIntent): void {
    if (this.busy()) {
      return;
    }
    const result = validateHomeBannerForm(this.form(), intent);
    if (!result.ok) {
      this.errors.set(result.errors);
      return;
    }
    this.submitted.emit({ content: result.content, intent });
  }

  protected text(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
