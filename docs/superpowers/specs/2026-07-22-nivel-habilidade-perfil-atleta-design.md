# Nível de habilidade por modalidade no perfil do atleta (web)

## Contexto

Hoje `/perfil` (`frontend/projects/athlete/src/app/profile/athlete-profile-settings.component.ts`)
mostra, logo abaixo do nome, duas pills: esporte (laranja) e "nível" (cinza).
A pill de nível está ligada a `levelLabel()`, que é `Nível ${xp/100}` — o
**nível de XP/gamificação** (mesmo conceito do bloco de progresso logo
abaixo e do `userLevel` passado pro `AtPanelShellComponent`). Não é bug de
regressão do redesign de 07/07 (`2026-07-07-athlete-profile-screen-redesign-design.md`
já previa nível/XP ali) — é que o **nível de habilidade da modalidade**
(Iniciante 1 → Open) nunca fez parte de nenhuma versão dessa tela.

Esse nível de habilidade já existe e já é usado em produção em outros
lugares (onboarding, elegibilidade de categoria em torneio, ranking, perfil
público), guardado em `users/{uid}.sportOnboarding.levelsBySport`, um mapa
`código do esporte → código do nível`. É por modalidade, não único.

Duas inconsistências pré-existentes no dado, relevantes pra essa mudança:

1. **Esporte principal duplicado**: a pill de esporte de `/perfil` lê
   `athlete_profiles/{uid}.primarySport` (texto livre, ex. `"Volei de praia"`,
   editável nessa própria tela). O nível por modalidade é indexado por
   `sportOnboarding.primarySportId` (código, ex. `VOLEI_PRAIA`, definido no
   cadastro). Os dois podem divergir.
2. **Escada de nível duplicada em ~6 lugares** (`functions/src/category-level-eligibility.ts`,
   `firestore.rules`, `public-profiles-repository.ts`, `tournament-eligibility.ts`,
   `profile-format.ts`, `tournament-create.model.ts` no organizer) — não é
   escopo desta mudança consolidar tudo, só evitar criar mais uma cópia.

## Decisão

Substituir a pill de nível hoje errada (XP) por uma que mostra o nível de
habilidade real da modalidade principal do atleta, lido de
`sportOnboarding`. Se o atleta tiver nível salvo em mais de uma modalidade,
listar as demais numa lista compacta logo abaixo da pill principal. A pill
de esporte passa a ler do mesmo código oficial (`sportOnboarding.primarySportId`)
usado pelo nível, em vez do texto livre — as duas informações sempre batem.

Nível de XP/gamificação (`Nível 3`, barra de progresso, `userLevel` do
shell) **não muda** — é um conceito diferente (engajamento) e continua como
está.

## Escopo

### Dentro do escopo

- Ler `sportOnboarding.primarySportId`, `secondarySportIds` e
  `levelsBySport` de `users/{uid}` (documento já buscado por
  `loadRemoteProfile()` — nenhuma leitura nova no Firestore).
- Pill de esporte (laranja) passa a mostrar o rótulo do esporte principal
  resolvido por código, não mais o texto livre de `athlete_profiles.primarySport`.
- Pill de nível (cinza) ao lado passa a mostrar o nível de habilidade real
  da modalidade principal (Iniciante 1 / Iniciante 2 / Intermediário 1 /
  Intermediário 2 / Open), com `athleteLevelLabel()` (já existe em
  `profile-format.ts`).
- Se houver modalidades secundárias com nível salvo em `levelsBySport`,
  listá-las abaixo da pill principal (esporte + nível de cada uma).
- Fallback pro nível global legado (`users.level`/`.nivel`) quando a
  modalidade principal não tiver entrada em `levelsBySport` — mesma
  precedência já usada em `athlete-public-profile.component.ts`.
- Novo `sport-catalog.ts` (código → rótulo em PT) reaproveitado pela tela de
  perfil e pelo onboarding (que hoje mantém essa lista duplicada
  localmente).
- Modo edição: remover o seletor de botões "Esporte principal" (ficaria sem
  efeito, já que a pill não lê mais o campo que ele grava) e substituir por
  uma linha somente-leitura mostrando esporte + nível atuais.
- Remover código morto decorrente: `PRIMARY_SPORT_OPTIONS`, `selectSport()`,
  campo `primarySport` do form/`AthleteProfileData`/`EMPTY_PROFILE`/`save()`.
- Testes unitários (Jasmine, mesmo padrão de `profile-format.spec.ts`) para
  as funções puras novas.

### Fora do escopo

- Migrar ou apagar o campo `athlete_profiles/{uid}.primarySport` já gravado
  em contas existentes — só para de ser escrito/lido por essa tela; o valor
  antigo fica no documento sem uso.
- Mudar o fluxo de onboarding (além de importar o catálogo de esportes de um
  arquivo compartilhado em vez de uma lista local).
- Implementar escrita de `secondarySportIds`/modalidade secundária em
  qualquer tela web — hoje nenhum fluxo web grava isso. Se o app Flutter já
  gravar (não verificado neste levantamento), a tela lê o campo do mesmo
  jeito e funciona; se não gravar, a lista de "outras modalidades" nunca
  aparece na prática, o que é o comportamento correto.
- Qualquer mudança em nível de XP/gamificação, barra de progresso, ou
  `userLevel` do `AtPanelShellComponent`.
- Consolidar a escada de nível (`LEVEL_RANK`) que hoje vive duplicada em
  ~6 lugares do repo — fora do raio desta tarefa.
- Mudança em `firestore.rules` — confirmado que `athlete_profiles` não exige
  o campo `primarySport` na escrita, então removê-lo do payload de `save()`
  não quebra a regra existente.
- Cor por tier de nível (ex.: Open colorido diferente de Iniciante) — seguir
  o padrão neutro já usado em todas as outras telas que mostram nível
  (perfil público, diretório de atletas).

## Arquitetura

- `sport-catalog.ts` (novo, `frontend/projects/athlete/src/app/data/`):
  exporta `SPORT_CATALOG` (código, rótulo PT, ícone) — mesma lista hoje
  local em `athlete-onboarding.component.ts` (`SPORTS`) — e
  `sportLabelForCode(code)`, com fallback pra title-case do código cru
  quando desconhecido. `athlete-onboarding.component.ts` passa a importar
  daqui em vez de manter a lista local.
- `profile-format.ts`: nova função pura `buildSportLevels(userData)` →
  `{ code, sportLabel, levelLabel }[]`, ordenada (principal primeiro, depois
  secundárias), usando `sportLabelForCode` e `athleteLevelLabel` (já
  existe).
- `athlete-profile-settings.component.ts`: `loadRemoteProfile()` passa o
  `userData` (já buscado) por `buildSportLevels`, guarda o resultado num
  signal `sportLevels`. Dois computeds novos: `primarySportLevel` (primeiro
  item) e `otherSportLevels` (resto). `sportPillLabel` e o campo
  `primarySport` (form/interface/`save()`) são removidos.

## Dados e persistência

- Nenhuma leitura nova no Firestore — `users/{uid}` já é buscado hoje.
- Nenhuma escrita nova. `save()` deixa de gravar `primarySport` em
  `athlete_profiles/{uid}` (campo não lido por ninguém depois desta
  mudança).
- Nenhuma mudança em `firestore.rules` ou em Cloud Functions.
- Precedência de nível pra modalidade principal (mesma do perfil público):
  `levelsBySport[primarySportId]` → `users.level`/`.nivel` (legado) →
  `users.sportProfile.level` (legado mais antigo). Modalidades secundárias
  usam só `levelsBySport[code]`, sem fallback (se não tiver entrada, essa
  modalidade não aparece na lista).

## UI / Layout

- Pills da modalidade principal ficam exatamente onde estão hoje
  (`.at-profile-pills`, linha 46-49 do HTML) — visual idêntico ao atual
  quando o atleta só tem 1 modalidade (100% dos casos hoje).
- Lista de modalidades secundárias (só renderiza se `otherSportLevels().length > 0`):
  linhas compactas abaixo das pills, esporte + pill de nível cada uma.
- Sem dado de nível pra modalidade principal (caso-limite, ver abaixo): pill
  mostra "Nível não informado" em vez de ficar em branco.
- Modo edição: bloco "Esporte principal" (linhas 94-108 do HTML) deixa de
  ser um seletor de botões e vira uma linha somente-leitura ("Vôlei de
  praia · Intermediário 1 — definido no cadastro"), visualmente distinta de
  um campo editável (sem borda/fundo de input).

## Tratamento de erro e casos-limite

- Sem `sportOnboarding` no documento (conta que não passou pelo onboarding
  normal, ex. caminho de dev-auth-bypass): `sportLevels` fica vazio; pill
  principal cai pro texto livre de `athlete_profiles.primarySport` (ou
  "Vôlei de praia") com nível "Nível não informado" — nunca quebra a tela.
- Código de esporte fora do catálogo: `sportLabelForCode` retorna
  title-case do código cru.
- Código de nível desconhecido: já tratado por `athleteLevelLabel`
  (retorna o código cru).

## Testes

- Novos casos em `profile-format.spec.ts` (Jasmine, mesmo padrão já
  existente no arquivo) para `buildSportLevels`: só principal, principal +
  secundárias, sem `sportOnboarding`, fallback pro nível legado.
- Novo `sport-catalog.spec.ts` (ou casos dentro do mesmo arquivo) para
  `sportLabelForCode`: código conhecido, código desconhecido.
- Sem teste de componente novo — não é o padrão hoje pra essa tela;
  validação do componente fica pra QA manual no navegador.

## Fora do documento (decisões de implementação livres)

- Nome exato das classes CSS da lista de modalidades secundárias (seguir
  convenção `at-*` já usada no arquivo).
- Se `buildSportLevels` fica só em `profile-format.ts` ou vira um arquivo
  próprio, caso cresça.
- Texto exato da linha somente-leitura no modo edição.
