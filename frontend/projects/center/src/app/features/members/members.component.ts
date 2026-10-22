import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'ct-members',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p class="ct-empty">Em construção.</p>`,
})
export class MembersComponent {}
