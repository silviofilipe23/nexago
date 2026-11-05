import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IconComponent } from '../../../ui/icon.component';
import type { BlockDraft } from '../data/blog-form';
import {
  BLOG_CAPTION_MAX,
  BLOG_HEADING_MAX,
  BLOG_LIST_ITEMS_MAX,
  BLOG_LIST_ITEM_MAX,
  BLOG_PARAGRAPH_MAX,
  BLOG_QUOTE_MAX,
  isVideoUrl,
  youtubeVideoId,
  type BlogBlockType,
} from '../data/blog-post';
import { BlogEmbedPreviewComponent } from './blog-embed-preview.component';
import { BlogImagePickerComponent } from './blog-image-picker.component';

export const BLOCK_LABELS: Record<BlogBlockType, string> = {
  paragraph: 'Parágrafo',
  heading: 'Subtítulo',
  list: 'Lista',
  quote: 'Destaque',
  image: 'Imagem',
  tournament: 'Torneio ou liga',
  product: 'Produto da loja',
  video: 'Vídeo',
};

/** Um bloco do corpo: o campo do tipo dele + subir, descer e remover. Texto puro. */
@Component({
  selector: 'bo-blog-block-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, BlogImagePickerComponent, BlogEmbedPreviewComponent],
  template: `
    @let b = block();
    <div class="block" [class]="'type-' + b.type">
      <div class="head">
        <span class="kind">{{ label() }}</span>
        @if (counter(); as c) {
          <span class="count" [class.near]="c.near">{{ c.text }}</span>
        }
        <span class="spacer"></span>
        @if (b.type === 'tournament' || b.type === 'product') {
          <button type="button" class="bo-mini-btn swap" [disabled]="disabled()" (click)="swap.emit()">Trocar</button>
        }
        <button type="button" class="icon-btn" [attr.aria-label]="'Subir bloco ' + (index() + 1)" [disabled]="disabled() || index() === 0" (click)="move.emit(-1)">
          <bo-icon class="up" name="chevron-down" [size]="13" />
        </button>
        <button type="button" class="icon-btn" [attr.aria-label]="'Descer bloco ' + (index() + 1)" [disabled]="disabled() || index() === total() - 1" (click)="move.emit(1)">
          <bo-icon name="chevron-down" [size]="13" />
        </button>
        <button type="button" class="icon-btn" [attr.aria-label]="'Remover bloco ' + (index() + 1)" [disabled]="disabled()" (click)="remove.emit()">
          <bo-icon name="trash" [size]="13" />
        </button>
      </div>

      @switch (b.type) {
        @case ('paragraph') {
          <textarea
            class="text paragraph"
            rows="4"
            placeholder="Escreva o parágrafo…"
            [attr.aria-label]="'Parágrafo do bloco ' + (index() + 1)"
            [attr.maxlength]="limits.paragraph"
            [value]="b.text"
            [disabled]="disabled()"
            (input)="patchText($event)"
          ></textarea>
        }
        @case ('heading') {
          <input
            class="text heading"
            placeholder="Subtítulo da seção"
            [attr.aria-label]="'Subtítulo do bloco ' + (index() + 1)"
            [attr.maxlength]="limits.heading"
            [value]="b.text"
            [disabled]="disabled()"
            (input)="patchText($event)"
          />
        }
        @case ('quote') {
          <textarea
            class="text quote"
            rows="2"
            placeholder="Uma frase que merece destaque"
            [attr.aria-label]="'Destaque do bloco ' + (index() + 1)"
            [attr.maxlength]="limits.quote"
            [value]="b.text"
            [disabled]="disabled()"
            (input)="patchText($event)"
          ></textarea>
        }
        @case ('list') {
          <div class="items">
            @for (item of b.items; track $index; let i = $index) {
              <div class="item">
                <span class="bullet"></span>
                <input
                  class="text item-input"
                  placeholder="Item da lista"
                  [attr.aria-label]="'Item ' + (i + 1) + ' do bloco ' + (index() + 1)"
                  [attr.maxlength]="limits.item"
                  [value]="item"
                  [disabled]="disabled()"
                  (input)="patchItem(i, $event)"
                  (keydown.enter)="addItem()"
                />
                <button type="button" class="icon-btn" [attr.aria-label]="'Remover item ' + (i + 1)" [disabled]="disabled() || b.items.length === 1" (click)="removeItem(i)">✕</button>
              </div>
            }
            @if (b.items.length < limits.items) {
              <button type="button" class="add-item" [disabled]="disabled()" (click)="addItem()">
                <bo-icon name="plus" [size]="12" />
                Adicionar item
              </button>
            }
          </div>
        }
        @case ('image') {
          <bo-blog-image-picker
            [url]="b.url || null"
            [height]="200"
            [disabled]="disabled()"
            alt="Imagem do post"
            (urlChange)="patchImage($event)"
            (uploading)="uploading.emit($event)"
          />
          <input
            class="text caption"
            placeholder="Legenda (opcional)"
            [attr.aria-label]="'Legenda do bloco ' + (index() + 1)"
            [attr.maxlength]="limits.caption"
            [value]="b.caption"
            [disabled]="disabled()"
            (input)="patchCaption($event)"
          />
        }
        @case ('tournament') {
          <bo-blog-embed-preview kind="tournament" [id]="b.tournamentId" />
        }
        @case ('product') {
          <bo-blog-embed-preview kind="product" [id]="b.productId" />
        }
        @case ('video') {
          <div class="video">
            @if (thumb(); as src) {
              <img class="video-thumb" [src]="src" alt="Miniatura do vídeo" />
            } @else {
              <span class="video-thumb empty"><bo-icon name="video" [size]="20" /></span>
            }
            <div class="video-fields">
              <input
                class="text mono"
                placeholder="https://youtube.com/watch?v=… ou https://instagram.com/reel/…"
                [attr.aria-label]="'Link do vídeo do bloco ' + (index() + 1)"
                [value]="b.url"
                [disabled]="disabled()"
                (input)="patchUrl($event)"
              />
              <input
                class="text caption"
                placeholder="Legenda (opcional)"
                [attr.aria-label]="'Legenda do vídeo do bloco ' + (index() + 1)"
                [attr.maxlength]="limits.caption"
                [value]="b.caption"
                [disabled]="disabled()"
                (input)="patchCaption($event)"
              />
              @if (videoProblem()) {
                <span class="hint err">Use um link do YouTube ou do Instagram (https).</span>
              } @else {
                <span class="hint">Sem player embutido: o leitor vê a miniatura e abre o vídeo fora.</span>
              }
            </div>
          </div>
        }
      }
    </div>
  `,
  styles: `
    :host { display: block; }
    .block { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px 12px; border-radius: var(--nx-r-3); border: 1px solid transparent; transition: border-color 140ms var(--nx-ease-out); }
    .block:hover, .block:focus-within { border-color: var(--nx-line); background: rgba(255, 255, 255, 0.015); }
    .head { display: flex; align-items: center; gap: 6px; min-height: 26px; }
    .kind { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .count { font-family: var(--nx-font-mono); font-size: 10px; color: var(--nx-text-dim); }
    .count.near { color: var(--nx-pending); }
    .spacer { flex: 1; }
    .icon-btn { flex: none; width: 26px; height: 26px; display: grid; place-items: center; border: 1px solid var(--nx-line); border-radius: 7px; background: transparent; color: var(--nx-text-mute); cursor: pointer; font-size: 10px; opacity: 0.55; }
    .block:hover .icon-btn, .block:focus-within .icon-btn { opacity: 1; }
    .icon-btn:hover:not(:disabled) { color: var(--nx-text); background: var(--nx-surface-2); }
    .icon-btn:disabled { opacity: 0.25 !important; cursor: default; }
    bo-icon.up { display: grid; transform: rotate(180deg); }

    .text { width: 100%; box-sizing: border-box; border: 1px solid transparent; border-radius: var(--nx-r-2); background: transparent; color: var(--nx-text); outline: none; padding: 4px 6px; font-family: var(--nx-font-ui); resize: vertical; }
    .text:hover:not(:disabled) { border-color: var(--nx-line); }
    .text:focus { border-color: rgba(255, 106, 26, 0.5); background: var(--nx-surface-1); }
    .text::placeholder { color: var(--nx-text-dim); }
    .paragraph { font-size: 15px; line-height: 1.7; color: rgba(244, 244, 245, 0.88); min-height: 72px; }
    .heading { font-family: var(--nx-font-display); font-weight: 700; font-size: 20px; letter-spacing: -0.01em; }
    .quote { font-family: var(--nx-font-display); font-weight: 600; font-size: 17px; line-height: 1.45; border-left: 3px solid var(--nx-orange-500); border-radius: 0 var(--nx-r-2) var(--nx-r-2) 0; padding-left: 14px; }
    .items { display: flex; flex-direction: column; gap: 4px; }
    .item { display: flex; align-items: center; gap: 8px; }
    .bullet { flex: none; width: 6px; height: 6px; border-radius: var(--nx-r-pill); background: var(--nx-orange-500); margin-left: 6px; }
    .item-input { font-size: 15px; line-height: 1.5; }
    .add-item { align-self: flex-start; margin-left: 20px; display: inline-flex; align-items: center; gap: 6px; padding: 4px 0; border: none; background: none; color: var(--nx-orange-500); font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; cursor: pointer; }
    .add-item:disabled { opacity: 0.5; cursor: default; }
    .caption { font-size: 13px; color: var(--nx-text-mute); }
    .mono { font-family: var(--nx-font-mono); font-size: 12.5px; }
    .swap { height: 26px; padding: 0 10px; font-size: 12px; }
    .video { display: flex; gap: 12px; align-items: flex-start; }
    .video-thumb { flex: none; width: 128px; height: 72px; border-radius: var(--nx-r-2); object-fit: cover; background: var(--nx-surface-2); }
    .video-thumb.empty { display: grid; place-items: center; color: var(--nx-text-dim); }
    .video-fields { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
    .hint { padding: 0 6px; font-size: 11.5px; color: var(--nx-text-dim); }
    .hint.err { color: var(--nx-live); }
  `,
})
export class BlogBlockEditorComponent {
  readonly block = input.required<BlockDraft>();
  readonly index = input.required<number>();
  readonly total = input.required<number>();
  readonly disabled = input(false);

  readonly changed = output<BlockDraft>();
  readonly move = output<-1 | 1>();
  readonly remove = output<void>();
  readonly uploading = output<boolean>();
  /** Bloco de torneio/produto: abrir o seletor para trocar o escolhido. */
  readonly swap = output<void>();

  protected readonly limits = {
    paragraph: BLOG_PARAGRAPH_MAX,
    heading: BLOG_HEADING_MAX,
    quote: BLOG_QUOTE_MAX,
    item: BLOG_LIST_ITEM_MAX,
    items: BLOG_LIST_ITEMS_MAX,
    caption: BLOG_CAPTION_MAX,
  };

  protected readonly label = computed(() => BLOCK_LABELS[this.block().type]);

  protected readonly thumb = computed(() => {
    const b = this.block();
    const id = b.type === 'video' ? youtubeVideoId(b.url.trim()) : null;
    return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
  });

  protected readonly videoProblem = computed(() => {
    const b = this.block();
    return b.type === 'video' && b.url.trim() !== '' && !isVideoUrl(b.url.trim());
  });

  /** Contador de caracteres dos blocos de texto; acende perto do limite. */
  protected readonly counter = computed(() => {
    const b = this.block();
    const max =
      b.type === 'paragraph' ? BLOG_PARAGRAPH_MAX : b.type === 'heading' ? BLOG_HEADING_MAX : b.type === 'quote' ? BLOG_QUOTE_MAX : null;
    if (max === null || !('text' in b)) {
      return b.type === 'list' ? { text: `${b.items.length} de ${BLOG_LIST_ITEMS_MAX} itens`, near: b.items.length >= BLOG_LIST_ITEMS_MAX } : null;
    }
    return { text: `${b.text.length} de ${max}`, near: b.text.length >= max * 0.9 };
  });

  private value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
  }

  protected patchText(event: Event): void {
    const b = this.block();
    if (b.type === 'paragraph' || b.type === 'heading' || b.type === 'quote') {
      this.changed.emit({ ...b, text: this.value(event) });
    }
  }

  protected patchItem(i: number, event: Event): void {
    const b = this.block();
    if (b.type === 'list') {
      this.changed.emit({ ...b, items: b.items.map((item, j) => (j === i ? this.value(event) : item)) });
    }
  }

  protected addItem(): void {
    const b = this.block();
    if (b.type === 'list' && b.items.length < BLOG_LIST_ITEMS_MAX) {
      this.changed.emit({ ...b, items: [...b.items, ''] });
    }
  }

  protected removeItem(i: number): void {
    const b = this.block();
    if (b.type === 'list' && b.items.length > 1) {
      this.changed.emit({ ...b, items: b.items.filter((_, j) => j !== i) });
    }
  }

  protected patchImage(url: string | null): void {
    const b = this.block();
    if (b.type === 'image') {
      this.changed.emit({ ...b, url: url ?? '' });
    }
  }

  protected patchUrl(event: Event): void {
    const b = this.block();
    if (b.type === 'video') {
      this.changed.emit({ ...b, url: this.value(event) });
    }
  }

  protected patchCaption(event: Event): void {
    const b = this.block();
    if (b.type === 'image' || b.type === 'video') {
      this.changed.emit({ ...b, caption: this.value(event) });
    }
  }
}
