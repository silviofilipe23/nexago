import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { APP_LINKS } from './data/links';

@Component({
  selector: 'app-landing-footer',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './landing-footer.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingFooterComponent {
  protected readonly links = APP_LINKS;
  protected readonly year = new Date().getFullYear();
}
