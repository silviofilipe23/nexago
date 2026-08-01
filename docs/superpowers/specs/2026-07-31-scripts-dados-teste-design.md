# Scripts de dados de teste — criar e apagar

**Data:** 2026-07-31
**Escopo:** `functions/scripts/` — scripts administrativos Node (admin SDK), fora do runtime das Cloud Functions
**Arquivos novos:** `seed-test-data.js`, `delete-test-data.js`, `seed-athletes-lib.js`
**Arquivos tocados:** `seed-athletes.js` (vira wrapper), `seed-tournament-enrollments-lib.js` (args injetáveis), `package.json` (atalhos)

## Problema

Criar um cenário de teste completo (atletas + duplas + torneio inscrito) hoje exige dois comandos
em ordem obrigatória, com um pré-requisito que não é óbvio:

```bash
node scripts/seed-athletes.js --project <id>
node scripts/seed-tournament-with-enrollments.js --project <id> --manager-uid <uid> --yes
```

O `--manager-uid` precisa ser descoberto à mão (um uid de organizador que já exista no projeto), e
rodar o segundo script sem o primeiro produz um torneio vazio, com a mensagem genérica
"Nada a inscrever".

O lado da limpeza é pior: **não existe nenhum script que apague o torneio de teste.** O único
delete disponível, `delete-seed-athletes.js`, remove apenas os atletas — e de forma incompleta:

- Usa `batch.delete(doc.ref)`, que **não apaga subcoleções** de `users/{uid}`
  (`notifications`, `tokens`, `favorites`, ...). Elas ficam órfãs e invisíveis, porque
  um doc-pai apagado no Firestore não impede a existência de subcoleções.
- Apagando só os atletas, o torneio seed continua no Firestore com `enrolledCount: 160` e
  160 inscrições apontando para uids que não existem mais — o app renderiza duplas fantasma.

Resultado prático: cada rodada de teste deixa lixo acumulado no projeto de dev.

## Objetivo

Dois comandos simétricos, cada um autossuficiente:

```bash
node scripts/seed-test-data.js   --project volley-track-dev-4596c --yes   # cria tudo
node scripts/delete-test-data.js --project volley-track-dev-4596c --yes   # apaga tudo
```

Rodar o segundo logo depois do primeiro deve devolver o projeto ao estado anterior, sem
documentos órfãos em nenhuma coleção.

## O que já existe e vai ser reaproveitado

| Script | Papel | Marcador |
|---|---|---|
| `seed-athletes.js` | Auth + `users/{uid}` — 5 níveis × 2 gêneros × `COUNT` | `seedTestAthlete: true` |
| `seed-tournament-enrollments-lib.js` | torneio + `teams` + `inscriptions` pagas | `seedTestTournament: true` |
| `seed-tournament-with-enrollments.js` | wrapper: torneio daqui a 14 dias | — |
| `seed-tournament-today-with-enrollments.js` | wrapper: torneio hoje | — |
| `delete-seed-athletes.js` | apaga só atletas (incompleto) | — |

**Nenhum desses comandos muda de comportamento.** Os scripts novos orquestram a lógica existente;
os antigos continuam funcionando exatamente como hoje.

## Design

### 1. `seed-athletes-lib.js` — extração

`seed-athletes.js` hoje mistura parsing de argumentos, `admin.initializeApp()`, a lógica de seed e
`process.exit()` num arquivo só, o que impede reuso. A lógica sai para uma lib, seguindo o padrão
que o seed de torneio já usa (`seed-tournament-enrollments-lib.js` + wrappers finos):

```js
// seed-athletes-lib.js
async function seedAthletes({db, auth, count, password, city, state, log})
  // → { total, byCategory: Map<categoryId, uid[]> }
```

`generateKeywords`, `birthDateForLevel`, `phoneFor` e `ensureAuthUser` movem junto, sem alteração
de comportamento. A lib **não** chama `initializeApp` nem `process.exit` — recebe `db`/`auth`
prontos, para poder ser chamada em sequência com outro seed no mesmo processo.

`seed-athletes.js` vira o wrapper que faz o parsing, inicializa o admin e chama a lib. A saída no
terminal e o resultado no Firestore ficam idênticos aos de hoje.

### 2. `seed-tournament-enrollments-lib.js` — args injetáveis

`runTournamentEnrollmentSeed` chama `parseSeedArgs` internamente, que lê `process.argv`, chama
`admin.initializeApp()` e faz `process.exit(1)` se faltar argumento. Isso impede que o orquestrador
passe valores próprios (o uid do organizador que ele acabou de criar, por exemplo).

Correção mínima e retrocompatível — um parâmetro opcional:

```js
async function runTournamentEnrollmentSeed({
  defaultTournamentName,
  buildTournamentDoc,
  extraLogLines = () => [],
  args,                    // ← novo: se ausente, cai em parseSeedArgs() como hoje
})
```

Os dois wrappers existentes não passam `args` e seguem inalterados.

### 3. `seed-test-data.js` — o orquestrador

**Argumentos:**

| Flag | Default | Efeito |
|---|---|---|
| `--project <id>` | — (obrigatório) | projeto Firebase |
| `--yes` | ausente = dry-run | aplica de verdade |
| `--manager-uid <uid>` | cria organizador seed | organizador do torneio |
| `--count <n>` | `32` | atletas por nível×gênero |
| `--today` | ausente | torneio hoje em vez de daqui a 14 dias |
| `--tournament-name <s>` | `"Torneio seed nexaGO"` | nome do torneio |
| `--credentials <path>` | ADC | service account explícito |

**Sequência:**

1. **Organizador.** Sem `--manager-uid`, garante `seed-organizer@nexago.test` no Auth
   (`roles: ["organizer"]` nos custom claims) e o doc `users/{uid}` correspondente, marcado
   com `seedTestOrganizer: true`. Idempotente: se o e-mail já existe, reaproveita o uid.
   Com `--manager-uid`, usa o uid informado e não cria nada.
2. **Atletas.** Chama `seedAthletes` da lib nova.
3. **Torneio + duplas + inscrições.** Chama `runTournamentEnrollmentSeed` com `args` injetados
   (`{APPLY, projectId, MANAGER_UID, TOURNAMENT_NAME}`) e o `buildTournamentDoc` escolhido pelo
   `--today`.

**Volume no default (`--count 32`):** 320 atletas → 10 categorias × 16 duplas = 160 duplas e
160 inscrições pagas. Os números fecham exatos porque `buildPairPlans` limita o pool a
`maxTeams × 2 = 32` atletas por categoria, que é precisamente quantos o seed de atletas cria
por combinação nível×gênero.

O torneio nasce `status: "open"`, **sem chave gerada** — gerar a chave é o fluxo que se quer
testar pelo painel, então o seed não o antecipa.

**Nome padrão.** O default vira `"Torneio seed nexaGO"`, sem o sufixo `"— 6 categorias"` que o
script antigo usa: o torneio tem 10 categorias (5 níveis × 2 gêneros), não 6 — o sufixo é herança
de quando a escada de níveis tinha 3 degraus. O nome mais curto continua reaproveitando um torneio
criado pelo script antigo, porque `namesMatch` compara por `includes` nos dois sentidos: o nome
curto está contido no longo, então o seed reutiliza em vez de duplicar.

**Dry-run:** sem `--yes`, imprime o plano (organizador, contagem de atletas, categorias, duplas
previstas) e não escreve nada. Mesma convenção dos scripts atuais.

### 4. `delete-test-data.js` — a limpeza em cascata

**Argumentos:**

| Flag | Default | Efeito |
|---|---|---|
| `--project <id>` | — (obrigatório, sem fallback) | projeto Firebase |
| `--yes` | ausente = dry-run | apaga de verdade |
| `--force` | ausente | prossegue mesmo com atleta real inscrito no torneio seed |
| `--credentials <path>` | ADC | service account explícito |

**Guardas de segurança**, nesta ordem, antes de qualquer leitura:

1. **`--project` é obrigatório e nunca tem fallback.** Diferente dos scripts atuais, não lê
   `GCLOUD_PROJECT`/`GOOGLE_CLOUD_PROJECT`. Motivo: em `.firebaserc` o alias `default` aponta para
   **produção** (`volley-track-2dd3b`), então um fallback silencioso poderia apagar dados reais.
2. **Produção bloqueada.** Se o projeto for `volley-track-2dd3b`, aborta com mensagem explícita.
   Sem flag de override — este script não tem motivo para rodar em produção.
3. **Dry-run por padrão.** Sem `--yes`, só relata.

**Descoberta e cascata.** Filho antes do pai, para nunca deixar órfão:

| # | Alvo | Como acha |
|---|---|---|
| 1 | `artifacts/{pid}/public/data/matches` | `where tournamentId in <ids seed>` |
| 2 | `artifacts/{pid}/public/data/inscriptions` | `where tournamentId in <ids seed>` — guarda os `teamId` |
| 3 | `artifacts/{pid}/public/data/teams` | pelos `teamId` coletados no passo 2 |
| 4 | `tournaments/{id}` | `where seedTestTournament == true` |
| 5 | `users/{uid}` | `where seedTestAthlete == true` + `where seedTestOrganizer == true` |
| 6 | `public_profiles/{uid}` | pelos uids do passo 5 |
| 7 | contas do Auth | pelos uids do passo 5 |

Detalhes que a implementação precisa respeitar:

- **`users` sai por `recursiveDelete`**, não `batch.delete` — é o que apaga as subcoleções
  (`notifications`, `tokens`, `favorites`). Mesmo mecanismo do
  `deleteOwnAccount` em `functions/src/account-deletion.ts:23`.
- **`public_profiles` é varrido explicitamente** mesmo já existindo o trigger
  `onUserWrittenSyncPublicProfile`, que apaga o espelho quando `users/{uid}` some. O trigger só
  atua se estiver deployado naquele projeto, e o script não tem como verificar isso — a varredura
  explícita é barata e torna a limpeza independente do estado de deploy.
- **`where ... in` aceita no máximo 30 valores** por query no Firestore; a busca de `matches` e
  `inscriptions` precisa fatiar a lista de ids de torneio em blocos.
- Deletes em lote de 450 ops (limite prático do `batch`), e `auth.deleteUsers` em blocos de 1000.

**Verificações de contaminação**, rodadas antes de aplicar:

- **Atleta real inscrito em torneio seed** (uid presente em `participantUids` de uma inscrição do
  torneio seed, mas sem `seedTestAthlete: true`) → **aborta antes de apagar qualquer coisa**,
  listando os uids e nomes. Apagar o torneio destruiria a inscrição de alguém de verdade.
  Com `--force`, prossegue: apaga o torneio e todas as inscrições dele, **inclusive a do atleta
  real** — mas nunca o `users/{uid}` nem a conta Auth desse atleta, que não é dado de teste.
- **Atleta seed inscrito em torneio real** (uid tem inscrição cujo `tournamentId` não está no
  conjunto de torneios seed) → **não aborta; preserva aquele atleta** e segue com o resto.
  Preservar significa manter os três: `users/{uid}`, `public_profiles/{uid}` e a conta no Auth.
  Apagá-lo deixaria uma chave real com participante inexistente. Os uids preservados vão no
  relatório final, para o operador decidir o que fazer com eles à mão.

**Relatório.** Antes de aplicar (e no dry-run), imprime a contagem por coleção e o total, para o
operador conferir a ordem de grandeza antes de confirmar.

### 5. `package.json` — atalhos

```json
"seed-test-data": "node scripts/seed-test-data.js",
"delete-test-data": "node scripts/delete-test-data.js"
```

Os atalhos existentes (`seed-tournament`, `seed-tournament-today`, `bulk-enroll`) permanecem.

## Pré-requisitos de execução

- **Credenciais admin:** `gcloud auth application-default login`, ou
  `GOOGLE_APPLICATION_CREDENTIALS=<path>`, ou `--credentials <path>`.
- **`npm run build` antes de rodar.** `seed-tournament-enrollments-lib.js` importa de `../lib/`
  (`category-display-labels`, `tournament-collected-stats`, `organizer-category-ops-payments`,
  `tournament-registration-guards`), que é a saída compilada do TypeScript. Sem build, ou com
  build desatualizado, o require falha ou usa lógica velha.

## Testes

Os scripts em `functions/scripts/` não têm suíte de testes hoje — são ferramentas administrativas
executadas à mão, e o `npm test` roda apenas `lib/**/*.test.js` (saída do TypeScript). Manter esse
padrão: sem teste automatizado novo.

A verificação é o **ciclo completo no projeto de dev**, que é a única forma de exercitar
credenciais, triggers e limites reais do Firestore:

1. `delete-test-data.js` (dry-run) — confirmar estado inicial limpo.
2. `seed-test-data.js` (dry-run) — conferir o plano.
3. `seed-test-data.js --yes` — conferir contagens: 320 atletas, 160 duplas, 160 inscrições,
   `enrolledCount: 160` no torneio.
4. Conferir no painel do organizador que o torneio aparece com as inscrições.
5. `delete-test-data.js --yes` — conferir que todas as coleções voltaram a zero, incluindo
   `public_profiles` e as contas no Auth.
6. Rodar `delete-test-data.js --yes` de novo — deve ser idempotente e não falhar com nada a apagar.

## Fora de escopo

- **Geração de chave/`matches` pelo seed.** O torneio nasce aberto; a chave é gerada pelo painel.
  O delete, no entanto, **já apaga `matches`**, para cobrir o caso de a chave ter sido gerada
  manualmente durante o teste.
- **Ligas (`leagues/{id}`).** O seed cria um torneio avulso, sem `leagueId`.
- **Arenas.** Já existe `grant-arena-to-user.js` para isso.
- **Aposentar os scripts antigos.** `seed-athletes.js`, `seed-tournament-*.js` e
  `delete-seed-athletes.js` continuam existindo e funcionando.
