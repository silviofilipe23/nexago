import type { TournamentRole } from './tournament.model';

/** Para onde mandar a mídia que tentou abrir `url` dentro do torneio. A mídia (papel de equipe,
 *  01/10/2026) entra no portal SÓ pra tela Transmissão: qualquer outra rota do torneio — mesmo
 *  digitada à mão — volta pra ela, em vez de abrir uma tela cujas leituras as rules recusam.
 *  `null` = pode seguir. */
export function mediaRedirectFor(role: TournamentRole | null, url: string, tournamentId: string): string | null {
  if (role !== 'media') return null;
  const alvo = `/painel/eventos/${tournamentId}/transmissao`;
  const path = url.split('?')[0]!.split('#')[0]!;
  return path === alvo ? null : alvo;
}

/** Menu lateral do nível torneio. */
export function tournamentMenuFor(role: TournamentRole | null): 'completo' | 'transmissao' {
  return role === 'media' ? 'transmissao' : 'completo';
}
