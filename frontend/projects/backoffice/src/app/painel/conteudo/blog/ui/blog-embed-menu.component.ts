import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { IconComponent } from '../../../ui/icon.component';
import { BLOG_EMBEDS_MAX } from '../data/blog-post';

export type BlogEmbedChoice = 'tournament' | 'product' | 'arena' | 'ranking' | 'video';

/** Botão "Bloco nexaGO" da barra de adicionar, com o menu Torneio / Produto / Vídeo. */
@Component({
  selector: 'bo-blog-embed-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'open.set(false)',
  },
  template: `
    <button
      type="button"
      class="trigger"
      aria-haspopup="menu"
      [attr.aria-expanded]="open()"
      [disabled]="disabled()"
      (click)="open.set(!open())"
    >
      <bo-icon name="plus" [size]="12" />
      Bloco nexaGO
    </button>
    @if (open()) {
      <div class="menu" role="menu" aria-label="Inserir bloco nexaGO">
        <span class="title">Inserir bloco nexaGO</span>
        <button type="button" role="menuitem" class="item" [disabled]="embedsFull()" (click)="pick('tournament')">
          <bo-icon name="trophy" [size]="16" />
          <span><strong>Torneio ou liga</strong><span>Card com inscrição ao vivo</span></span>
        </button>
        <button type="button" role="menuitem" class="item" [disabled]="embedsFull()" (click)="pick('product')">
          <bo-icon name="bag" [size]="16" />
          <span><strong>Produto da loja</strong><span>Preço e estoque atualizados</span></span>
        </button>
        <button type="button" role="menuitem" class="item" [disabled]="embedsFull()" (click)="pick('arena')">
          <bo-icon name="arena" [size]="16" />
          <span><strong>Arena</strong><span>Horários livres e botão reservar</span></span>
        </button>
        <button type="button" role="menuitem" class="item" [disabled]="embedsFull()" (click)="pick('ranking')">
          <bo-icon name="star" [size]="16" />
          <span><strong>Ranking</strong><span>Top 5 de uma categoria</span></span>
        </button>
        <button type="button" role="menuitem" class="item" (click)="pick('video')">
          <bo-icon name="video" [size]="16" />
          <span><strong>Vídeo</strong><span>YouTube ou Instagram</span></span>
        </button>
        @if (embedsFull()) {
          <span class="note">Até {{ max }} blocos nexaGO (torneio, produto, arena, ranking) por post.</span>
        }
      </div>
    }
  `,
  styles: `
    :host { position: relative; display: inline-block; }
    .trigger { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 11px; border-radius: 8px; border: none; background: rgba(255, 106, 26, 0.12); color: var(--nx-orange-400); font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; cursor: pointer; }
    .trigger:hover:not(:disabled) { background: rgba(255, 106, 26, 0.2); }
    .trigger:disabled { opacity: 0.4; cursor: default; }
    .menu { position: absolute; z-index: 5; left: 0; bottom: calc(100% + 6px); width: 260px; display: flex; flex-direction: column; gap: 2px; padding: 8px; border-radius: var(--nx-r-3); border: 1px solid var(--nx-line-strong); background: var(--nx-surface-0); box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5); }
    .title { padding: 4px 8px 6px; font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .item { display: flex; align-items: center; gap: 10px; padding: 8px; border: none; border-radius: var(--nx-r-2); background: transparent; color: var(--nx-orange-500); text-align: left; cursor: pointer; }
    .item:hover:not(:disabled) { background: var(--nx-surface-1); }
    .item:disabled { opacity: 0.4; cursor: default; }
    .item > span { display: flex; flex-direction: column; gap: 1px; }
    .item strong { font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; color: var(--nx-text); }
    .item span span { font-size: 11.5px; color: var(--nx-text-dim); }
    .note { padding: 4px 8px; font-size: 11.5px; color: var(--nx-pending); }
  `,
})
export class BlogEmbedMenuComponent {
  readonly disabled = input(false);
  /** Já há `BLOG_EMBEDS_MAX` blocos nexaGO: só o vídeo continua. */
  readonly embedsFull = input(false);
  readonly chosen = output<BlogEmbedChoice>();

  protected readonly open = signal(false);
  protected readonly max = BLOG_EMBEDS_MAX;

  protected pick(choice: BlogEmbedChoice): void {
    this.open.set(false);
    this.chosen.emit(choice);
  }

  /** Clique fora do menu fecha o menu. */
  protected onDocumentClick(event: MouseEvent): void {
    if (this.open() && !(event.target as Element | null)?.closest?.('bo-blog-embed-menu')) {
      this.open.set(false);
    }
  }
}
