import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  input,
  output,
  viewChild,
} from '@angular/core';

/**
 * Foto de uma pessoa ampliada, inteira. O pai monta com `@if` e desmonta no
 * `dismissed`. Usa <dialog> nativo, como o `bo-confirm-dialog`: Esc, backdrop e
 * devolução de foco saem de graça.
 */
@Component({
  selector: 'bo-photo-viewer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog
      #dialog
      [attr.aria-label]="'Foto de ' + name()"
      (cancel)="onEscape($event)"
      (click)="onBackdropClick($event)"
    >
      <div class="frame">
        <img [src]="src()" [alt]="'Foto de ' + name()" />
        <button type="button" class="close" aria-label="Fechar foto" (click)="close()">✕</button>
      </div>
      <div class="caption">
        <div class="name">{{ name() }}</div>
        @if (nickname()) {
          <div class="nick">“{{ nickname() }}”</div>
        }
        @if (detail()) {
          <div class="detail">{{ detail() }}</div>
        }
      </div>
    </dialog>
  `,
  styles: `
    dialog {
      width: min(560px, calc(100vw - 32px));
      padding: 0;
      border: 1px solid var(--nx-line-strong);
      border-radius: var(--nx-r-4);
      background: var(--nx-surface-0);
      color: var(--nx-text);
      overflow: hidden;
    }

    dialog::backdrop {
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(2px);
    }

    /* Altura explícita + imagem absoluta: com a altura vinda de aspect-ratio,
       o height: 100% da imagem não resolve e ela invade a legenda. */
    .frame {
      position: relative;
      height: min(560px, calc(100vh - 160px));
      background: #000;
    }

    /* contain, não cover: o avatar já mostra o recorte redondo; ampliar serve
       justamente para ver o que o círculo cortou. */
    .frame img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    .close {
      position: absolute;
      top: 10px;
      right: 10px;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      border: 1px solid rgba(255, 255, 255, 0.16);
      background: rgba(0, 0, 0, 0.6);
      color: #fff;
      font: inherit;
      font-size: 13px;
      cursor: pointer;
    }

    .close:hover {
      background: rgba(0, 0, 0, 0.8);
    }

    .caption {
      padding: 14px 18px 16px;
      display: flex;
      flex-direction: column;
      gap: 3px;
      min-width: 0;
    }

    .name {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 15px;
    }

    .nick {
      font-size: 13px;
      color: var(--nx-orange-500);
    }

    .detail {
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      color: var(--nx-text-dim);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `,
})
export class PhotoViewerComponent {
  readonly src = input.required<string>();
  readonly name = input.required<string>();
  readonly nickname = input<string | null>(null);
  /** Linha discreta embaixo (e-mail, UID…). */
  readonly detail = input<string | null>(null);

  readonly dismissed = output<void>();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    afterNextRender(() => this.dialog().nativeElement.showModal());
  }

  /**
   * Fecha o <dialog> antes de avisar o pai: é o `close()` que devolve o foco ao
   * avatar clicado — só desmontar pelo `@if` deixaria o foco perdido.
   */
  protected close(): void {
    const el = this.dialog().nativeElement;
    if (el.open) {
      el.close();
    }
    this.dismissed.emit();
  }

  /** Esc nativo: segue pelo mesmo caminho do botão. */
  protected onEscape(event: Event): void {
    event.preventDefault();
    this.close();
  }

  /** Clique no backdrop chega no próprio <dialog>, não no conteúdo. */
  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) {
      this.close();
    }
  }
}
