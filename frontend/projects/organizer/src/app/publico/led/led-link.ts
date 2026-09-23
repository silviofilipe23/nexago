/** Link do painel de LED de uma quadra.
 *
 *  Vazio quando falta torneio ou quadra: a rodada pode ainda não ter sido agendada, e um link
 *  `/led/t1/quadra/` abriria um painel que nunca acha partida nenhuma. Quem chama esconde o botão. */
export function ledPanelHref(tournamentId: string, courtId: string): string {
  const torneio = tournamentId.trim();
  const quadra = courtId.trim();
  if (!torneio || !quadra) return '';
  return `/led/${encodeURIComponent(torneio)}/quadra/${encodeURIComponent(quadra)}`;
}
