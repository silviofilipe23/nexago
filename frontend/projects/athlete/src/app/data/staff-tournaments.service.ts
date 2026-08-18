import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { athleteFirestore } from './firestore';
import { watchMyOngoingStaffTournaments, type MyStaffTournament } from './tournament-staff-repository';

/**
 * Torneios que o atleta opera (mesário/gestor), ao vivo e compartilhados por todas as telas
 * que os mostram: o item "Mesa" do menu, o card do painel e a própria lista de `/mesa`.
 *
 * Um store só, e não uma busca por tela, pelo mesmo motivo do `PartnerInvitesService`: entrar
 * na equipe é gesto do ORGANIZADOR — sem listener o torneio só apareceria no próximo
 * carregamento — e o menu não pode discordar da lista que ele abre.
 */
@Injectable({ providedIn: 'root' })
export class StaffTournamentsService {
  private readonly auth = inject(AuthService);
  private readonly firestore = athleteFirestore();

  private readonly ongoingState = signal<readonly MyStaffTournament[]>([]);
  private readonly allState = signal<readonly MyStaffTournament[]>([]);
  private readonly loadingState = signal(true);

  /** Torneios em andamento — finalizado/cancelado não entra (`watchMyOngoingStaffTournaments`). */
  readonly ongoing = this.ongoingState.asReadonly();
  /** Tudo que o espelho traz, encerrado incluído: separa "nunca fui equipe" de "só sobrou
   *  torneio encerrado" no estado vazio da mesa. */
  readonly all = this.allState.asReadonly();
  readonly loading = this.loadingState.asReadonly();

  readonly count = computed(() => this.ongoing().length);
  /** É o que decide se a Mesa aparece no menu. */
  readonly hasOngoing = computed(() => this.count() > 0);

  constructor() {
    effect((onCleanup) => {
      const uid = this.auth.user()?.uid ?? null;
      const db = this.firestore;
      if (!uid || !db) {
        this.ongoingState.set([]);
        this.allState.set([]);
        this.loadingState.set(false);
        return;
      }

      const stop = watchMyOngoingStaffTournaments(
        db,
        uid,
        (view) => {
          this.ongoingState.set(view.ongoing);
          this.allState.set(view.all);
          this.loadingState.set(false);
        },
        // Quem não é equipe de nada não tem permissão de ler nada aqui: erro é lista vazia,
        // não erro de página.
        () => {
          this.ongoingState.set([]);
          this.allState.set([]);
          this.loadingState.set(false);
        },
      );
      onCleanup(() => stop());
    });
  }
}
