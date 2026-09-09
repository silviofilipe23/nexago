import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';

/** Palco do telão: a arte é desenhada num canvas lógico de tamanho fixo e este wrapper a escala
 *  pra caber no container — TV 1080p em tela cheia = escala 1, preview do painel ≈ 0.4. Mede o
 *  host com ResizeObserver e centraliza.
 *
 *  O canvas é 1920×1080 por padrão, mas é PARAMETRIZÁVEL: o telão do sorteio troca pra
 *  1080×1920 no celular em pé, onde um canvas deitado escalaria pra 375×211 e deixaria o texto
 *  em 5px. */
@Component({
  selector: 'og-telao-stage',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="og-telao-stage-box"
      [style.width.px]="canvasWidth() * scale()"
      [style.height.px]="canvasHeight() * scale()"
    >
      <div
        class="og-telao-stage-canvas"
        [style.width.px]="canvasWidth()"
        [style.height.px]="canvasHeight()"
        [style.transform]="'scale(' + scale() + ')'"
      >
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
      transform-origin: top left;
    }
  `,
})
export class TelaoStageComponent {
  /** Tamanho do canvas lógico desenhado lá dentro. */
  readonly canvasWidth = input(1920);
  readonly canvasHeight = input(1080);

  protected readonly scale = signal(1);

  constructor() {
    const el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      this.scale.set(
        Math.min(rect.width / this.canvasWidth(), rect.height / this.canvasHeight()),
      );
    };
    const observer = new ResizeObserver(update);
    observer.observe(el);
    // O observer só dispara quando o CONTAINER muda. Trocar o formato do canvas
    // (deitado ↔ em pé) não mexe no container, então precisa deste efeito —
    // sem ele o telão viraria em pé mantendo a escala do deitado.
    effect(() => {
      this.canvasWidth();
      this.canvasHeight();
      update();
    });
    inject(DestroyRef).onDestroy(() => observer.disconnect());
  }
}
