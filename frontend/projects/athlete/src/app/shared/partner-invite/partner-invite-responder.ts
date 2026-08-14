import { Injectable } from '@angular/core';
import { athleteFunctions } from '../../data/functions';
import { acceptPartnerInvite, declinePartnerInvite } from '../../data/tournament-registrations-repository';

/** Aceitar/recusar convite pelo anúncio automático.
 *
 *  Existe pra dar uma costura injetável em cima das callables — o anunciador abre sozinho
 *  ao entrar no portal, e o que ele faz depois de "Aceitar"/"Recusar" (marcar respondido,
 *  lembrar da sessão, navegar) é justamente o que precisa de teste sem rede.
 *
 *  Aceite aqui é sempre sem uniforme: o backend permite e coleta depois, na tela de
 *  inscrição — mesmo comportamento do aceite rápido do painel. */
@Injectable({ providedIn: 'root' })
export class PartnerInviteResponder {
  accept(inviteId: string): Promise<void> {
    return acceptPartnerInvite(athleteFunctions(), inviteId, undefined, { lgpdAccepted: true });
  }

  decline(inviteId: string): Promise<void> {
    return declinePartnerInvite(athleteFunctions(), inviteId);
  }
}
