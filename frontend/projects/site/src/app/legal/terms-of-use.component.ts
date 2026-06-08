import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-terms-of-use',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './terms-of-use.component.html',
  styleUrls: ['./legal-page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TermsOfUseComponent {
  readonly supportEmail = 'contato@nexago.com.br';
  readonly lastUpdated = '3 de junho de 2026';
}
