import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'ct-students',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p class="ct-empty">Em construção.</p>`,
})
export class StudentsComponent {}
