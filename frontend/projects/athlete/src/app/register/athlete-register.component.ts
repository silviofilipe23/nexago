import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { filter, take } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { sanitizeReturnUrl } from '../auth/redirect-url';

@Component({
  selector: 'app-athlete-register',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="register-shell">
      <div class="register-card glass-panel">
        <a routerLink="/entrar" [queryParams]="{ redirect: returnUrl }" class="register-back">
          ← Voltar ao login
        </a>
        <h1 class="title-lg">Criar conta</h1>
        <p class="text-muted">
          Cadastro completo com e-mail e senha entra em uma próxima entrega. Por enquanto use
          <strong>Continuar com Google</strong> na tela de login ou o modo dev local.
        </p>
        <button type="button" class="btn-primary register-btn" (click)="goLogin()">Ir para entrar</button>
      </div>
    </section>
  `,
  styles: `
    .register-shell {
      min-height: 100dvh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: var(--nexago-bg);
    }
    .register-card {
      max-width: 420px;
      padding: 1.75rem;
      border-radius: var(--radius-glass);
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .register-back {
      font-size: 0.9rem;
      opacity: 0.7;
      text-decoration: none;
      color: inherit;
    }
    .register-back:hover {
      opacity: 1;
    }
    .register-btn {
      border: none;
      cursor: pointer;
      margin-top: 0.5rem;
    }
  `,
})
export class AthleteRegisterComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  returnUrl = '/';

  constructor() {
    const q = this.route.snapshot.queryParamMap.get('redirect');
    this.returnUrl = sanitizeReturnUrl(q, '/', {
      trustedOrigins: environment.trustedReturnOrigins,
    });
    toObservable(this.auth.authReady)
      .pipe(filter((r) => r), take(1), takeUntilDestroyed())
      .subscribe(() => {
        if (this.auth.isAuthenticated()) {
          void this.router.navigateByUrl(this.returnUrl);
        }
      });
  }

  goLogin(): void {
    void this.router.navigate(['/entrar'], { queryParams: { redirect: this.returnUrl } });
  }
}
