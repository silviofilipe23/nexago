import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { IconComponent } from '../ui/icon.component';
import { ModalComponent } from '../ui/modal.component';
import { ToggleComponent } from '../ui/toggle.component';
import {
  BOOKING_STORY_THEMES,
  bookingStoryPhotoError,
  type BookingStory,
  type BookingStoryOptions,
  type BookingStoryTheme,
} from './booking-story';
import {
  STORY_HEIGHT,
  STORY_WIDTH,
  bookingStoryPng,
  drawBookingStory,
  loadBookingStoryAssets,
  loadBookingStoryCrewPhotos,
  loadBookingStoryPhoto,
} from './booking-story-card';

/** Compartilhar arquivo pela Web Share API: celular, Safari e Chrome/Edge no Windows. No Chrome
 *  de Mac/Linux não existe, e aí sobra o download. */
export function supportsFileShare(): boolean {
  try {
    return (
      typeof navigator !== 'undefined' &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [new File([new Blob()], 'story.png', { type: 'image/png' })] })
    );
  } catch {
    return false;
  }
}

type CoverState = 'none' | 'loading' | 'ready' | 'failed';

/**
 * "Compartilhar no story" da reserva: a arte 9:16 (1080×1920) do jogo marcado na arena, com
 * fundo, jogadores e modalidade escolhidos pela equipe.
 *
 * O PNG é gerado quando os ajustes mudam, não no clique: o Safari só abre a folha de
 * compartilhar se o `navigator.share` sair no mesmo gesto, sem `await` antes. Sem folha nativa
 * (Chrome no Mac/Linux), sobra baixar o PNG.
 */
@Component({
  selector: 'ar-booking-story-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent, IconComponent, ToggleComponent],
  template: `
    <ar-modal size="lg" (close)="close.emit()">
      <h2 class="title">Compartilhar no story</h2>
      <p class="sub">Arte vertical 9:16 (1080×1920), no tamanho do story do Instagram.</p>

      <div class="layout">
        <div class="preview" [class.busy]="rendering()">
          @if (previewUrl(); as url) {
            <img [src]="url" [width]="width" [height]="height" alt="Prévia do story da reserva" data-testid="story-preview" />
          } @else {
            <div class="placeholder">Gerando a arte…</div>
          }
        </div>

        <div class="controls">
          <div class="field-label">Fundo</div>
          <div class="chips" role="radiogroup" aria-label="Fundo da arte">
            @for (t of themes(); track t.id) {
              <button
                type="button"
                class="ar-chip"
                role="radio"
                [attr.aria-checked]="theme() === t.id"
                [class.active]="theme() === t.id"
                [attr.data-testid]="'theme-' + t.id"
                (click)="pickTheme(t.id)"
              >
                {{ t.label }}
              </button>
            }
          </div>
          <input
            #photoInput
            type="file"
            accept="image/*"
            hidden
            data-testid="photo-input"
            (change)="onPhotoPicked($event)"
          />
          @if (theme() === 'photo' && photo()) {
            <div class="photo-row">
              <span class="hint flush">A imagem fica só neste navegador: não sobe para o nexaGO.</span>
              <button type="button" class="ar-ghost-btn" (click)="openPhotoPicker()">
                <ar-icon name="image" [size]="14" />
                Trocar foto
              </button>
            </div>
          }
          @if (photoError(); as err) {
            <p class="hint warn" role="alert">{{ err }}</p>
          }
          @if (coverState() === 'failed') {
            <p class="hint">A capa da arena não carregou para a arte. Use um dos fundos.</p>
          }

          @if (story().crew.length > 0) {
            <div class="toggle-row">
              <div>
                <div class="toggle-title">Jogadores</div>
                <div class="hint flush">Só o primeiro nome e a foto do perfil.</div>
              </div>
              <ar-toggle [checked]="showCrew()" label="Mostrar jogadores" (changed)="showCrew.set($event)" />
            </div>
          }
          @if (story().sportLabel) {
            <div class="toggle-row">
              <div class="toggle-title">Modalidade</div>
              <ar-toggle [checked]="showSport()" label="Mostrar modalidade" (changed)="showSport.set($event)" />
            </div>
          }

          @if (error(); as err) {
            <div class="error-banner" role="alert">{{ err }}</div>
          }
          @if (done(); as msg) {
            <div class="success-banner" role="status">{{ msg }}</div>
          }

          <div class="modal-actions">
            <button type="button" class="ar-mini-btn" [disabled]="!blob()" (click)="download()">
              <ar-icon name="download" [size]="14" />
              Baixar PNG
            </button>
            @if (canShareFiles) {
              <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="!blob()" (click)="share()">
                <ar-icon name="share" [size]="14" />
                Compartilhar
              </button>
            }
          </div>
        </div>
      </div>
    </ar-modal>
  `,
  styles: `
    @use 'breakpoints' as ar;

    .title {
      margin: 0;
      font-family: var(--nx-font-display);
      font-size: 18px;
      font-weight: 700;
      color: var(--nx-text);
    }

    .sub {
      margin: 4px 0 18px;
      font-size: 13px;
      color: var(--nx-text-mute);
    }

    .layout {
      display: grid;
      grid-template-columns: 220px 1fr;
      gap: 20px;
      align-items: start;
    }

    .preview {
      aspect-ratio: 9 / 16;
      border-radius: var(--nx-r-3);
      overflow: hidden;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      transition: opacity 140ms var(--nx-ease-out);
    }

    .preview.busy {
      opacity: 0.6;
    }

    .preview img {
      display: block;
      width: 100%;
      height: 100%;
    }

    .placeholder {
      height: 100%;
      display: grid;
      place-items: center;
      font-size: 12.5px;
      color: var(--nx-text-mute);
    }

    .field-label {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--nx-text-mute);
      margin-bottom: 8px;
    }

    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .toggle-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 0 0;
      margin-top: 14px;
      border-top: 1px solid var(--nx-line);
    }

    .toggle-title {
      font-size: 13.5px;
      font-weight: 600;
      color: var(--nx-text);
    }

    .hint {
      margin: 8px 0 0;
      font-size: 12px;
      color: var(--nx-text-mute);
    }

    .hint.flush {
      margin: 2px 0 0;
    }

    .hint.warn {
      color: var(--nx-live);
    }

    .photo-row .ar-ghost-btn {
      flex: none;
      white-space: nowrap;
    }

    .photo-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-top: 10px;
    }

    .error-banner,
    .success-banner {
      margin-top: 14px;
      padding: 10px 12px;
      border-radius: var(--nx-r-2);
      font-size: 12.5px;
    }

    .error-banner {
      border: 1px solid var(--nx-live);
      background: rgba(255, 59, 48, 0.08);
      color: var(--nx-live);
    }

    .success-banner {
      border: 1px solid var(--nx-win);
      background: rgba(47, 179, 107, 0.1);
      color: var(--nx-text);
    }

    .modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 20px;
    }

    @include ar.below(sm) {
      .layout {
        grid-template-columns: 1fr;
      }

      .preview {
        width: min(220px, 60vw);
        justify-self: center;
      }
    }
  `,
})
export class BookingStoryDialogComponent {
  private readonly destroyRef = inject(DestroyRef);

  readonly story = input.required<BookingStory>();
  /** Capa da arena (`coverUrl`): vira o fundo "Capa da arena" quando carrega no canvas. */
  readonly coverUrl = input<string | null>(null);
  readonly fileName = input.required<string>();
  readonly close = output<void>();

  protected readonly width = STORY_WIDTH;
  protected readonly height = STORY_HEIGHT;
  protected readonly canShareFiles = supportsFileShare();

  protected readonly theme = signal<BookingStoryTheme>('night');
  protected readonly showCrew = signal(true);
  protected readonly showSport = signal(true);

  private readonly cover = signal<HTMLImageElement | null>(null);
  /** Imagem que a equipe escolheu para o fundo "Sua foto" (object URL local, revogado ao trocar). */
  protected readonly photo = signal<HTMLImageElement | null>(null);
  private photoObjectUrl: string | null = null;
  protected readonly photoError = signal<string | null>(null);
  private readonly photoInput = viewChild<ElementRef<HTMLInputElement>>('photoInput');
  protected readonly coverState = signal<CoverState>('none');
  /** Só oferece a capa quando ela carregou com CORS (senão o PNG não sai). */
  protected readonly themes = computed(() =>
    BOOKING_STORY_THEMES.filter((t) => t.id !== 'cover' || this.coverState() === 'ready'),
  );

  protected readonly blob = signal<Blob | null>(null);
  protected readonly previewUrl = signal<string | null>(null);
  protected readonly rendering = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly done = signal<string | null>(null);

  /** Cada desenho ganha um número: o que termina depois de outra troca de ajuste é descartado. */
  private generation = 0;

  constructor() {
    effect(() => {
      const url = this.coverUrl()?.trim();
      if (!url) {
        this.coverState.set('none');
        return;
      }
      this.coverState.set('loading');
      void loadBookingStoryPhoto(url).then((img) => {
        if (url !== this.coverUrl()?.trim()) return;
        this.cover.set(img);
        this.coverState.set(img ? 'ready' : 'failed');
        // A capa é a cara da arena: vira o fundo padrão quando chega.
        if (img && this.theme() === 'night') this.theme.set('cover');
      });
    });

    effect(() => {
      const options: BookingStoryOptions = { theme: this.theme(), showCrew: this.showCrew(), showSport: this.showSport() };
      const story = this.story();
      const backdrop = options.theme === 'cover' ? this.cover() : options.theme === 'photo' ? this.photo() : null;
      if ((options.theme === 'cover' || options.theme === 'photo') && !backdrop) return;
      void this.render(story, options, backdrop, ++this.generation);
    });

    this.destroyRef.onDestroy(() => {
      this.generation++;
      const url = this.previewUrl();
      if (url) URL.revokeObjectURL(url);
      if (this.photoObjectUrl) URL.revokeObjectURL(this.photoObjectUrl);
    });
  }

  private async render(
    story: BookingStory,
    options: BookingStoryOptions,
    backdrop: HTMLImageElement | null,
    generation: number,
  ): Promise<void> {
    this.rendering.set(true);
    this.done.set(null);
    try {
      const [assets, photos] = await Promise.all([
        loadBookingStoryAssets(),
        options.showCrew ? loadBookingStoryCrewPhotos(story.crew) : Promise.resolve(new Map()),
      ]);
      if (generation !== this.generation) return;
      const canvas = document.createElement('canvas');
      canvas.width = STORY_WIDTH;
      canvas.height = STORY_HEIGHT;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas sem contexto 2d');
      drawBookingStory(ctx, story, options, assets, { backdrop, photos });
      const blob = await bookingStoryPng(canvas);
      if (!blob) throw new Error('canvas sem PNG');
      if (generation !== this.generation) return;
      const previous = this.previewUrl();
      this.blob.set(blob);
      this.previewUrl.set(URL.createObjectURL(blob));
      if (previous) URL.revokeObjectURL(previous);
      this.error.set(null);
    } catch {
      if (generation === this.generation) this.error.set('Não foi possível gerar a arte. Feche e abra de novo.');
    } finally {
      if (generation === this.generation) this.rendering.set(false);
    }
  }

  /** "Sua foto" sem imagem ainda abre o seletor; o fundo só muda quando a imagem carrega. */
  protected pickTheme(theme: BookingStoryTheme): void {
    if (theme === 'photo' && !this.photo()) {
      this.openPhotoPicker();
      return;
    }
    this.theme.set(theme);
  }

  protected openPhotoPicker(): void {
    this.photoInput()?.nativeElement.click();
  }

  protected async onPhotoPicked(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Limpa o input: escolher o mesmo arquivo de novo dispara o `change` outra vez.
    input.value = '';
    if (!file) return;
    const invalid = bookingStoryPhotoError(file);
    if (invalid) {
      this.photoError.set(invalid);
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch {
      URL.revokeObjectURL(url);
      this.photoError.set('Não foi possível abrir essa imagem. Tente uma foto em JPG ou PNG.');
      return;
    }
    if (this.photoObjectUrl) URL.revokeObjectURL(this.photoObjectUrl);
    this.photoObjectUrl = url;
    this.photoError.set(null);
    this.photo.set(img);
    this.theme.set('photo');
  }

  /** `navigator.share` sai antes de qualquer `await` — o Safari recusa fora do gesto. */
  protected share(): void {
    const blob = this.blob();
    if (!blob) return;
    const file = new File([blob], this.fileName(), { type: 'image/png' });
    if (!navigator.canShare?.({ files: [file] })) {
      this.download();
      return;
    }
    this.error.set(null);
    navigator
      .share({ files: [file] })
      .then(() => this.done.set('Pronto! No Instagram, escolha “Story” para publicar.'))
      .catch((err: unknown) => {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          this.error.set('Não foi possível compartilhar. Baixe o PNG.');
        }
      });
  }

  protected download(): void {
    const url = this.previewUrl();
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = this.fileName();
    a.click();
    this.done.set('PNG baixado. Passe para o celular e publique como story no Instagram.');
  }
}
