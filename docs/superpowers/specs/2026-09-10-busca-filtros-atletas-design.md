# Busca e filtros na listagem de atletas do app (Descobrir)

Data: 2026-09-10
Branch: `claude/athlete-search-filters-95d619`
Tela: `AthleteDiscoverPage` — `nexago_app/lib/features/athlete/presentation/athlete_discover_page.dart`

## O que esta entrega faz

Corrige a busca da tela **Descobrir** (que hoje não encontra nome composto), converte cidade e UF
em filtros de verdade, remove os filtros que são fachada e para de exibir distância inventada nos
cards.

**Não** mexe no gerador de `keywords`, **não** cria campo derivado novo, **não** cria índice novo e
**não** depende de backfill para funcionar.

## O bug que motiva a entrega

`AthleteDiscoverRepository.searchProfiles`
(`nexago_app/lib/features/athlete/data/athlete_discover_repository.dart:246`) tem busca **própria**
e **antiga**: usa `normalizeSearchTerm(term)`, que colapsa a frase inteira num token só. `"joão
silva"` vira `joaosilva` e nunca casa, porque `keywords` guarda prefixo **por palavra**.

Esse era exatamente o defeito corrigido em 20/08 no rework multi-token, que reescreveu a busca em
três superfícies. **O Descobrir ficou de fora daquele rework** e continuou com a versão quebrada.
A correção já existe, testada, em `rankAthleteSearchResults`
(`nexago_app/lib/core/profiles/athlete_search_results.dart`).

## Decisões tomadas

| | |
|---|---|
| Busca escrita | **Nome ou @apelido apenas.** Cidade e esporte não entram no texto |
| Cidade/esporte | Viram **filtro**, não busca |
| Push-down de UF | **Sim** — o índice `hasAthleteRole + state` já existe |
| Push-down de nível | **Não.** Decisão explícita: não se busca por nível |
| Campo derivado novo | **Nenhum.** Sem 4ª cópia de lógica em TypeScript |
| Backfill | Só em dev; o design não pode depender dele |
| Estado vazio | Vazio é vazio — sem sugestão de converter termo em filtro |

## 1. Correção da busca

`searchProfiles` deixa de ter busca própria e passa a reusar o ranqueador compartilhado. As duas
peças já leem a **mesma coleção**, `public_profiles`, então a reutilização é direta:

1. Consulta pela **âncora** (token mais longo do termo) em `hasAthleteRole + keywords CONTAINS`.
2. `AthleteSearchDoc.fromSnapshot` sobre os snapshots devolvidos.
3. `rankAthleteSearchResults(docs, tokens, max: 25)` aplica o `AND` dos tokens restantes e ordena
   por relevância, devolvendo `AppUserProfile` em ordem.
4. Mapeia cada uid de volta para **o mesmo snapshot** já em mãos → `AthleteProfile.fromFirestore`.

O passo 4 é o que evita leitura extra: os dois mappers consomem o mesmo `Map<String, dynamic>`.

**Não altera `athlete_search_results.dart` nem `search_keywords.dart`.** A paridade de três cópias
do gerador fica intacta.

**Ganho colateral:** morre o N+1 do fallback atual, que fazia um `.doc().get()` por resultado
(`athlete_discover_repository.dart:270`).

**Compatibilidade de predicado:** `rankProfileSearchResults` filtra por `isPartnerListableProfile`,
que é apenas "tem nome de exibição" (`app_user_profile.dart:231`) — ortogonal a
`isDiscoverableProfile`, que segue sendo aplicado por cima no pipeline. Não há conflito.

## 2. Cidade e UF como filtro

- **UF vai ao servidor.** O índice `hasAthleteRole + state ASC + __name__` já existe em
  `firestore.indexes.json`. Nenhum índice novo.
- **Cidade fica no cliente**, sobre o conjunto já reduzido pela UF.

**Onde aparece na UI:** ambos entram na folha de filtros
(`athlete_discover_filters_sheet.dart`), numa seção `LOCALIZAÇÃO`, ocupando o espaço deixado pela
seção `DISTÂNCIA` removida. UF é lista fixa das 27 unidades federativas. Cidade é uma lista
derivada das cidades **presentes no catálogo carregado** daquela UF, ordenada alfabeticamente —
não é campo de texto livre, para não repetir o problema de acento e caixa que impede consulta.
Cidade fica desabilitada enquanto nenhuma UF estiver escolhida.

**Constraint composta:** UF entra em `DiscoverFirestoreConstraints` junto com gênero e
`lookingForPartner`. Gênero + UF **não** têm índice composto hoje; quando os dois estiverem ativos,
vale a mesma degradação já implementada em `fetchProfilesForDiscover` — o `catch` cai para o
catálogo completo. O plano deve confirmar esse caminho em vez de presumi-lo.

Isso ataca de lado o problema de performance: hoje **qualquer** filtro dispara `_loadFullCatalog()`,
que pagina até 2000 perfis e ainda chama `enrichEntries` (ranking geral inteiro + seguidores de
todos). Com UF como constraint de servidor, a varredura cai para a fração daquele estado.

O `hintText` do campo passa de `'Nome, cidade ou esporte...'` para `'Nome ou @apelido'`, que é o que
a busca de fato entrega.

## 3. Remoção dos filtros de fachada

Saem da folha de filtros, com predicados e campos de modelo correspondentes:

- slider de distância e switch "Sem limite de distância" — a distância nunca foi calculada
- "Disponíveis agora" — cujo subtítulo ainda vaza implementação: *"Requer lastActiveAt no perfil"*
- "Objetivo do jogo" — casado por heurística de substring em texto livre
  (`gameObjectiveFromFirestore`), o que erra em silêncio

`AthleteDiscoverSort.proximity` **permanece**: ordenar por proximidade compara cidade/UF de verdade
(`_proximityScore`), não depende da distância falsa. Registre-se, porém, que ela segue
**inalcançável** — não há UI de ordenação (ver "Fora de escopo"). Fica por estar correta, não por
estar em uso.

### 3.1 A distância falsa também está impressa no card

Achado durante o desenho, mais grave que o filtro: `proximityDistanceLabel`
(`athlete_discover_models.dart:170`) devolve as strings **hard-coded** `'2.1 km'` e `'25 km'` a
partir de mera comparação de cidade/UF. O card renderiza isso via `discoverStatsLine`
(`athlete_discover_card.dart:38`), e `discoverContextTag` deriva o selo "Perto de você" do prefixo
dessa string inventada.

Ou seja: **todo card do Descobrir mostra hoje uma distância que ninguém mediu.** Passa a exibir
rótulo honesto — "Mesma cidade" / "Mesmo estado" — e o selo "Perto de você" passa a derivar da
comparação de cidade, não do texto.

**Fora do escopo, sinalizado:** existe cópia do mesmo número falso em
`nexago_app/lib/features/tournaments/domain/team_discover_models.dart:189`, na tela de duplas. Não
será tocada nesta entrega.

## 4. O `@` derivado deixa de ser inventado

`athletePublicHandle` (`athlete_public_profile_models.dart:161`) hoje tem duas vias:

- com apelido preenchido → `@` + apelido, em minúsculas;
- **sem apelido → inventa `@primeiro.ultimo` a partir do nome.**

A segunda via cria identidade falsa. O campo APELIDO é livre — sem validador, aceita espaço e
acento (`athlete_edit_profile_page.dart:617`) — e **não existe unicidade alguma** no projeto
(nenhum `nicknameTaken`/`uniqueNickname` em lugar nenhum). Dois "João Silva" sem apelido exibem o
mesmo `@joao.silva`, com cara de username e sem ser um.

**Correção:** `athletePublicHandle` devolve `null` quando não há apelido. O `@` passa a aparecer
somente quando a pessoa escolheu um. Some a identidade falsa sem CF, sem coleção de reserva, sem
rules e sem backfill.

Isso **não** afeta a busca: `keywords` é gerado de `fullName`, `nickname` e `email` — o handle
derivado nunca foi fonte de busca. Quem digita `@joao.silva` continua encontrando, porque `@`, `.`,
`_` e `-` são separadores de token (`_tokenSeparators`), então o termo quebra em `joao` + `silva` e
casa o nome.

**Apelido único de verdade fica fora**, e a spec registra o porquê: o mecanismo seria barato — o
repo já tem o padrão implementado duas vezes, em `linkPageSlugs/{slug}` e `arenaSiteSlugs/{slug}`,
com callable transacional em `link-pages.ts:140` — mas a migração é que é o projeto. Apelidos
existentes são texto livre e vão colidir ao normalizar; com backfill só em dev, prod ficaria com
unicidade apenas para gravações futuras. Unicidade parcial em identidade é pior que nenhuma, porque
passa a parecer garantia. Assunto próprio, para quando prod puder receber backfill.

## 5. UX do campo de busca

- Botão de limpar (X) quando há texto.
- A lista **para de ser substituída por spinner de tela cheia a cada tecla**. Hoje `isLoading` cai
  no `SliverFillRemaining` e a tela pisca; passa a indicador discreto, mantendo os resultados
  anteriores visíveis.
- Debounce de 350 ms permanece.
- Mínimo de 2 caracteres permanece — coerente com `kSearchMinPrefixLength = 2`.

## Testes

Somados a `nexago_app/test/features/athlete/athlete_discover_logic_test.dart`:

- nome composto (`"joão silva"`) casa — o caso que hoje falha;
- apelido colado (`anapaula` encontra `@ana_paula`);
- termo com e sem acento;
- UF como constraint e cidade filtrando no cliente sobre o resultado;
- predicados removidos saem de `hasActiveFilters`;
- `athletePublicHandle` devolve `null` sem apelido e `@apelido` com apelido;
- `discoverStatsLine` não emite string de quilometragem.

## Riscos

**Backfill de `keywords` só em dev.** Em prod, perfis antigos seguem dependendo do fallback legado
por nome/apelido de `searchAthletesByKeywords`. A busca melhora, mas o casamento por prefixo não
alcança quem nunca regravou o perfil. **A verificar no plano, medindo — não afirmar sem medir.**

**Nada garante que a base de dev tenha volume para exercitar a paginação por UF.** O plano deve
checar antes de concluir que o push-down funciona.

## Fora de escopo (decisão do dono)

- Seletor de ordenação e contador de resultados. Consequência: `AthleteDiscoverSort` e `setSort`
  continuam **construídos e desligados** — nenhuma UI os chama.
- Chips de filtro ativo removíveis. Hoje só existe um ponto no ícone de filtros.
- `athlete_discover_level_chips.dart` (301 linhas) segue **código morto**: nenhuma página o importa.
- Filtro/busca por nível.
- Apelido único.
- A distância falsa na tela de duplas.
