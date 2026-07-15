import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthShellComponent } from '../../auth/ui/auth-shell.component';
import { AuthService } from '../../auth/auth.service';
import { ArenaContextService } from '../data/arena-context.service';
import { IconComponent } from '../ui/icon.component';
import { initialsOf } from '../ui/initials';

/** Tela exibida quando o gestor logado gerencia mais de uma arena (mesmo `managerUserId` em
 *  vários docs `arenas`) e ainda não escolheu qual delas ver — ver `arenaSelectionGuard`.
 *  Sem referência no Flutter: o seletor de lá (`arena_selection_gate.dart`) nunca chegou a ser
 *  plugado no app de verdade, então esse design é original. */
@Component({
  selector: 'ar-panel-arena-selection',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AuthShellComponent, IconComponent],
  template: `
    <ar-auth-shell [wide]="true">
      <header class="ar-form-header">
        <span class="ar-kicker">Selecione a arena</span>
        <h1>Qual arena você quer gerenciar?</h1>
        <p>Sua conta gerencia mais de uma arena. Escolha uma pra continuar — você pode trocar depois.</p>
      </header>

      <div class="list">
        @for (arena of arenas(); track arena.id) {
          <button type="button" class="arena-row" (click)="choose(arena.id)">
            <div class="arena-avatar" aria-hidden="true">{{ initialsOf(arena.name) }}</div>
            <div class="arena-name">{{ arena.name }}</div>
            <ar-icon name="chevron-right" [size]="16" />
          </button>
        }
      </div>

      <button type="button" class="signout-link" (click)="signOut()">
        <ar-icon name="log-out" [size]="14" />
        Sair da conta
      </button>
    </ar-auth-shell>
  `,
  styles: `
    .list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 6px;
    }

    .arena-row {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      height: 56px;
      padding: 0 14px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text);
      cursor: pointer;
      text-align: left;
      transition: background 140ms var(--nx-ease-out), border-color 140ms var(--nx-ease-out);
    }

    .arena-row:hover {
      background: var(--nx-surface-2);
      border-color: var(--nx-orange-500);
    }

    .arena-avatar {
      width: 34px;
      height: 34px;
      border-radius: 10px;
      flex: none;
      background: linear-gradient(135deg, #f0a830 0%, #2260b8 100%);
      display: grid;
      place-items: center;
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 11px;
      color: #fff;
    }

    .arena-name {
      flex: 1;
      min-width: 0;
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 14px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .arena-row ar-icon {
      color: var(--nx-text-dim);
      flex: none;
    }

    .signout-link {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin-top: 22px;
      background: transparent;
      border: none;
      cursor: pointer;
      padding: 4px 0;
      color: var(--nx-text-mute);
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
    }

    .signout-link:hover {
      color: var(--nx-text);
    }
  `,
})
export class PanelArenaSelectionComponent {
  private readonly arenaContext = inject(ArenaContextService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly arenas = this.arenaContext.managedArenas;
  protected readonly initialsOf = initialsOf;

  protected choose(arenaId: string): void {
    this.arenaContext.selectArena(arenaId);
    void this.router.navigate(['/painel']);
  }

  protected async signOut(): Promise<void> {
    await this.auth.signOutUser();
    void this.router.navigate(['/entrar']);
  }
}
