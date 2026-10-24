import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input } from '@angular/core';
import { parseBlocks } from '../../domain/contracts';
import { CenterAvatarComponent } from '../../shell/center-avatar.component';

export interface PaperSignature {
  name: string;
  sub: string;
}

/**
 * Folha do contrato (CtDocPaper): papel claro dentro da UI escura. O texto vem em blocos (`# `
 * = título; linha em branco = parágrafo). Estilos em `styles.scss` (`.ct-paper*`), porque a
 * impressão copia esta folha pra fora do app.
 */
@Component({
  selector: 'ct-contract-paper',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CenterAvatarComponent],
  host: { style: 'display:block;min-width:0' },
  template: `
    <article class="ct-paper">
      <header class="ct-paper-head">
        <ct-center-avatar [id]="centerId()" [name]="centerName() || 'Centro'" [size]="30" />
        <div class="ct-grow">
          <div class="ct-paper-title">{{ title() }}</div>
          @if (meta()) {
            <div class="ct-paper-meta">{{ meta() }}</div>
          }
        </div>
      </header>
      @for (b of blocks(); track $index) {
        @if (b.kind === 'title') {
          <div class="ct-paper-h">{{ b.text }}</div>
        } @else {
          <p class="ct-paper-p">{{ b.text }}</p>
        }
      } @empty {
        <div class="ct-paper-empty">{{ emptyText() }}</div>
      }
      @if (signatures().length) {
        <div class="ct-paper-signs">
          @for (s of signatures(); track $index) {
            <div>
              <div class="ct-paper-sign-name">{{ s.name }}</div>
              <div class="ct-paper-sign-sub">{{ s.sub }}</div>
            </div>
          }
        </div>
      }
      @if (footer()) {
        <div class="ct-paper-foot">{{ footer() }}</div>
      }
    </article>
  `,
})
export class ContractPaperComponent {
  readonly body = input.required<string>();
  readonly title = input.required<string>();
  readonly meta = input('');
  readonly centerId = input('');
  readonly centerName = input('');
  readonly signatures = input<PaperSignature[]>([]);
  readonly footer = input('');
  readonly emptyText = input('Sem texto.');

  /** Elemento da folha (pra imprimir). */
  readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly blocks = computed(() => parseBlocks(this.body()));
}
