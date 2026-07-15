import { ChangeDetectionStrategy, Component } from '@angular/core';
import { OgPageHeaderComponent } from '../ui/page-header.component';

/** Lista de ligas — stub mínimo; conteúdo real entra na Task 4. */
@Component({
  selector: 'og-panel-ligas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgPageHeaderComponent],
  template: `
    <og-page-header title="Ligas" />
    <div class="og-content"></div>
  `,
})
export class PanelLigasComponent {}
