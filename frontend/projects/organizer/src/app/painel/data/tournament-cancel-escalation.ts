/**
 * O `cancelTournament` recusa o cancelamento quando o torneio já tem inscrições pagas: o
 * organizador precisa reafirmar com `force`. Esta é a leitura dessa recusa — separada da tela
 * porque errar aqui é silencioso nas duas direções: reconhecer de menos deixa o organizador
 * preso num erro sem saída, reconhecer demais transforma uma falha qualquer (rede, permissão)
 * num convite a forçar o cancelamento.
 *
 * `details.reason` é o sinal confiável; o teste no texto é fallback para respostas antigas que
 * não carregam `details` — mesmo par de checagens que o app usa.
 */
export function isPaidRegistrationsRejection(error: unknown): boolean {
  const err = error as { message?: unknown; details?: { reason?: unknown } } | null | undefined;
  if (err?.details?.reason === 'has_paid_registrations') return true;
  return typeof err?.message === 'string' && /pagas|paid/i.test(err.message);
}
