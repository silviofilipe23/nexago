# Rollout da identidade única da dupla — DEV, 22/09/2026

O PR #477 (`resolvePairTeamTx`) entrou na main em 21/09 14:27 BRT, mas as Cloud
Functions publicadas eram de 21/09 08:03 BRT. O código nunca rodou, e a
duplicação de equipes seguiu como antes: cada inscrição criava uma identidade
nova para a mesma dupla.

Como se prova sem abrir console: `createPairTeam` **sempre** grava `pairKey`.
Todo doc de dupla criado depois do merge estava sem o campo — logo, quem criou
foi a função velha.

## Ordem executada (é obrigatória)

| # | Passo | Resultado |
|---|---|---|
| 1 | `node scripts/backfill-team-pair-key.js --project volley-track-dev-4596c --apply` | 28/28 docs |
| 2 | `firebase deploy --only firestore:rules --project volley-track-dev-4596c` | `pairKey` virou campo server-only |
| 3 | `firebase deploy --only functions --project volley-track-dev-4596c` | 24 falhas em `southamerica-east1`, reenviadas em lotes de 4 (37 updates, 0 falhas) |
| 4 | `node scripts/merge-duplicate-pair-teams.js --project volley-track-dev-4596c --apply` | 4 pares, 11 repontes, 5 remoções, 62 fontes varridas sem sobra |
| 5 | `node scripts/check-registration-team-integrity.js --project volley-track-dev-4596c` | 0 quebradas antes e depois |

O backfill vem antes do deploy porque `resolvePairTeamTx` encontra a equipe do
par consultando `pairKey`: sem o campo a query volta vazia e o sangramento
continua. O merge vem depois do deploy pelo motivo oposto — fundir com a função
velha no ar só adia a próxima duplicata.

Estado final no dev: 192 docs de dupla, todos com `pairKey`, 0 pares duplicados.

## Armadilha do deploy

`firebase deploy --only functions` (243 functions) falhou em 24 delas **e saiu
com exit code 0**. O mesmo aconteceu em 14/09. Não é a função: `setUserRole`
sozinha sobe sem erro. É atualização simultânea demais em São Paulo — reenviar
o bloco inteiro repete a falha, reenviar em lotes de ~4 fecha. Não rode o deploy
com `| tail -N`: a causa do erro está no começo do log.

## PROD (`volley-track-2dd3b`)

Intocado: 5 docs de dupla, 0 duplicados, backfill nunca rodou (0 com `pairKey`).
Não há o que fundir, mas no dia em que as functions subirem, o passo 1 tem de ir
antes.

## De-para da fusão

`2026-09-22-merge-pair-teams-dev.json` — id sobrevivente e ids absorvidos de
cada par, gravado pelo script antes de qualquer escrita. É o que permite
rastrear um teamId antigo que apareça em log, print ou export.
