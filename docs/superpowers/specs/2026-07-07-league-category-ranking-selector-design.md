# Seletor de categoria no ranking da liga

## Contexto

O ranking de liga já é gravado por `leagueId + categoryId`
(`leagueTeamRankings`/`leagueAthleteRankings`, ver
`functions/src/league-ranking.ts` e
`docs/business-rules/ranking.md`), mas a tela que exibe esse ranking
(`LeagueDetailRankingSection`, em
`nexago_app/lib/features/tournaments/presentation/widgets/league_detail_ranking_section.dart`)
só deixa escolher **gênero** (chips Masculino/Feminino/Misto). Por baixo, o
gênero escolhido resolve pra uma categoria via `categoryForGender`
(`nexago_app/lib/features/tournaments/domain/league_detail_logic.dart:85`),
que devolve a **primeira** categoria da liga que bate com aquele gênero.

Se uma liga tiver mais de uma categoria do mesmo gênero (ex.: "Masculino Open"
e "Masculino Intermediário"), a segunda fica invisível nessa tela — não tem
como selecioná-la, e ela nunca aparece pro usuário. Categoria é a unidade real
de competição (o que decide contra quem cada atleta joga), então "ranking por
categoria" só está de fato completo quando dá pra escolher qualquer categoria
da liga, não só a primeira de cada gênero.

## Escopo

Só a visualização. Não inclui nenhuma mecânica nova de prêmio/reconhecimento
por categoria (badge, notificação, vaga garantida etc.) — isso foi
deliberadamente deixado de fora desta rodada; se quiser, é um projeto
separado, a construir depois que a visualização estiver correta.

Não muda nada em `leagueTeamRankings`/`leagueAthleteRankings` nem em nenhuma
Cloud Function — os dados já vêm certos por `categoryId`. É puramente um
seletor de exibição no app.

## Comportamento na tela

`LeagueDetailRankingSection` é usado em dois lugares — a aba "Visão geral" da
liga (`league_detail_overview_tab.dart`, com `previewLimit`) e a aba "Ranking"
da liga (`league_detail_ranking_tab.dart`, lista completa) — e ambos ganham o
seletor de graça, por ser o mesmo componente.

- Os 3 chips de gênero continuam exatamente como hoje, sem mudança visual.
- Quando o gênero selecionado tiver **mais de uma** categoria na liga, aparece
  um dropdown compacto logo abaixo dos chips (ex.: "Nível: Open ▾") listando
  as categorias daquele gênero pelo `category.name` completo (ex.: "Masculino
  Open", "Masculino Intermediário").
- Quando o gênero tiver só uma categoria (caso mais comum hoje), o dropdown
  não aparece — zero diferença pro usuário nesse caso.
- Trocar de gênero reresolve a lista de categorias daquele gênero e
  seleciona a primeira dela (mesma ordem em que a liga já lista as
  categorias — sem inventar critério de ordenação novo).
- A escolha de categoria não persiste entre sessões nem navegações — é filtro
  de tela, igual ao filtro de gênero atual (`_genderFilter`), resetado no
  `didUpdateWidget` quando a liga muda.

## Mudanças técnicas

- `categoryForGender` (`league_detail_logic.dart`) ganha uma irmã
  `categoriesForGender(categories, gender) -> List<DiscoveryLeagueCategory>`
  que devolve **todas** as categorias daquele gênero, não só a primeira.
  `categoryForGender` pode continuar existindo (outros lugares podem depender
  dela) ou ser reescrita em termos da nova função — decisão de implementação,
  não muda o comportamento público dela hoje (ainda devolve a primeira).
- `_LeagueDetailRankingSectionState` (`league_detail_ranking_section.dart`)
  ganha um segundo estado local, `_selectedCategoryId` (ou equivalente), ao
  lado do `_genderFilter` já existente. `_categoryId` (getter usado hoje) passa
  a resolver a partir dos dois: gênero selecionado + categoria selecionada
  dentro daquele gênero.
- Novo widget pequeno de dropdown (estilo consistente com os
  `_GenderChip`/`_ModeChip` já existentes no arquivo), só renderizado quando
  `categoriesForGender(...).length > 1`.
- Rótulo do dropdown usa `category.name` como vem gravado — sem tentar
  remover o prefixo de gênero do texto, pra não arriscar quebrar nomes de
  categoria que fujam do padrão "Gênero + Nível".

## Casos de borda

- Liga com 1 categoria por gênero (maioria hoje): tela idêntica à atual.
- Liga sem nenhuma categoria daquele gênero: chip de gênero já vem desabilitado
  hoje (`enabled: categoryForGender(...) != null`); equivalente com a lista
  vazia.
- Liga com 0 categorias: já tratado hoje (`if (categories.isEmpty ...) return
  const SizedBox.shrink();`) — sem mudança.

## Fora de escopo (explicitamente adiado)

- Qualquer prêmio, badge, notificação ou vaga de Grande Final calculada por
  categoria.
- Filtro por categoria na aba Ranking **geral** do app
  (`AthleteRankingPage`) — ali o ranking soma tudo cross-categoria de
  propósito (ver `docs/business-rules/ranking.md`); não faz parte deste
  projeto.
