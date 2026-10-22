import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { mapFirebaseAuthError } from '../../auth/firebase-auth-errors';
import { CenterContextService } from '../../core/center-context.service';
import { CenterActions } from '../../data/actions/center.actions';
import { writeErrorMessage } from '../../data/actions/actor';
import { CenterStore } from '../../data/center-store.service';
import { formatDayKey, formatInstant, wallClock } from '../../domain/dates';
import { activationSteps, type ActivationStep } from '../../domain/enrollment';
import { IconComponent } from '../../ui/icon.component';
import { BannerComponent, PageHeaderComponent } from '../../ui/kit';
import { SubscriptionCardComponent } from './subscription-card.component';

/** Onde o owner resolve cada passo que é dele (os dois últimos são do backoffice NexaGO). */
const STEP_LINK: Partial<Record<ActivationStep['key'], { path: string; aba?: string }>> = {
  data: { path: 'configuracoes', aba: 'dados' },
  programs: { path: 'modalidades' },
  policies: { path: 'configuracoes', aba: 'politicas' },
  receiving: { path: 'configuracoes', aba: 'recebimento' },
};

@Component({
  selector: 'ct-activation',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, PageHeaderComponent, BannerComponent, SubscriptionCardComponent],
  templateUrl: './activation.component.html',
  styles: `
    .body { padding: 20px var(--ct-gutter) 26px; display: flex; flex-direction: column; gap: 16px; }
    .bars { display: flex; gap: 4px; margin-bottom: 10px; }
    .bars > span { flex: 1; height: 5px; border-radius: 3px; background: var(--nx-surface-2); }
    .bars > .done { background: var(--nx-win); }
    .bars > .now { background: var(--nx-orange-500); }
    .step { display: flex; align-items: center; gap: 14px; padding: 14px 4px; border-top: 1px solid var(--nx-line); flex-wrap: wrap; }
    .step:first-of-type { border-top: none; }
    .step .ct-grow { min-width: 180px; }
    .num { width: 30px; height: 30px; border-radius: 50%; flex: none; display: grid; place-items: center; border: 1px solid var(--nx-line-strong); background: var(--nx-surface-1); font-family: var(--nx-font-mono); font-size: 11px; font-weight: 700; color: var(--nx-text-dim); }
    .num.done { background: rgba(43,209,126,0.14); border-color: rgba(43,209,126,0.4); color: var(--nx-win); }
    .num.now { background: var(--nx-orange-500); border-color: transparent; color: #0a0a0a; }
    .t { font-family: var(--nx-font-display); font-weight: 700; font-size: 14px; color: var(--nx-text); }
    .t.todo { color: var(--nx-text-mute); }
    .acts { display: flex; gap: 8px; flex-wrap: wrap; }
    .ct-box { margin-top: 8px; }
    .ct-box .ct-disp { font-size: 13.5px; }
    .ct-box p, .ct-card > p { margin: 6px 0 0; }
  `,
})
export class ActivationComponent {
  readonly centerId = input.required<string>();

  protected readonly ctx = inject(CenterContextService);
  private readonly store = inject(CenterStore);
  protected readonly auth = inject(AuthService);
  private readonly actions = inject(CenterActions);

  protected readonly links = STEP_LINK;

  protected readonly steps = computed(() => {
    const c = this.ctx.center();
    return c ? activationSteps(c, { programs: this.store.programs().length }, this.auth.emailVerified()) : [];
  });
  protected readonly doneCount = computed(() => this.steps().filter((s) => s.state === 'done').length);
  protected readonly remaining = computed(() => this.steps().length - this.doneCount());
  /** Os 4 primeiros passos são do owner; recebimento ele cria e o Asaas aprova; a assinatura é do time NexaGO. */
  protected readonly ownerStepsDone = computed(() => this.steps().slice(0, 4).every((s) => s.state === 'done'));
  protected readonly ownerVerified = computed(() => this.auth.emailVerified());

  private readonly tz = computed(() => this.ctx.center()?.timezone ?? 'America/Sao_Paulo');
  protected readonly createdLabel = computed(() => {
    const at = this.ctx.center()?.createdAt;
    return at ? formatDayKey(wallClock(at, this.tz()).dayKey, true) : '';
  });
  protected readonly activatedLabel = computed(() => {
    const at = this.ctx.center()?.activatedAt;
    return at ? formatDayKey(wallClock(at, this.tz()).dayKey, true) : '';
  });
  protected readonly requestedLabel = computed(() => formatInstant(this.ctx.center()?.activationRequestedAt ?? null, this.tz()));

  protected readonly subtitle = computed(() => {
    const c = this.ctx.center();
    if (!c) {
      return '';
    }
    const st = c.status === 'active' ? 'ativo' : c.status === 'suspended' ? 'suspenso' : 'pendente';
    return this.createdLabel() ? `Situação: ${st} · criado ${this.createdLabel()}` : `Situação: ${st}`;
  });

  protected readonly requestBusy = signal(false);
  protected readonly requestError = signal('');
  protected readonly verifyBusy = signal(false);
  protected readonly verifyMsg = signal('');
  protected readonly verifyError = signal('');

  protected async requestActivation(): Promise<void> {
    if (this.requestBusy() || !this.ctx.isManager() || !this.ownerStepsDone()) {
      return;
    }
    this.requestBusy.set(true);
    this.requestError.set('');
    try {
      await this.actions.requestActivation();
    } catch (err) {
      this.requestError.set(writeErrorMessage(err));
    } finally {
      this.requestBusy.set(false);
    }
  }

  protected async resendVerification(): Promise<void> {
    if (this.verifyBusy()) {
      return;
    }
    this.verifyBusy.set(true);
    this.verifyError.set('');
    this.verifyMsg.set('');
    try {
      await this.auth.sendVerification();
      this.verifyMsg.set(`Enviamos um novo link para ${this.auth.email() ?? 'seu e-mail'}.`);
    } catch (err) {
      this.verifyError.set(mapFirebaseAuthError(err));
    } finally {
      this.verifyBusy.set(false);
    }
  }

  protected async checkVerified(): Promise<void> {
    if (this.verifyBusy()) {
      return;
    }
    this.verifyBusy.set(true);
    this.verifyError.set('');
    this.verifyMsg.set('');
    try {
      await this.auth.refreshUser();
      if (!this.auth.emailVerified()) {
        this.verifyMsg.set('Ainda não confirmado. Abra o link do e-mail e tente de novo.');
      }
    } catch (err) {
      this.verifyError.set(mapFirebaseAuthError(err));
    } finally {
      this.verifyBusy.set(false);
    }
  }
}
