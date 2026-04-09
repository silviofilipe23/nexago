import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
})
export class HomeComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  async ngOnInit(): Promise<void> {
    await this.auth.whenReady;
    await this.auth.refreshIdToken();
    if (!this.auth.canManageUsers() && this.auth.hasRole('organizer')) {
      await this.router.navigateByUrl('/operacional', { replaceUrl: true });
    }
  }
}
