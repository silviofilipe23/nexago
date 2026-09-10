import type { OrganizerTournament } from './tournament.model';

/** Torneios cujo dinheiro cai na carteira de `organizerId`.
 *
 *  Um gestor de equipe enxerga, em `listMyTournaments`, os torneios próprios E os
 *  que ele opera para outros donos. Sem este recorte o card "Arrecadação por evento"
 *  misturaria as duas coisas e o total não bateria com a carteira em exibição.
 *  `organizerId` vazio (carteira ainda não carregada) não filtra nada. */
export function tournamentsOfWallet(
  tournaments: OrganizerTournament[],
  organizerId: string,
): OrganizerTournament[] {
  if (!organizerId) return tournaments;
  return tournaments.filter((t) => t.managerId === organizerId);
}

/**
 * Se a tela deve explicar o saldo zerado em vez de só mostrar R$ 0,00.
 *
 * O caso real (reclamação de 09/2026): torneio com R$ 5.290 arrecadados e saldo
 * zerado. Estava certo — todo o dinheiro foi recebido direto com o organizador
 * (`paymentMode: directWithOrganizer`), nunca passou pelo Asaas e por isso nunca
 * creditou `organizerWallets`. Só que a tela mostrava a arrecadação ao lado do
 * zero sem dizer isso, e a leitura natural é "a plataforma sumiu com meu dinheiro".
 *
 * A explicação só aparece quando as três coisas valem juntas: carteira zerada,
 * nenhum crédito no histórico (senão o zero é "já sacou tudo", outra história) e
 * existe dinheiro recebido por fora para explicar.
 */
export function shouldExplainZeroBalance(params: {
  availableReais: number;
  pendingReais: number;
  ledgerCount: number;
  viaOrganizerCents: number;
}): boolean {
  if (params.availableReais > 0 || params.pendingReais > 0) return false;
  if (params.ledgerCount > 0) return false;
  return params.viaOrganizerCents > 0;
}
