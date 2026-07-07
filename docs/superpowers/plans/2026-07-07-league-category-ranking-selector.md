# Seletor de Categoria no Ranking da Liga — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar o ranking de uma liga (tela de detalhe) mostrar qualquer categoria de um mesmo gênero, não só a primeira — hoje `categoryForGender` sempre resolve pra primeira categoria daquele gênero, então uma liga com "Masculino Open" e "Masculino Intermediário" simultâneos nunca deixa ver a segunda.

**Architecture:** Duas funções puras novas em `league_detail_logic.dart` (`categoriesForGender`, que lista todas as categorias de um gênero, e `resolveSelectedCategoryId`, que decide qual categoria fica selecionada dado o estado atual) carregam toda a lógica de decisão e são 100% testáveis sem widget. `LeagueDetailRankingSection` ganha um estado local (`_selectedCategoryId`) e um dropdown compacto, renderizado só quando o gênero atual tem mais de 1 categoria; o resto da tela (chips de gênero, toggle duplas/atletas, tabela) não muda.

**Tech Stack:** Flutter/Dart, Riverpod (nenhum provider novo — os providers de ranking por categoria já existem e já aceitam qualquer `categoryId`), `flutter_test` para os testes de lógica.

## Global Constraints

- Não mexe em Firestore, regras ou Cloud Functions — é seletor de exibição no app, os dados (`leagueTeamRankings`/`leagueAthleteRankings`) já vêm certos por `categoryId`.
- Nenhuma dependência nova no `pubspec.yaml`.
- Textos em português, seguindo o estilo já usado no arquivo (rótulos em CAIXA ALTA mono pros headers, chips em pill pros filtros).
- Rótulo de cada opção do seletor = `category.name` exatamente como vem gravado (sem tentar remover prefixo de gênero do texto).
- O seletor de categoria só aparece quando o gênero selecionado tiver mais de 1 categoria na liga; caso contrário a tela fica idêntica à de hoje.
- Escolha de categoria é estado local de tela (não persiste entre sessões/navegações), reseta pra primeira opção sempre que o gênero muda — mesma filosofia do `_genderFilter` já existente.
- Fora de escopo (não implementar aqui): qualquer prêmio/badge/notificação por categoria, e filtro de categoria na aba Ranking geral do app. Ver `docs/superpowers/specs/2026-07-07-league-category-ranking-selector-design.md`.

---

## Task 1: `categoriesForGender` — todas as categorias de um gênero

**Files:**
- Modify: `nexago_app/lib/features/tournaments/domain/league_detail_logic.dart`
- Test: `nexago_app/test/features/tournaments/league_detail_logic_test.dart`

**Interfaces:**
- Consumes: `DiscoveryLeagueCategory` (`league_ranking_models.dart`, campos `id`, `name`, `genderType`), `TournamentGenderCat` (`tournament_discovery_models.dart`), `genderTagFromText` (`tournament_detail_logic.dart`) — todos já importados no arquivo.
- Produces: `List<DiscoveryLeagueCategory> categoriesForGender(List<DiscoveryLeagueCategory> categories, TournamentGenderCat gender)`. Usada pela Task 2 e pela Task 3.

- [ ] **Step 1: Escrever os testes (vão falhar — a função ainda não existe)**

Abra `nexago_app/test/features/tournaments/league_detail_logic_test.dart` e adicione estes testes logo antes do `}` que fecha `void main()` (depois do teste `categoryForGender resolves genderType` já existente):

```dart
  test(
    'categoriesForGender returns every exact genderType match, in order',
    () {
      const categories = [
        DiscoveryLeagueCategory(
          id: 'm1',
          name: 'Masculino Open',
          genderType: 'male',
        ),
        DiscoveryLeagueCategory(
          id: 'f1',
          name: 'Feminino Open',
          genderType: 'female',
        ),
        DiscoveryLeagueCategory(
          id: 'm2',
          name: 'Masculino Intermediário',
          genderType: 'male',
        ),
      ];
      final result = categoriesForGender(categories, TournamentGenderCat.m);
      expect(result.map((c) => c.id).toList(), ['m1', 'm2']);
    },
  );

  test(
    'categoriesForGender falls back to name matching when genderType is '
    'missing',
    () {
      const categories = [
        DiscoveryLeagueCategory(id: 'p1', name: 'Masculino Open'),
        DiscoveryLeagueCategory(id: 'p2', name: 'Masculino Intermediário'),
        DiscoveryLeagueCategory(id: 'p3', name: 'Feminino Open'),
      ];
      final result = categoriesForGender(categories, TournamentGenderCat.m);
      expect(result.map((c) => c.id).toList(), ['p1', 'p2']);
    },
  );

  test(
    'categoriesForGender falls back to the first category when nothing '
    'matches the gender',
    () {
      const categories = [
        DiscoveryLeagueCategory(
          id: 'only',
          name: 'Feminino Open',
          genderType: 'female',
        ),
      ];
      final result = categoriesForGender(categories, TournamentGenderCat.m);
      expect(result.map((c) => c.id).toList(), ['only']);
    },
  );

  test('categoriesForGender returns empty for an empty category list', () {
    expect(categoriesForGender(const [], TournamentGenderCat.m), isEmpty);
  });

  test(
    'categoriesForGender.first always matches categoryForGender',
    () {
      const categories = [
        DiscoveryLeagueCategory(
          id: 'm1',
          name: 'Masculino Open',
          genderType: 'male',
        ),
        DiscoveryLeagueCategory(
          id: 'm2',
          name: 'Masculino Intermediário',
          genderType: 'male',
        ),
        DiscoveryLeagueCategory(
          id: 'f1',
          name: 'Feminino Open',
          genderType: 'female',
        ),
      ];
      for (final gender in TournamentGenderCat.values) {
        expect(
          categoriesForGender(categories, gender).first.id,
          categoryForGender(categories, gender)?.id,
        );
      }
    },
  );
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd nexago_app && flutter test test/features/tournaments/league_detail_logic_test.dart`
Expected: FAIL — erro de análise `The function 'categoriesForGender' isn't defined`.

- [ ] **Step 3: Implementar a função**

Em `nexago_app/lib/features/tournaments/domain/league_detail_logic.dart`, adicione logo depois de `categoryForGender` (depois da linha 107, antes de `initialLeagueGenderFilter`):

```dart
/// Todas as categorias da liga que pertencem ao gênero informado — ao
/// contrário de [categoryForGender], que só devolve a primeira. Mesma ordem
/// de resolução (genderType exato, depois heurística por texto, depois a
/// primeira categoria da liga como último recurso) pra nunca divergir da
/// categoria que [categoryForGender] já resolve hoje.
List<DiscoveryLeagueCategory> categoriesForGender(
  List<DiscoveryLeagueCategory> categories,
  TournamentGenderCat gender,
) {
  final target = switch (gender) {
    TournamentGenderCat.m => 'male',
    TournamentGenderCat.f => 'female',
    TournamentGenderCat.mix => 'mixed',
  };
  final exact = categories.where((c) => c.genderType == target).toList();
  if (exact.isNotEmpty) return exact;

  final byTag = categories.where((category) {
    final tag = genderTagFromText(category.genderType ?? category.name);
    return switch (gender) {
      TournamentGenderCat.m => tag == 'MASCULINO',
      TournamentGenderCat.f => tag == 'FEMININO',
      TournamentGenderCat.mix => tag == 'MISTO',
    };
  }).toList();
  if (byTag.isNotEmpty) return byTag;

  return categories.isNotEmpty ? [categories.first] : const [];
}
```

- [ ] **Step 4: Rodar os testes de novo e confirmar que passam**

Run: `cd nexago_app && flutter test test/features/tournaments/league_detail_logic_test.dart`
Expected: PASS (todos os testes, incluindo os 5 novos).

- [ ] **Step 5: Commit**

```bash
cd nexago_app
git add lib/features/tournaments/domain/league_detail_logic.dart test/features/tournaments/league_detail_logic_test.dart
git commit -m "feat(league-ranking): add categoriesForGender to list every category per gender"
```

---

## Task 2: `resolveSelectedCategoryId` — decide qual categoria fica selecionada

**Files:**
- Modify: `nexago_app/lib/features/tournaments/domain/league_detail_logic.dart`
- Test: `nexago_app/test/features/tournaments/league_detail_logic_test.dart`

**Interfaces:**
- Consumes: `categoriesForGender` (Task 1), `DiscoveryLeagueCategory`, `TournamentGenderCat`.
- Produces: `String? resolveSelectedCategoryId(List<DiscoveryLeagueCategory> categories, TournamentGenderCat? gender, String? selectedCategoryId)`. Usada pela Task 3 (substitui a lógica hoje embutida no getter `_categoryId` do widget).

- [ ] **Step 1: Escrever os testes (vão falhar — a função ainda não existe)**

Adicione em `nexago_app/test/features/tournaments/league_detail_logic_test.dart`, depois dos testes da Task 1:

```dart
  test(
    'resolveSelectedCategoryId keeps the selection when it still belongs '
    'to the gender',
    () {
      const categories = [
        DiscoveryLeagueCategory(
          id: 'm1',
          name: 'Masculino Open',
          genderType: 'male',
        ),
        DiscoveryLeagueCategory(
          id: 'm2',
          name: 'Masculino Intermediário',
          genderType: 'male',
        ),
      ];
      expect(
        resolveSelectedCategoryId(categories, TournamentGenderCat.m, 'm2'),
        'm2',
      );
    },
  );

  test(
    'resolveSelectedCategoryId resets to the first option when the '
    'selection belonged to a different gender',
    () {
      const categories = [
        DiscoveryLeagueCategory(
          id: 'm1',
          name: 'Masculino Open',
          genderType: 'male',
        ),
        DiscoveryLeagueCategory(
          id: 'f1',
          name: 'Feminino Open',
          genderType: 'female',
        ),
      ];
      // 'f1' estava selecionado no chip Feminino; usuário trocou pro
      // Masculino — a seleção antiga não é válida ali.
      expect(
        resolveSelectedCategoryId(categories, TournamentGenderCat.m, 'f1'),
        'm1',
      );
    },
  );

  test(
    'resolveSelectedCategoryId defaults to the first option when nothing '
    'is selected yet',
    () {
      const categories = [
        DiscoveryLeagueCategory(
          id: 'm1',
          name: 'Masculino Open',
          genderType: 'male',
        ),
        DiscoveryLeagueCategory(
          id: 'm2',
          name: 'Masculino Intermediário',
          genderType: 'male',
        ),
      ];
      expect(
        resolveSelectedCategoryId(categories, TournamentGenderCat.m, null),
        'm1',
      );
    },
  );

  test(
    'resolveSelectedCategoryId falls back to the first category when '
    'gender is null, and to null when there are no categories',
    () {
      const categories = [
        DiscoveryLeagueCategory(
          id: 'm1',
          name: 'Masculino Open',
          genderType: 'male',
        ),
      ];
      expect(resolveSelectedCategoryId(categories, null, null), 'm1');
      expect(resolveSelectedCategoryId(const [], null, null), null);
    },
  );
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd nexago_app && flutter test test/features/tournaments/league_detail_logic_test.dart`
Expected: FAIL — erro de análise `The function 'resolveSelectedCategoryId' isn't defined`.

- [ ] **Step 3: Implementar a função**

Em `nexago_app/lib/features/tournaments/domain/league_detail_logic.dart`, adicione logo depois de `categoriesForGender`:

```dart
/// Categoria efetivamente exibida no ranking: mantém [selectedCategoryId] se
/// ele ainda pertencer às opções do gênero atual; caso contrário (gênero
/// acabou de trocar, ou a categoria escolhida não existe mais nessa lista)
/// cai pra primeira opção.
String? resolveSelectedCategoryId(
  List<DiscoveryLeagueCategory> categories,
  TournamentGenderCat? gender,
  String? selectedCategoryId,
) {
  if (gender == null) {
    return categories.isEmpty ? null : categories.first.id;
  }
  final options = categoriesForGender(categories, gender);
  if (options.isEmpty) {
    return categories.isEmpty ? null : categories.first.id;
  }
  if (selectedCategoryId != null &&
      options.any((c) => c.id == selectedCategoryId)) {
    return selectedCategoryId;
  }
  return options.first.id;
}
```

- [ ] **Step 4: Rodar os testes de novo e confirmar que passam**

Run: `cd nexago_app && flutter test test/features/tournaments/league_detail_logic_test.dart`
Expected: PASS (todos os testes, incluindo os 4 novos desta task).

- [ ] **Step 5: Commit**

```bash
cd nexago_app
git add lib/features/tournaments/domain/league_detail_logic.dart test/features/tournaments/league_detail_logic_test.dart
git commit -m "feat(league-ranking): add resolveSelectedCategoryId for the category selector"
```

---

## Task 3: Dropdown de categoria em `LeagueDetailRankingSection`

**Files:**
- Modify: `nexago_app/lib/features/tournaments/presentation/widgets/league_detail_ranking_section.dart`

**Interfaces:**
- Consumes: `categoriesForGender`, `resolveSelectedCategoryId` (Task 1 e 2), `DiscoveryLeagueCategory`.
- Produces: nenhuma interface nova consumida por outro arquivo — `LeagueDetailRankingSection` continua com a mesma API pública (`league`, `tournamentsById`, `previewLimit`, `onViewFullRanking`), usada sem mudança por `league_detail_overview_tab.dart` e `league_detail_ranking_tab.dart`.

**Nota sobre testes:** este widget depende de vários providers Riverpod ligados ao Firestore (`leagueCategoryRankingRowsProvider`, `leagueViewerTeamIdsProvider`, `authServiceProvider`, `tournamentMatchEnrichmentServiceProvider`) e hoje não tem nenhum teste de widget (`grep -c testWidgets` no arquivo = 0) — só a lógica pura em `league_detail_logic.dart` é testada. Este projeto mantém esse padrão: a decisão (Tasks 1 e 2) já está 100% coberta por teste unitário; aqui a verificação é `flutter analyze` (estático) + os passos manuais do Step 6 (funcional). Criar harness de fakes pra esses 4 providers só pra este componente seria desproporcional ao escopo (puramente um seletor de exibição) — se o app ganhar testes de widget nessa pasta no futuro, backfill é um projeto separado.

- [ ] **Step 1: Adicionar o estado `_selectedCategoryId` e resetá-lo no `didUpdateWidget`**

Em `nexago_app/lib/features/tournaments/presentation/widgets/league_detail_ranking_section.dart`, troque:

```dart
class _LeagueDetailRankingSectionState
    extends ConsumerState<LeagueDetailRankingSection> {
  LeagueRankingViewMode _viewMode = LeagueRankingViewMode.teams;
  TournamentGenderCat? _genderFilter;

  @override
  void initState() {
    super.initState();
    _genderFilter = initialLeagueGenderFilter(widget.league.categories);
  }

  @override
  void didUpdateWidget(covariant LeagueDetailRankingSection oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.league.id != widget.league.id) {
      _genderFilter = initialLeagueGenderFilter(widget.league.categories);
    }
  }

  String? get _categoryId {
    final gender = _genderFilter;
    if (gender == null) return widget.league.categories.firstOrNull?.id;
    return categoryForGender(widget.league.categories, gender)?.id;
  }
```

por:

```dart
class _LeagueDetailRankingSectionState
    extends ConsumerState<LeagueDetailRankingSection> {
  LeagueRankingViewMode _viewMode = LeagueRankingViewMode.teams;
  TournamentGenderCat? _genderFilter;
  String? _selectedCategoryId;

  @override
  void initState() {
    super.initState();
    _genderFilter = initialLeagueGenderFilter(widget.league.categories);
  }

  @override
  void didUpdateWidget(covariant LeagueDetailRankingSection oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.league.id != widget.league.id) {
      _genderFilter = initialLeagueGenderFilter(widget.league.categories);
      _selectedCategoryId = null;
    }
  }

  void _onGenderSelected(TournamentGenderCat gender) {
    setState(() {
      _genderFilter = gender;
      _selectedCategoryId = null;
    });
  }

  void _onCategorySelected(String categoryId) {
    setState(() => _selectedCategoryId = categoryId);
  }

  String? get _categoryId => resolveSelectedCategoryId(
        widget.league.categories,
        _genderFilter,
        _selectedCategoryId,
      );
```

- [ ] **Step 2: Trocar o `onTap` do chip de gênero pra usar `_onGenderSelected`**

Ainda no mesmo arquivo, dentro do `build`, troque:

```dart
                  selected: _genderFilter == gender,
                  enabled: categoryForGender(categories, gender) != null,
                  onTap: () => setState(() => _genderFilter = gender),
                ),
```

por:

```dart
                  selected: _genderFilter == gender,
                  enabled: categoryForGender(categories, gender) != null,
                  onTap: () => _onGenderSelected(gender),
                ),
```

- [ ] **Step 3: Calcular as opções de categoria e inserir o dropdown depois dos chips de gênero**

No mesmo `build`, troque as duas primeiras linhas:

```dart
  Widget build(BuildContext context) {
    final categories = widget.league.categories;
    final categoryId = _categoryId;
```

por:

```dart
  Widget build(BuildContext context) {
    final categories = widget.league.categories;
    final categoryId = _categoryId;
    final gender = _genderFilter;
    final categoryOptions = gender == null
        ? const <DiscoveryLeagueCategory>[]
        : categoriesForGender(categories, gender);
```

Depois, logo depois do bloco `SingleChildScrollView(...)` que renderiza os chips de gênero e antes de `const SizedBox(height: 14),` que vem em seguida (linha 170 hoje), insira:

```dart
        if (categoryOptions.length > 1)
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: Align(
              alignment: Alignment.centerLeft,
              child: _CategoryDropdown(
                categories: categoryOptions,
                selectedCategoryId: categoryId,
                onSelected: _onCategorySelected,
              ),
            ),
          ),
```

- [ ] **Step 4: Adicionar o widget `_CategoryDropdown`**

No mesmo arquivo, logo depois do fechamento da classe `_GenderChip` (hoje termina na linha 405, antes de `class _TeamRankingTableRow extends StatelessWidget {`), adicione:

```dart
class _CategoryDropdown extends StatelessWidget {
  const _CategoryDropdown({
    required this.categories,
    required this.selectedCategoryId,
    required this.onSelected,
  });

  final List<DiscoveryLeagueCategory> categories;
  final String? selectedCategoryId;
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) {
    final selected = categories.firstWhere(
      (c) => c.id == selectedCategoryId,
      orElse: () => categories.first,
    );
    return PopupMenuButton<String>(
      initialValue: selected.id,
      onSelected: onSelected,
      color: context.themeColors.surfaceRaised,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      itemBuilder: (context) => [
        for (final category in categories)
          PopupMenuItem<String>(
            value: category.id,
            child: Text(category.name),
          ),
      ],
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
            color: context.themeColors.outline.withValues(alpha: 0.45),
          ),
          color: context.themeColors.surfaceRaised,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              selected.name,
              style: TextStyle(
                fontWeight: FontWeight.w700,
                fontSize: 13,
                color: context.themeColors.onSurface,
              ),
            ),
            const SizedBox(width: 4),
            Icon(
              Icons.arrow_drop_down_rounded,
              size: 18,
              color: context.themeColors.onSurfaceMuted,
            ),
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 5: Rodar o analyzer e a suíte de testes completa**

Run: `cd nexago_app && flutter analyze lib/features/tournaments/presentation/widgets/league_detail_ranking_section.dart lib/features/tournaments/domain/league_detail_logic.dart`
Expected: `No issues found!`

Run: `cd nexago_app && flutter test`
Expected: PASS em toda a suíte (nada mais referencia a assinatura antiga de `_categoryId` fora deste arquivo).

- [ ] **Step 6: Verificação manual (checklist funcional)**

Use a skill `run` pra subir o app (ou `flutter run` direto). Navegue até uma liga com pelo menos 2 categorias do mesmo gênero (crie uma de teste no fluxo de criação de liga do organizador se não existir nenhuma, adicionando 2 categorias com o mesmo `genderType`, ex. "Masculino Open" e "Masculino Intermediário"). Na tela de detalhe da liga (aba Visão Geral e aba Ranking):

1. Confirme que o dropdown aparece só quando o chip de gênero selecionado tem >1 categoria (ex.: aparece em "Masculino", não aparece em "Feminino" se essa só tiver 1).
2. Selecione a segunda categoria no dropdown e confirme que a tabela de ranking troca pra os dados daquela categoria (times/pontos diferentes).
3. Troque o chip de gênero e confirme que o dropdown reresolve pra primeira categoria do novo gênero (sem carregar a seleção antiga).
4. Alterne entre "Duplas" e "Atletas" com uma categoria não-padrão selecionada e confirme que a categoria escolhida se mantém.
5. Abra uma liga com só 1 categoria por gênero (caso comum hoje) e confirme que a tela fica idêntica à de antes da mudança — nenhum dropdown aparece em nenhum chip.

- [ ] **Step 7: Commit**

```bash
cd nexago_app
git add lib/features/tournaments/presentation/widgets/league_detail_ranking_section.dart
git commit -m "feat(league-ranking): add category selector for leagues with multiple categories per gender"
```
