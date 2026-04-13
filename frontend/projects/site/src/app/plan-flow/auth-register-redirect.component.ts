import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';

/**
 * Redireciona /auth/register → /entrar com intenção de cadastro atleta (zero fricção).
 */
@Component({
  standalone: true,
  template: '<p class="plan-flow-redirect-msg">Redirecionando…</p>',
  styles: [
    `
      :host {
        display: grid;
        min-height: 40vh;
        place-items: center;
        color: #e2e8f0;
        font-size: 0.95rem;
      }
    `,
  ],
})
export class AuthRegisterRedirectComponent implements OnInit {
  private readonly router = inject(Router);

  ngOnInit(): void {
    void this.router.navigate(['/entrar'], {
      queryParams: { plan: 'athlete', intent: 'signup' },
      replaceUrl: true,
    });
  }
}
