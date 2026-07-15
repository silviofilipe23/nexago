import { ChangeDetectionStrategy, Component } from '@angular/core';
import { OgPageHeaderComponent } from '../ui/page-header.component';

/** Detalhe de liga — stub mínimo; conteúdo real entra na Task 4. */
@Component({
  selector: 'og-liga-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgPageHeaderComponent],
  template: `
    <og-page-header title="Liga" />
    <div class="og-content"></div>
  `,
})
export class LigaDetailComponent {}
