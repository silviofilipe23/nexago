import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { filter, map, take } from 'rxjs/operators';
import { AuthService } from '../auth/auth.service';
import { sanitizeReturnUrl } from '../auth/redirect-url';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-login',
  imports: [RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Contexto vindo dos planos (landing) — copy orientada a resultado. */
  protected readonly loginTitle = signal('Entrar');
  protected readonly loginSubtitle = signal(
    'Faça login para continuar com a reserva. Você volta para a mesma tela em seguida.',
  );

  /** Destino após login; definido a partir da query `redirect`. */
  private returnUrl = '/';

  constructor() {
    this.route.queryParamMap
      .pipe(
        map((params) => ({ plan: params.get('plan'), intent: params.get('intent') })),
        takeUntilDestroyed(),
      )
      .subscribe(({ plan, intent }) => {
        if (plan === 'athlete' && intent === 'signup') {
          this.loginTitle.set('Entrar no jogo');
          this.loginSubtitle.set(
            'Crie sua conta em segundos. Depois você parte direto para reservar quadra ou entrar em torneio — mais jogo, menos fricção.',
          );
          return;
        }
        if (plan === 'organizer') {
          this.loginTitle.set('Organizador — próximo passo');
          this.loginSubtitle.set(
            'Entre para seguir o onboarding: primeiro torneio, categorias e depois abertura de inscrições.',
          );
          return;
        }
        if (plan === 'arena') {
          this.loginTitle.set('Arena Pro — começar');
          this.loginSubtitle.set(
            'Entre para cadastrar sua arena, quadras e horários — mais faturamento e menos no-show.',
          );
          return;
        }
        this.loginTitle.set('Entrar');
        this.loginSubtitle.set(
          'Faça login para continuar com a reserva. Você volta para a mesma tela em seguida.',
        );
      });

    toObservable(this.auth.authReady)
      .pipe(filter((ready) => ready), take(1), takeUntilDestroyed())
      .subscribe(() => {
        const q = this.route.snapshot.queryParamMap.get('redirect');
        this.returnUrl = sanitizeReturnUrl(q, '/', {
          trustedOrigins: environment.trustedReturnOrigins,
        });
        if (this.auth.isAuthenticated()) {
          void this.router.navigateByUrl(this.returnUrl);
        }
      });
  }

  protected showDevBypass(): boolean {
    return this.auth.showDevBypass();
  }

  protected firebaseConfigured(): boolean {
    return this.auth.firebaseConfigured();
  }

  protected async google(): Promise<void> {
    this.error.set(null);
    this.busy.set(true);
    try {
      await this.auth.signInWithGoogle();
      await this.router.navigateByUrl(this.returnUrl);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Falha ao entrar com Google.');
    } finally {
      this.busy.set(false);
    }
  }

  protected devContinue(): void {
    this.auth.devSignIn();
    void this.router.navigateByUrl(this.returnUrl);
  }
}
