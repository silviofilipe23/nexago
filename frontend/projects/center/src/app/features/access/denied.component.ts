import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'ct-denied',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p class="ct-empty">Em construção.</p>`,
})
export class DeniedComponent {}
