import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';

/** Placeholder guardado — prova que o login funciona ponta a ponta. Conteúdo
 *  real do painel (torneios, ligas, financeiro) é entrega futura. */
@Component({
  selector: 'og-panel-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      <div class="card">
        <span class="og-kicker">Painel do organizador</span>
        <h1>Em construção.</h1>
        <p>O login já funciona — as telas de torneios, ligas e financeiro chegam nas próximas entregas.</p>
        <button class="og-mini-btn og-mini-btn-primary" type="button" (click)="signOut()">Sair</button>
      </div>
    </div>
  `,
  styles: `
    .wrap {
      min-height: 100dvh;
      display: grid;
      place-items: center;
      padding: 24px;
      background: var(--nx-bg);
    }

    .card {
      max-width: 420px;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 14px;
    }

    h1 {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 28px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
      margin: 0;
    }

    p {
      font-size: 14px;
      line-height: 1.55;
      color: var(--nx-text-mute);
      margin: 0;
    }
  `,
})
export class PanelHomeComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected async signOut(): Promise<void> {
    await this.auth.signOutUser();
    void this.router.navigateByUrl('/entrar');
  }
}
