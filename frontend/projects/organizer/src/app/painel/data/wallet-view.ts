/**
 * Se a tela deve explicar o saldo zerado em vez de só mostrar R$ 0,00.
 *
 * O caso real (reclamação de 09/2026): torneio com R$ 5.290 arrecadados e saldo
 * zerado. Estava certo — todo o dinheiro foi recebido direto com o organizador
 * (`paymentMode: directWithOrganizer`), nunca passou pelo Asaas e por isso nunca
 * creditou o caixa. Só que a tela mostrava a arrecadação ao lado do zero sem dizer
 * isso, e a leitura natural é "a plataforma sumiu com meu dinheiro".
 *
 * Os números são de UM evento: desde 16/09/2026 o caixa é do torneio
 * (`tournamentWallets/{id}`), então `viaOrganizerCents` é o recebido por fora
 * daquele evento só — não a soma dos torneios de uma pessoa.
 *
 * A explicação só aparece quando as três coisas valem juntas: caixa zerado,
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
