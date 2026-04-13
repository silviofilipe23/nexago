import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { APP_LINKS } from './data/links';

@Component({
  selector: 'app-landing-header',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './landing-header.component.html',
  styleUrl: './landing-header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingHeaderComponent {
  protected readonly links = APP_LINKS;
}
