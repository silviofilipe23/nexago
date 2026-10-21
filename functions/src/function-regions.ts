/**
 * Onde as Cloud Functions rodam.
 *
 * O Firestore deste projeto vive em `southamerica-east1` (ver `firebase.json`),
 * e as funções rodam ao lado dele. Até setembro/2026 elas caíam no padrão
 * `us-central1`: uma callable chamada do Brasil subia até Iowa, lia o banco em
 * São Paulo e descia de volta — ~170 ms por leitura contra ~24 ms daqui.
 *
 * Gatilhos e agendadas vêm do padrão global (`setGlobalOptions` em
 * `global-options.ts`). Callables e endpoints HTTP declaram a região
 * explicitamente com `CLIENT_FACING_REGIONS`.
 *
 * A ponte em `us-central1` (que sustentou o app < 109, bundles antigos dos
 * portais e os webhooks cadastrados em Iowa durante a migração) foi retirada
 * em outubro/2026. Voltar a pôr uma região aqui CRIA endpoints novos; tirar uma
 * APAGA os dela — e quem ainda chamar por aquela URL recebe `NOT FOUND`.
 */

/** A casa: mesma região do Firestore. */
export const DEFAULT_REGION = "southamerica-east1";

/** Callables e endpoints HTTP — mesma casa, sem ponte. */
export const CLIENT_FACING_REGIONS = [DEFAULT_REGION];
