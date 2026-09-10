/**
 * Regiões de deploy das Cloud Functions.
 *
 * O Firestore deste projeto vive em `southamerica-east1` (ver `firebase.json`),
 * mas as callables nasceram sem `region` e caíram no padrão `us-central1`. O
 * resultado é que cada leitura feita dentro de uma callable atravessa o
 * continente duas vezes: navegador (Brasil) → Iowa → São Paulo → Iowa → Brasil.
 * No portal do organizador isso colocava um piso de ~800 ms em operações que
 * fazem literalmente duas leituras e uma escrita.
 *
 * Região de callable NÃO muda no lugar: apontar só para São Paulo apaga o
 * endpoint de Iowa, e todo cliente que continuar pedindo `us-central1` — o app
 * publicado na loja, bundles web em cache — passa a receber `NOT FOUND`. Por
 * isso as duas regiões convivem: os clientes migram no ritmo deles e
 * `us-central1` só é aposentada quando não sobrar ninguém pedindo por ela.
 */
export const PORTAL_CALLABLE_REGIONS = ["us-central1", "southamerica-east1"];
