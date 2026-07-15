import { ChangeDetectionStrategy, Component } from '@angular/core';
import { OgPageHeaderComponent } from '../ui/page-header.component';

/** Detalhe de torneio — stub mínimo; conteúdo real entra na Task 3. */
@Component({
  selector: 'og-torneio-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgPageHeaderComponent],
  template: `
    <og-page-header title="Torneio" />
    <div class="og-content"></div>
  `,
})
export class TorneioDetailComponent {}
