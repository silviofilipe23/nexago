/** Link público de acompanhamento do torneio — o mesmo que vira QR no telão e botão de
 *  copiar na aba Telão. Mantido num módulo só pra não haver duas versões da URL. */
export function publicTournamentUrl(origin: string, tournamentId: string): string {
  return `${origin.replace(/\/+$/, '')}/t/${tournamentId}`;
}
