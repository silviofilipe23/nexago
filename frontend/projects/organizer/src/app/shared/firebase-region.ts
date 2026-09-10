/** Região das Cloud Functions que o portal chama.
 *
 *  O Firestore do projeto vive em `southamerica-east1` (ver `firebase.json`), mas o SDK pede a
 *  callable em `us-central1` quando ninguém diz o contrário. Nesse padrão cada clique atravessa
 *  o continente duas vezes — uma para chegar na função em Iowa, e de novo a cada leitura que ela
 *  faz no banco em São Paulo —, o que colocava um piso de ~800 ms em operações que fazem duas
 *  leituras e uma escrita.
 *
 *  As callables deployam nas DUAS regiões (`functions/src/function-regions.ts`), então o app
 *  Flutter e bundles web antigos seguem atendidos em `us-central1` enquanto o portal vem para cá.
 */
export const FUNCTIONS_REGION = 'southamerica-east1';
