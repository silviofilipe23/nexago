import type { AthleteTournamentRegistration } from '../../data/tournament-registrations-repository';

/** Estado do pagamento DIRETO com o organizador (`paymentMode === 'directWithOrganizer'`), do
 *  ponto de vista do atleta logado.
 *
 *  Nesse modo não existe webhook: o dinheiro cai na conta do organizador, fora do app, e o que o
 *  sistema registra é a DECLARAÇÃO de cada atleta ("já paguei"). Por isso o fluxo tem dois
 *  momentos que a tela precisa distinguir — a dupla declarou (vaga garantida) e o organizador
 *  conferiu o extrato (pagamento confirmado de fato).
 *
 *  Módulo puro de propósito (sem Angular, sem Firestore), no mesmo padrão de
 *  `painel/registration-progress.ts`: a regra mora aqui e é o que os testes exercitam; o
 *  componente só renderiza o que sai daqui. */

export type DirectPaymentState =
  /** Ninguém declarou por mim ainda — é a tela do Pix com o botão de declarar. */
  | 'idle'
  /** Declarei minha parte; a inscrição fecha quando o parceiro declarar a dele. */
  | 'waitingPartner'
  /** A dupla fechou. A vaga vale, mas o organizador ainda não confirmou o recebimento. */
  | 'waitingOrganizer'
  /** O organizador confirmou o recebimento (ou é inscrição direta anterior a esse fluxo). */
  | 'confirmed';

export interface DirectPaymentInput {
  registration: AthleteTournamentRegistration;
  myUid: string | null;
}

export function resolveDirectPaymentState({ registration, myUid }: DirectPaymentInput): DirectPaymentState {
  const iDeclared = myUid != null && myUid.length > 0 && registration.sharePaidUids.includes(myUid);

  if (registration.isPaid) {
    // `declaredPaidAt` ausente = inscrição direta fechada ANTES deste fluxo existir. Ela nunca
    // entrou na fila de conferência do organizador (a listagem dele usa a mesma âncora), então
    // seria mentira dizer ao atleta que alguém vai conferir: fica confirmada, como já estava.
    if (registration.declaredPaidAt == null) return 'confirmed';
    return registration.paymentVerifiedByOrganizer ? 'confirmed' : 'waitingOrganizer';
  }

  return iDeclared ? 'waitingPartner' : 'idle';
}

/** Só em `idle` o atleta ainda tem o que fazer nesta tela — nos demais o Pix sai do centro e
 *  vira consulta (o parceiro pode pedir o código). */
export function directPaymentAwaitsAction(state: DirectPaymentState): boolean {
  return state === 'idle';
}
