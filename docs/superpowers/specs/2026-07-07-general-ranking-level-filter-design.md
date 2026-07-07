# Filtro de nível no ranking geral

## Contexto

O ranking geral (`AthleteRankingPage`) já filtra por gênero e por ano, mas não
por nível do atleta — mesmo o nível já aparecendo hoje como subtítulo em cada
linha da lista. Diferente do ranking de liga (onde "categoria" é um documento
por torneio, com ID próprio), o ranking geral soma pontos de **todos os
torneios e todos os esportes** num único documento por atleta/dupla
(`athleteRankings`/`teamRankings`, sem campo de categoria nem de esporte) — não
existe uma "categoria" que atravesse torneios diferentes ali. O que existe, e
é o equivalente real, é o **nível declarado do atleta** (escada de 5 degraus:
Iniciante 1, Iniciante 2, Intermediário 1, Intermediário 2, Open — ver
`docs/business-rules/levels.md`).

## Escopo

Adicionar um filtro por nível na tela de ranking geral, análogo ao filtro de
gênero já existente. Só visualização/filtro no app — nenhuma mudança em
Cloud Functions, Firestore rules, ou nos documentos agregados de ranking.

## Resolução de nível

O nível não existe hoje no modelo usado pelo ranking (`AppUserProfile`, lido
de `public_profiles` via `UsersRepository.getUsersByIds` — já chamado pelo
ranking pra nome/avatar/gênero, sem leitura nova necessária). É preciso:

- `AppUserProfile` ganha dois campos novos, lidos de `sportOnboarding` (já
  espelhado em `public_profiles` pela Cloud Function de sync):
  - `primarySportFirestoreId` ← `sportOnboarding.primarySportId`
  - `levelsBySportFirestore` ← `sportOnboarding.levelsBySport` (mapa código de
    esporte → código de nível)
- Nível do atleta pro ranking = `levelsBySportFirestore[primarySportFirestoreId]`.
  **Sem** fallback pro campo global legado (`level`/`nivel`) — se o atleta não
  tem esporte principal definido, ou não tem nível registrado nele, ele fica
  **sem nível resolvido** (não "Iniciante" por padrão).
- Nível da dupla (modo Duplas) = o **maior rank** entre os dois atletas —
  mesma regra do anti-sandbagging ("vale o integrante mais forte"), usando o
  rank já canônico no app (`AthleteProfileOptions.levelRank`).
- Isso substitui a função `levelsFor` hoje em `ranking_providers.dart`, que
  consulta uma coleção `athlete_profiles` separada (parece legado/divergente
  do espelho real `public_profiles` usado em todo o resto do app) só pra ler
  `level`/`nivel` pro subtítulo. Ela é removida e o subtítulo passa a usar a
  mesma resolução por esporte principal, corrigindo de brinde uma
  inconsistência de dados que já existia (o subtítulo de nível hoje pode estar
  lendo da coleção errada).

## Comportamento do filtro

- Correspondência **exata** por nível — igual ao filtro de gênero, não é
  "esse nível ou acima".
- Atleta/dupla **sem nível resolvido nunca aparece** quando um nível
  específico está selecionado. Em "Todos os níveis" (opção padrão), aparece
  normalmente independente de ter nível resolvido ou não.
- É um filtro independente, combinado (E lógico) com gênero, ano e busca —
  todos precisam bater simultaneamente, igual já acontece hoje entre
  gênero/ano/busca.

## UI

Um dropdown novo, mesmo padrão visual do `_CategoryDropdown` já construído
pro ranking de liga (pill, borda, texto), como uma **linha própria** entre o
filtro de ano (`RankingYearFilterRow`) e a lista de entradas — não mexe no
ícone/folha de filtro de gênero que já existe na app bar.

- Rótulo padrão (nada selecionado): "Todos os níveis".
- Opções no menu: "Todos os níveis" + os 5 níveis em ordem crescente de rank
  (Iniciante 1 → Iniciante 2 → Intermediário 1 → Intermediário 2 → Open),
  usando `AthleteProfileOptions.labelForRank(rank)` para os rótulos —
  mesma fonte de verdade já usada em "Esportes e Níveis", sem reimplementar
  os textos.
- Aparece tanto em modo Atletas quanto Duplas (a resolução de nível muda
  conforme a seção acima, mas o controle é o mesmo).

## Mudanças técnicas (visão geral, sem código — detalhado no plano)

- `AppUserProfile` (`core/profiles/app_user_profile.dart`): + 2 campos.
- `RankingPageFilter` (`ranking_list_models.dart`): + campo `level` (nullable).
- `ranking_logic.dart`: novas funções `filterAthleteRowsByLevel` /
  `filterTeamRowsByLevel`, espelhando `filterAthleteRowsByGender` /
  `filterTeamRowsByGender`.
- `ranking_list_mapper.dart`: `buildAthleteRankingListEntries` e
  `buildTeamRankingListEntries` passam a resolver e filtrar por nível.
- `ranking_providers.dart`: remove `levelsFor` (coleção `athlete_profiles`);
  nível passa a vir do mesmo mapa de `profiles` já buscado.
- Novo widget de dropdown (mesmo padrão do `_CategoryDropdown`), inserido em
  `athlete_ranking_page.dart` entre `RankingYearFilterRow` e a lista.

## Fora de escopo

- Qualquer mudança em Cloud Functions, regras do Firestore, ou nos
  documentos `athleteRankings`/`teamRankings`.
- Filtro por esporte no ranking geral (ele continua cruzando todos os
  esportes; usar sempre o esporte principal do atleta pro nível, não o
  esporte do torneio individual).
- Fallback pro campo de nível global legado (`level`/`nivel`) — decisão
  deliberada, não um esquecimento.
