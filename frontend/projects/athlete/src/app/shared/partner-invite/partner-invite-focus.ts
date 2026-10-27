import { Injectable, signal } from '@angular/core';

/** Convite que um link pediu para abrir AGORA (`/torneios-convite/:id`).
 *
 *  Fura a fila do `AtInviteAnnouncerComponent`: o anúncio automático mostra cada convite uma vez
 *  por sessão e só os que já existiam ao entrar — quem tocou no link quer este convite, mesmo
 *  que tenha acabado de nascer (resgate do `/convite-dupla`) ou já tenha sido adiado.
 *
 *  Serviço à parte, sem dependências, para não mexer no contrato do `PartnerInvitesService`. */
@Injectable({ providedIn: 'root' })
export class PartnerInviteFocus {
  private readonly focused = signal<string | null>(null);

  readonly inviteId = this.focused.asReadonly();

  request(inviteId: string): void {
    this.focused.set(inviteId);
  }

  /** Só solta o próprio pedido: outra tela pode ter pedido outro convite no meio do caminho. */
  release(inviteId: string): void {
    if (this.focused() === inviteId) this.focused.set(null);
  }
}
