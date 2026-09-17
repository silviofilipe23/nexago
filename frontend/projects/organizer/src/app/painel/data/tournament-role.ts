import type { TournamentRole } from './tournament.model';

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
