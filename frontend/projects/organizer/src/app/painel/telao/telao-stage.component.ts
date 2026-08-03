import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, signal } from '@angular/core';

/** Palco do telão: a arte é desenhada num canvas lógico fixo de 1920×1080
 *  (`TelaoScreenComponent`) e este wrapper a escala pra caber no container — TV 1080p em tela
 *  cheia = escala 1, preview do painel ≈ 0.4. Mede o host com ResizeObserver e centraliza. */
@Component({
  selector: 'og-telao-stage',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="og-telao-stage-box" [style.width.px]="1920 * scale()" [style.height.px]="1080 * scale()">
      <div class="og-telao-stage-canvas" [style.transform]="'scale(' + scale() + ')'">
        <ng-content />
      </div>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      min-width: 0;
      min-height: 0;
    }
    .og-telao-stage-box {
      position: relative;
      overflow: hidden;
      border-radius: inherit;
    }
    .og-telao-stage-canvas {
      position: absolute;
      top: 0;
      left: 0;
      width: 1920px;
      height: 1080px;
      transform-origin: top left;
    }
  `,
})
export class TelaoStageComponent {
  protected readonly scale = signal(1);

  constructor() {
    const el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) this.scale.set(Math.min(rect.width / 1920, rect.height / 1080));
    };
    const observer = new ResizeObserver(update);
    observer.observe(el);
    update();
    inject(DestroyRef).onDestroy(() => observer.disconnect());
  }
}
