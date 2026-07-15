import { ChangeDetectionStrategy, Component } from '@angular/core';
import { OgPageHeaderComponent } from '../ui/page-header.component';

/** Lista de torneios — stub mínimo; conteúdo real entra na Task 3. */
@Component({
  selector: 'og-panel-torneios',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgPageHeaderComponent],
  template: `
    <og-page-header title="Torneios" />
    <div class="og-content"></div>
  `,
})
export class PanelTorneiosComponent {}
