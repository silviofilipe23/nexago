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

/** Aplica numa linha o saldo que o listener do caixa trouxe.
 *
 *  Só a linha do caixa OBSERVADO muda: um snapshot atrasado do caixa anterior não pode
 *  reescrever o saldo do que está na tela. O valor que chega é autoritativo, inclusive
 *  para menos — um saque move disponível para pendente. O que nunca chega aqui é falha
 *  de leitura: o erro do listener não chama o callback (ver `watchTournamentWallet`),
 *  senão um saldo correto viraria R$ 0,00 na tela. */
export function applyLiveBalance<
  T extends { tournamentId: string; availableReais: number; pendingReais: number },
>(row: T, tournamentId: string, live: { availableReais: number; pendingReais: number }): T {
  return row.tournamentId === tournamentId ? { ...row, ...live } : row;
}

/** Quem pediu o saque, do ponto de vista de quem está olhando a lista.
 *
 *  Sem nome de pessoa: a callable manda o uid de quem pediu e o flag
 *  `requestedByStaff` (quem pediu não é o dono do evento). Saque sem `requestedBy` —
 *  registro antigo, campo ausente — vira `—`: é melhor não dizer nada do que atribuir
 *  o saque à pessoa errada. Por isso também `viewerUid` vazio não gera "Você". */
export function withdrawalRequesterLabel(
  w: { requestedBy: string; requestedByStaff: boolean },
  viewerUid: string,
): string {
  if (!w.requestedBy) return '—';
  if (viewerUid && w.requestedBy === viewerUid) return 'Você';
  return w.requestedByStaff ? 'Gestor da equipe' : 'Dono do evento';
}

/** Soma dos caixas que a pessoa alcança — é o que o KPI do Início mostra.
 *  Arredonda no fim para não acumular erro de ponto flutuante numa tela de
 *  dinheiro (0.1 + 0.2 = 0.30000000000000004). */
export function sumWalletRows(
  rows: Array<{ availableReais: number; pendingReais: number }>,
): { availableReais: number; pendingReais: number } {
  const total = rows.reduce(
    (acc, r) => ({ availableReais: acc.availableReais + r.availableReais, pendingReais: acc.pendingReais + r.pendingReais }),
    { availableReais: 0, pendingReais: 0 },
  );
  return {
    availableReais: Math.round(total.availableReais * 100) / 100,
    pendingReais: Math.round(total.pendingReais * 100) / 100,
  };
}
