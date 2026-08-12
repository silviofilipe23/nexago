import type { Unsubscribe } from 'firebase/firestore';

/** Acompanha os docs completos de `arenas/{id}` das arenas em que este usuário é equipe.
 *
 *  Extraído de `ArenaContextService.watchStaffMirror` pra poder ser testado sem um fake de
 *  Firestore: `subscribe` é injetado, então um spec simula doc/erro/remoção por arena.
 *
 *  Por que listener e não leitura única (era `resolveStaffArenaDocs`, com `getDoc` por arena):
 *  o dono já acompanhava a arena ao vivo pela query de `watchArenas`, mas a equipe ficava com
 *  uma foto tirada uma vez só. Os campos lidos daqui mudam no servidor sem ação nenhuma do
 *  usuário (webhook do Asaas confirmando pagamento, sweeper `finalizeLapsedArenaPlans`, trigger
 *  de `courtsCount`) — para um gestor de equipe, nada disso aparecia até o espelho de equipe
 *  mudar. E as telas de Perfil/Contatos escrevem nesse mesmo doc: com a foto congelada, reabrir
 *  a tela depois de salvar mostrava os valores antigos.
 *
 *  Isolamento por arena: uma arena cuja leitura falhar (rede instável — não é permissão,
 *  `arenas` é de leitura pública) não derruba as outras. O erro só a mantém fora do mapa. */
export interface StaffArenaDocsWatcher {
  /** Assina as arenas que entraram e descarta as que saíram — chamável a cada mudança do
   *  espelho de equipe, quantas vezes for preciso. */
  sync(arenaIds: readonly string[]): void;
  /** Cancela todas as assinaturas e reporta o mapa vazio. Depois disso nenhum callback roda —
   *  é o que impede dados do usuário anterior de sobreviverem a uma troca de conta. */
  stop(): void;
}

/** `settled` fica true quando toda arena assinada já reportou ao menos uma vez (com doc ou com
 *  erro) — é o sinal de "já dá pra decidir acesso", que o guard downstream espera. */
export type StaffArenaDocsListener = (docs: Map<string, Record<string, unknown>>, settled: boolean) => void;

export function watchStaffArenaDocs(
  subscribe: (arenaId: string, onDoc: (data: Record<string, unknown> | null) => void) => Unsubscribe,
  onChange: StaffArenaDocsListener,
): StaffArenaDocsWatcher {
  const unsubscribes = new Map<string, Unsubscribe>();
  const docs = new Map<string, Record<string, unknown>>();
  const pending = new Set<string>();

  const emit = (): void => onChange(new Map(docs), pending.size === 0);

  return {
    sync(arenaIds: readonly string[]): void {
      const wanted = new Set(arenaIds);

      for (const [id, unsubscribe] of [...unsubscribes]) {
        if (wanted.has(id)) continue;
        unsubscribe();
        unsubscribes.delete(id);
        docs.delete(id);
        pending.delete(id);
      }

      const fresh = [...wanted].filter((id) => !unsubscribes.has(id));
      // Marca todas as novas como pendentes ANTES de assinar qualquer uma: `subscribe` pode
      // responder na mesma hora (cache do Firestore), e aí um `settled` prematuro liberaria o
      // guard de acesso com as outras arenas ainda sem resposta.
      for (const id of fresh) pending.add(id);
      for (const id of fresh) {
        unsubscribes.set(
          id,
          subscribe(id, (data) => {
            if (data == null) docs.delete(id);
            else docs.set(id, data);
            pending.delete(id);
            emit();
          }),
        );
      }

      emit();
    },

    stop(): void {
      for (const unsubscribe of unsubscribes.values()) unsubscribe();
      unsubscribes.clear();
      docs.clear();
      pending.clear();
      emit();
    },
  };
}
