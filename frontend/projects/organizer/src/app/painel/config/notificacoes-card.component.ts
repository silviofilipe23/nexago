import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { isPushSupported, isSubscribed, pushPermissionStatus, subscribeToPush, unsubscribeFromPush } from '@nexago/push-notifications';
import { organizerFirestore } from '../data/firestore';
import { OgCardComponent } from '../ui/card.component';
import { OgToggleRowComponent } from '../ui/toggle-row.component';

type PushStatus = 'unsupported' | 'denied' | 'off' | 'on';

/** Card "Notificações" de `/painel/config` — status e toggle manual do push do navegador.
 *  Complementa o prompt automático do shell (`panel-shell.component.ts`): cobre quem recusou
 *  sem querer, quer desligar depois, ou abriu o painel num navegador sem suporte. */
@Component({
  selector: 'og-config-notificacoes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgCardComponent, OgToggleRowComponent],
  template: `
    <og-card title="Notificações" kicker="Painel">
      @if (status() === 'unsupported') {
        <p class="og-cfg-hint">Este navegador não suporta notificações push.</p>
      } @else if (status() === 'denied') {
        <p class="og-cfg-hint">
          As notificações deste site estão bloqueadas nas configurações do navegador. Libere o acesso lá pra
          reativar.
        </p>
      } @else {
        <og-toggle-row
          title="Notificações no navegador"
          desc="Avisa de nova inscrição, pagamento e pedido de cancelamento mesmo com o painel em outra aba."
          [on]="status() === 'on'"
          (toggled)="toggle($event)"
        />
      }
      @if (feedback(); as f) {
        <p class="og-cfg-feedback" [style.color]="f.ok ? 'var(--nx-win)' : 'var(--nx-live)'">{{ f.message }}</p>
      }
    </og-card>
  `,
})
export class OgConfigNotificacoesCardComponent {
  readonly uid = input.required<string>();

  protected readonly status = signal<PushStatus>('off');
  protected readonly feedback = signal<{ ok: boolean; message: string } | null>(null);

  private busy = false;

  constructor() {
    void this.refreshStatus();
  }

  private async refreshStatus(): Promise<void> {
    if (!isPushSupported()) {
      this.status.set('unsupported');
      return;
    }
    if (pushPermissionStatus() === 'denied') {
      this.status.set('denied');
      return;
    }
    this.status.set((await isSubscribed()) ? 'on' : 'off');
  }

  protected async toggle(on: boolean): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.feedback.set(null);
    try {
      if (on) {
        const ok = await subscribeToPush(organizerFirestore(), this.uid());
        this.status.set(ok ? 'on' : pushPermissionStatus() === 'denied' ? 'denied' : 'off');
        this.feedback.set(
          ok
            ? { ok: true, message: 'Notificações ativadas.' }
            : { ok: false, message: 'Não foi possível ativar. Confira a permissão do navegador.' },
        );
      } else {
        await unsubscribeFromPush(organizerFirestore(), this.uid());
        this.status.set('off');
        this.feedback.set({ ok: true, message: 'Notificações desativadas.' });
      }
    } finally {
      this.busy = false;
    }
  }
}
