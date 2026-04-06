import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from '../core/auth/auth.service';

@Component({
  selector: 'app-backoffice-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './backoffice-layout.component.html',
})
export class BackofficeLayoutComponent {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigateByUrl('/login');
  }
}
