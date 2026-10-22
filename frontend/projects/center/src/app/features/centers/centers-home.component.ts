import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { CenterContextService } from '../../core/center-context.service';
import { TeamActions } from '../../data/actions/team.actions';
import { writeErrorMessage } from '../../data/actions/actor';
import type { CenterInvite } from '../../domain/models';
import { ROLE_LABELS } from '../../domain/roles';
import { CenterAvatarComponent } from '../../shell/center-avatar.component';
import { IconComponent } from '../../ui/icon.component';

/**
 * Porta de entrada depois do login: centros em que a conta tem vínculo, convites pendentes para
 * o e-mail da conta e o atalho para cadastrar um centro novo. Aceitar convite exige e-mail
 * verificado (a rule confere `email_verified`), senão qualquer um criaria conta com o e-mail
 * de outra pessoa e entraria no centro dela.
 */
@Component({
  selector: 'ct-centers-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, CenterAvatarComponent, IconComponent],
  templateUrl: './centers-home.component.html',
  styleUrl: './centers-home.component.scss',
})
export class CentersHomeComponent {
  protected readonly ctx = inject(CenterContextService);
  protected readonly auth = inject(AuthService);
  private readonly team = inject(TeamActions);
  private readonly router = inject(Router);

  protected readonly roleLabels = ROLE_LABELS;
  protected readonly busyInvite = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly info = signal<string | null>(null);
  protected readonly verifying = signal(false);

  protected readonly memberships = computed(() =>
    [...this.ctx.memberships()].filter((m) => m.status !== 'invited').sort((a, b) => a.centerName.localeCompare(b.centerName, 'pt-BR')),
  );

  async accept(invite: CenterInvite): Promise<void> {
    this.error.set(null);
    if (!this.auth.emailVerified()) {
      this.error.set('Confirme seu e-mail antes de aceitar o convite.');
      return;
    }
    this.busyInvite.set(invite.id);
    try {
      await this.team.acceptInvite(invite);
      void this.router.navigate(['/centro', invite.centerId, 'dashboard']);
    } catch (err) {
      this.error.set(writeErrorMessage(err));
    } finally {
      this.busyInvite.set(null);
    }
  }

  async decline(invite: CenterInvite): Promise<void> {
    this.error.set(null);
    this.busyInvite.set(invite.id);
    try {
      await this.team.declineInvite(invite);
    } catch (err) {
      this.error.set(writeErrorMessage(err));
    } finally {
      this.busyInvite.set(null);
    }
  }

  async resendVerification(): Promise<void> {
    this.error.set(null);
    this.verifying.set(true);
    try {
      await this.auth.sendVerification();
      this.info.set(`Enviamos o link de confirmação para ${this.auth.email()}.`);
    } catch (err) {
      this.error.set(writeErrorMessage(err));
    } finally {
      this.verifying.set(false);
    }
  }

  async checkVerified(): Promise<void> {
    this.verifying.set(true);
    try {
      await this.auth.refreshUser();
      this.info.set(this.auth.emailVerified() ? 'E-mail confirmado.' : 'Ainda não confirmado. Abra o link que enviamos.');
    } finally {
      this.verifying.set(false);
    }
  }

  async signOut(): Promise<void> {
    await this.auth.signOutUser();
    void this.router.navigateByUrl('/entrar');
  }
}
