import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';

/**
 * Destino provisório dos links da vitrine que apontam para telas ainda não construídas
 * (produto, carrinho, favoritos). Some quando cada tela chegar — a rota fica.
 */
@Component({
  selector: 'app-loja-em-breve',
  imports: [AtPanelShellComponent, RouterLink],
  template: `
    <app-at-panel-shell [userName]="accountLabel()" [guest]="guest()">
      <div class="eb">
        <span class="eb-kicker">Loja NexaGO</span>
        <h1>{{ title() }}</h1>
        <p>Esta parte da Loja chega na próxima etapa. Enquanto isso, a vitrine está aberta.</p>
        <a routerLink="/loja" class="eb-back">Voltar para a vitrine</a>
      </div>
    </app-at-panel-shell>
  `,
  styles: `
    .eb {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 10px;
      max-width: 520px;
      padding: 48px 40px;
    }
    .eb-kicker {
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--nx-orange-500);
    }
    h1 {
      margin: 0;
      font-family: var(--nx-font-display);
      font-size: 26px;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: var(--nx-text);
    }
    p {
      margin: 0;
      font-family: var(--nx-font-ui);
      font-size: 14px;
      line-height: 1.5;
      color: var(--nx-text-mute);
    }
    .eb-back {
      margin-top: 8px;
      display: inline-flex;
      align-items: center;
      height: 42px;
      padding: 0 18px;
      border-radius: 12px;
      background: var(--nx-orange-500);
      color: var(--nx-text-on-orange);
      font-family: var(--nx-font-display);
      font-size: 13.5px;
      font-weight: 700;
      text-decoration: none;
    }
    @media (max-width: 640px) {
      .eb {
        padding: 32px 16px;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LojaEmBreveComponent {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  protected readonly accountLabel = computed(() => this.auth.user()?.displayName?.trim() || 'Atleta');
  protected readonly guest = computed(() => !this.auth.isAuthenticated());
  protected readonly title = computed(() => (this.route.snapshot.data['title'] as string | undefined) ?? 'Em breve');
}
