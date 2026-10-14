import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { CoachContextService } from './coach-context.service';

/** Conta autenticada sem nenhum painel de treinador (nem próprio, nem como membro de comissão). */
@Component({
  selector: 'co-no-access',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="wrap">
      <div class="card">
        <h1>Você ainda não tem um painel</h1>
        <p class="body-text">
          Sua conta não está vinculada a nenhum treinador. Peça um convite à pessoa que lidera a
          comissão técnica, ou cadastre-se como treinador.
        </p>
        <div class="actions">
          <button type="button" class="co-ghost-btn" (click)="signOut()">Sair</button>
          <a class="co-btn-primary" routerLink="/cadastro">Cadastrar como treinador</a>
        </div>
      </div>
    </div>
  `,
  styles: `
    .wrap {
      min-height: 100dvh;
      display: grid;
      place-items: center;
      background: var(--nx-bg);
      padding: 24px;
    }
    .card {
      width: min(420px, 100%);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-4);
      padding: 28px;
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
    }
    h1 {
      font-family: var(--nx-font-display);
      font-size: 20px;
      margin: 0 0 12px;
    }
    .body-text {
      font-size: 14px;
      line-height: 1.5;
      color: var(--nx-text-mute);
    }
    .actions {
      display: flex;
      gap: 12px;
      margin-top: 20px;
    }
    .actions .co-btn-primary {
      width: auto;
      flex: 1;
      height: 44px;
      display: grid;
      place-items: center;
      text-decoration: none;
    }
  `,
})
export class NoAccessComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly ctx = inject(CoachContextService);

  /** Rede de segurança: se o espelho de um convite aceito chegar depois, sai daqui sozinho. O
   *  areaGuard só manda para cá com contexts() vazio, então não há laço. */
  private readonly rescue = effect(() => {
    if (this.ctx.ready() && this.ctx.contexts().length > 0) {
      void this.router.navigateByUrl('/painel');
    }
  });

  protected async signOut(): Promise<void> {
    await this.auth.signOutUser();
    await this.router.navigateByUrl('/entrar');
  }
}
