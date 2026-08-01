/** Resolve os docs completos de `arenas/{id}` para um conjunto de ids de arenas de equipe.
 *
 *  Extraído de `ArenaContextService.watchStaffMirror` pra poder ser testado sem um fake de
 *  Firestore: `load` é injetado, então um spec pode simular sucesso/rejeição por arena.
 *
 *  Isolamento por leitura: uma arena cuja leitura falhar (rede instável, por exemplo — não é
 *  permissão, `arenas` é de leitura pública) não pode derrubar as outras que já resolveram.
 *  Por isso `Promise.allSettled` em vez de `Promise.all` — a função nunca rejeita; na pior
 *  hipótese (todas as leituras falham) resolve para um Map vazio. */
export async function resolveStaffArenaDocs(
  arenaIds: readonly string[],
  load: (id: string) => Promise<Record<string, unknown> | null>,
): Promise<Map<string, Record<string, unknown>>> {
  const results = await Promise.allSettled(arenaIds.map((id) => load(id)));

  const docs = new Map<string, Record<string, unknown>>();
  results.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value != null) {
      docs.set(arenaIds[index]!, result.value);
    }
    // 'rejected' ou doc inexistente (`null`): essa arena simplesmente não entra no Map: a
    // arena continua contando como vínculo de equipe (via staffMirror), só sem o doc completo
    // (plano/courtsCount ficam nos defaults até a próxima leitura bem-sucedida).
  });
  return docs;
}
