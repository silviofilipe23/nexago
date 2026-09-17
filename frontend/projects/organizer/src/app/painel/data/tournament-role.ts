import type { OrganizerTournament, TournamentRole } from './tournament.model';

/** Papel a partir de um doc do espelho `users/{uid}/tournamentStaff/{tid}`.
 *  Papel ausente conta como gestor e status ausente conta como ativo — os
 *  mesmos defaults de `buildStaffMirrorData` no backend. Divergir deles aqui
 *  criaria tela que mostra uma coisa e servidor que decide outra. */
export function roleFromStaffMirror(data: Record<string, unknown>): TournamentRole | null {
  const status = (data['status'] as string | undefined) ?? 'active';
  if (status !== 'active') return null;
  const role = (data['role'] as string | undefined) ?? 'manager';
  if (role === 'scorer') return null;
  return role === 'eventAdmin' ? 'eventAdmin' : 'manager';
}

/** Quem alcança o caixa do torneio: o dono e o gestor. O administrador do
 *  evento opera tudo menos o dinheiro (decisão do dono, 16/09/2026), e o
 *  servidor recusa o saque dele mesmo se a tela deixasse pedir. */
export function roleReachesMoney(role: TournamentRole | null): boolean {
  return role === 'owner' || role === 'manager';
}

/** Torneios cujo caixa a pessoa alcança — a lista que o Financeiro e o KPI do
 *  Início usam. Um administrador do evento vê o torneio em Meus Torneios e NÃO
 *  vê o caixa dele. */
export function myMoneyTournaments(tournaments: OrganizerTournament[]): OrganizerTournament[] {
  return tournaments.filter((t) => roleReachesMoney(t.myRole));
}

/** Se o Financeiro faz sentido para esta pessoa: ela é dona ou gestora de ao
 *  menos um evento. Administrador do evento não vê o item de menu nem entra na
 *  rota — e, se entrar à mão, o servidor recusa de qualquer forma (a tela é
 *  conveniência, a fronteira é a callable e as rules). */
export function canSeeFinanceiro(tournaments: OrganizerTournament[]): boolean {
  return myMoneyTournaments(tournaments).length > 0;
}

/** Alcance do Financeiro para o menu: `carregado` = a lista de torneios da pessoa chegou;
 *  `desconhecido` = ainda está carregando OU a leitura falhou. Os dois viram um estado só
 *  de propósito — pra tela eles são indistinguíveis, e tratar "falhou" como "não tem
 *  torneio" é exatamente o bug que originou este projeto. */
export type FinanceiroReachStatus = 'desconhecido' | 'carregado';

/** Se o menu do painel mostra o item "Financeiro". FALHA ABERTO: com alcance desconhecido
 *  o item aparece, e ele só desaparece quando a lista carregou e ninguém ali dá caixa.
 *  Mostrar demais custa uma tela que explica de quem é o Financeiro (a rota não é
 *  bloqueada); esconder demais faz o dono perder o acesso ao dinheiro por rede instável,
 *  sem mensagem e sem retry. */
export function showsFinanceiroMenuItem(
  status: FinanceiroReachStatus,
  tournaments: OrganizerTournament[],
): boolean {
  return status === 'desconhecido' || canSeeFinanceiro(tournaments);
}
