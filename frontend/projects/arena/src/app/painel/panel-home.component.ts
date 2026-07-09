import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';

/** Placeholder do painel pós-login — o restante do painel da arena ainda não foi construído. */
@Component({
  selector: 'ar-panel-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      <div class="card">
        <span class="ar-kicker">Painel da arena</span>
        <h1>Bem-vindo{{ nameSuffix() }}.</h1>
        <p>O painel completo ainda está em construção — por enquanto, isso confirma que o login funcionou.</p>
        <button class="ar-btn-primary" type="button" (click)="signOut()">Sair</button>
      </div>
    </div>
  `,
  styles: `
    .wrap {
      min-height: 100dvh;
      display: grid;
      place-items: center;
      padding: 24px;
    }

    .card {
      width: min(420px, 100%);
      display: flex;
      flex-direction: column;
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
      margin: 0 0 10px;
    }
  `,
})
export class PanelHomeComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected nameSuffix(): string {
    const name = this.auth.displayName();
    return name ? `, ${name}` : '';
  }

  protected async signOut(): Promise<void> {
    await this.auth.signOutUser();
    void this.router.navigateByUrl('/entrar');
  }
}
