import { inject, Injectable } from '@angular/core';
import { AuthService } from '../../auth/auth.service';
import type { TournamentRole } from '../data/tournament.model';

/** Papel de quem está logado num torneio, para o guard da mídia. Fica num serviço próprio
 *  (e não no contexto do chaveamento) por dois motivos:
 *  - o contexto, ao carregar, auto-seleciona o 1º torneio e baixa todas as partidas dele —
 *    disparado de um guard, isso corria com a seleção do torneio da rota;
 *  - o guard mora em `app.routes.ts` (bundle inicial): o Firestore entra por import dinâmico.
 *  Resultado positivo fica em cache na sessão; falha não (tenta de novo na próxima navegação). */
@Injectable({ providedIn: 'root' })
export class StaffRoleLookup {
  private readonly auth = inject(AuthService);
  private readonly cache = new Map<string, TournamentRole | null>();

  async roleIn(tournamentId: string): Promise<TournamentRole | null> {
    const uid = this.auth.user()?.uid;
    if (!uid || !tournamentId) return null;
    const key = `${uid}/${tournamentId}`;
    if (this.cache.has(key)) return this.cache.get(key)!;
    const { readMyStaffRole } = await import('../data/staff-role-repository');
    const role = await readMyStaffRole(uid, tournamentId);
    this.cache.set(key, role);
    return role;
  }
}
