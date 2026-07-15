import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { PillTone } from '../data/mock-data';

/** Selo de status colorido por tom semântico (laranja/verde/amarelo/vermelho/neutro). */
@Component({
  selector: 'og-pill',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'og-pill',
    '[class.og-pill-green]': 'tone() === "green"',
    '[class.og-pill-yellow]': 'tone() === "yellow"',
    '[class.og-pill-red]': 'tone() === "red"',
    '[class.og-pill-dim]': 'tone() === "dim"',
  },
  template: `<ng-content />`,
})
export class OgPillComponent {
  readonly tone = input<PillTone>('orange');
}
