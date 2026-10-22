import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'ct-classes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p class="ct-empty">Em construção.</p>`,
})
export class ClassesComponent {}
