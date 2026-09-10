/**
 * Onde as Cloud Functions rodam.
 *
 * O Firestore deste projeto vive em `southamerica-east1` (ver `firebase.json`),
 * mas as funções nasceram sem `region` e caíram no padrão `us-central1`. Nesse
 * arranjo tudo atravessa o continente sem precisar: uma callable chamada do
 * Brasil sobe até Iowa, lê o banco em São Paulo, e desce de volta — cada
 * leitura é uma ida e volta de ~130 ms. No portal do organizador isso colocava
 * um piso de ~800 ms em operações que fazem duas leituras e uma escrita.
 *
 * São Paulo é a casa. Gatilhos e agendadas vão direto, porque ninguém os chama
 * por região: quem os dispara é o próprio Firestore e o Cloud Scheduler
 * (`setGlobalOptions` em `index.ts`).
 *
 * O que tem cliente do outro lado não pode mudar de uma vez. Região não muda no
 * lugar: apontar só para São Paulo APAGA o endpoint de Iowa, e nesse instante
 *
 *   - o app publicado na loja passa a receber `NOT FOUND` em toda callable
 *     (28 arquivos Dart usam `FirebaseFunctions.instance`, que é Iowa por
 *     omissão), e
 *   - Asaas, Mercado Pago e o emissor fiscal seguem entregando webhook numa
 *     URL que deixou de existir — pagamento confirmado que nunca chega.
 *
 * Por isso essas convivem nas duas regiões enquanto a migração acontece. Iowa
 * só cai quando não sobrar ninguém pedindo por ela — ver ROLLOUT abaixo.
 */

/** A casa: mesma região do Firestore. Padrão de tudo que não tem cliente. */
export const DEFAULT_REGION = "southamerica-east1";

/**
 * Callables e endpoints HTTP durante a travessia. São Paulo é o destino;
 * `us-central1` é a ponte que sustenta quem ainda não migrou.
 *
 * ROLLOUT — o que precisa acontecer antes de tirar `us-central1` daqui:
 *
 *  1. Portais web deployados apontando para `southamerica-east1`
 *     (`shared/firebase-region.ts` de cada projeto em `frontend/projects/`).
 *  2. App Flutter publicado com `FirebaseFunctions.instanceFor(region: ...)`,
 *     e as versões antigas fora de circulação.
 *  3. URL de webhook re-cadastrada no painel do Asaas (`ASAAS.md`), no app
 *     OAuth do Mercado Pago e no emissor fiscal (`FISCAL.md`) — e o
 *     `MERCADOPAGO_PUBLIC_REGION` de `mercadopago-endpoints.ts` acompanhando.
 *
 * Cumpridos os três, esta lista vira `[DEFAULT_REGION]` e o deploy seguinte
 * recolhe Iowa.
 */
export const CLIENT_FACING_REGIONS = [DEFAULT_REGION, "us-central1"];
