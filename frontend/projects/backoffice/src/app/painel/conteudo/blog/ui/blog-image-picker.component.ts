import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { callableErrorMessage } from '../../../data/callable-error';
import { readImageSize, type ImageSize } from '../../../loja/campanhas/data/campaign-image';
import { IconComponent } from '../../../ui/icon.component';
import { BLOG_IMAGE_SPECS, blogImageFileError, blogImageWarning, type BlogImageKind } from '../data/blog-image';
import { BlogPostsRepository } from '../data/blog-posts.repository';

/**
 * Área de imagem do blog (capa, bloco de imagem ou foto do autor): arrastar ou escolher, sobe para
 * `blog/` e devolve a URL. Confere tipo e bytes antes de subir; mostra sempre o tamanho recomendado
 * do `kind` e avisa (sem barrar) imagem pequena ou fora da proporção.
 */
@Component({
  selector: 'bo-blog-image-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div
      class="area"
      [class.has-image]="url()"
      [style.height.px]="height()"
      (dragover)="$event.preventDefault()"
      (drop)="onDrop($event)"
    >
      @if (url(); as src) {
        <img [src]="src" [alt]="alt()" (load)="onImageLoad($event)" />
      } @else {
        <div class="empty">
          <ng-content />
          <span class="drop">Arraste uma imagem aqui</span>
        </div>
      }
      @if (progress() !== null) {
        <div class="bar" aria-label="Enviando imagem"><span [style.width.%]="progress()"></span></div>
      }
      <div class="actions">
        <label class="bo-mini-btn" [class.disabled]="busy()">
          <bo-icon name="camera" [size]="13" />
          {{ url() ? replaceLabel() : pickLabel() }}
          <input type="file" hidden accept="image/jpeg,image/png,image/webp" [disabled]="busy()" (change)="onPick($event)" />
        </label>
        @if (url()) {
          <button type="button" class="bo-mini-btn" [disabled]="busy()" (click)="clear()">Remover</button>
        }
      </div>
    </div>
    @if (specText()) {
      <span class="hint">{{ specText() }}</span>
    }
    @if (error(); as err) {
      <span class="hint err" role="alert">{{ err }}</span>
    } @else if (warning(); as warn) {
      <span class="hint warn">{{ warn }}</span>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 6px; }
    .area { position: relative; border-radius: var(--nx-r-3); overflow: hidden; border: 1px dashed var(--nx-line-strong); background: repeating-linear-gradient(135deg, rgba(255, 106, 26, 0.08) 0 9px, rgba(255, 106, 26, 0.02) 9px 18px); }
    .area.has-image { border-style: solid; border-color: var(--nx-line); background: var(--nx-surface-1); }
    .area img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .empty { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 0 16px 40px; text-align: center; }
    .drop { font-family: var(--nx-font-mono); font-size: 9.5px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--nx-text-dim); }
    .actions { position: absolute; right: 12px; bottom: 12px; display: flex; gap: 8px; }
    .actions label { cursor: pointer; }
    .actions label.disabled { opacity: 0.5; pointer-events: none; }
    .bar { position: absolute; left: 12px; right: 12px; top: 12px; height: 4px; border-radius: var(--nx-r-pill); background: rgba(255, 255, 255, 0.15); overflow: hidden; }
    .bar span { display: block; height: 100%; background: var(--nx-orange-500); transition: width 120ms linear; }
    .hint { font-size: 11.5px; line-height: 1.4; color: var(--nx-text-dim); }
    .hint.err { color: var(--nx-live); }
    .hint.warn { color: var(--nx-pending); }
  `,
})
export class BlogImagePickerComponent {
  private readonly repository = inject(BlogPostsRepository);

  readonly url = input<string | null>(null);
  readonly alt = input('');
  readonly height = input(180);
  /** Onde a imagem aparece: decide a dica de tamanho e o aviso. */
  readonly kind = input<BlogImageKind>('body');
  /** Dica própria; vazio = a do `kind`. */
  readonly spec = input('');
  readonly pickLabel = input('Enviar imagem');
  readonly replaceLabel = input('Trocar');
  readonly disabled = input(false);

  readonly urlChange = output<string | null>();
  /** Avisa o pai que há envio em andamento (para travar o save). */
  readonly uploading = output<boolean>();

  protected readonly progress = signal<number | null>(null);
  protected readonly error = signal('');
  private readonly size = signal<ImageSize | null>(null);

  protected readonly busy = computed(() => this.disabled() || this.progress() !== null);
  protected readonly specText = computed(() => this.spec() || BLOG_IMAGE_SPECS[this.kind()]);
  protected readonly warning = computed(() => {
    const size = this.size();
    return size && this.url() ? blogImageWarning(size, this.kind()) : null;
  });

  protected onPick(event: Event): void {
    const el = event.target as HTMLInputElement;
    const file = el.files?.[0];
    el.value = '';
    if (file) {
      void this.upload(file);
    }
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file && !this.busy()) {
      void this.upload(file);
    }
  }

  protected onImageLoad(event: Event): void {
    const img = event.target as HTMLImageElement;
    this.size.set({ width: img.naturalWidth, height: img.naturalHeight });
  }

  protected clear(): void {
    this.size.set(null);
    this.error.set('');
    this.urlChange.emit(null);
  }

  private async upload(file: File): Promise<void> {
    if (this.progress() !== null) {
      return;
    }
    const problem = blogImageFileError(file);
    this.error.set(problem ?? '');
    if (problem) {
      return;
    }
    this.progress.set(0);
    this.uploading.emit(true);
    try {
      const size = await readImageSize(file).catch(() => null);
      if (!size) {
        this.error.set('Não foi possível ler a imagem. Tente outro arquivo.');
        return;
      }
      const url = await this.repository.uploadImage(file, (p) => this.progress.set(p));
      this.size.set(size);
      this.urlChange.emit(url);
    } catch (error) {
      this.error.set(`Não foi possível enviar a imagem. ${callableErrorMessage(error)}`);
    } finally {
      this.progress.set(null);
      this.uploading.emit(false);
    }
  }
}
