# Busca e filtros da listagem de atletas (Descobrir) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer a busca da tela Descobrir encontrar nome composto, converter cidade/UF em filtro real, e parar de exibir filtros e distâncias que não existem.

**Architecture:** A busca quebrada do Descobrir é substituída por reuso do ranqueador multi-token
já corrigido (`rankAthleteSearchResults`), que lê a mesma coleção `public_profiles`. Como
`fake_cloud_firestore` NÃO está nas dependências, todo o miolo testável é extraído para funções
puras que recebem `(id, Map<String, dynamic>)` em vez de snapshots; o repositório fica só com I/O.

**Tech Stack:** Flutter/Dart, Riverpod, cloud_firestore, flutter_test.

**Spec:** `docs/superpowers/specs/2026-09-10-busca-filtros-atletas-design.md`

## Global Constraints

- **Português na UI, inglês no código.** Toda string de tela em português.
- **Preservar retrocompatibilidade** (CLAUDE.md). Nenhum campo do Firestore some.
- **NÃO alterar** `nexago_app/lib/core/search/search_keywords.dart` nem
  `nexago_app/lib/core/profiles/athlete_search_results.dart`. São paridade de 3 cópias com
  TypeScript; mudar ali rebaixa a busca das outras superfícies.
- **NÃO criar índice** em `firestore.indexes.json`. O design usa só índices existentes.
- **NÃO apagar `isAthleteOnline` nem `countOnlineAthletes`** de `athlete_discover_logic.dart`:
  a feature de duplas os importa (`team_discover_logic.dart:13`, `compete_hub_logic.dart:231`).
- **NÃO apagar o campo `AthleteProfile.gameObjective`**: usado por
  `profile_completion_models.dart:158` e `athlete_profile_repository.dart:132`.
- **NÃO tocar** em `features/tournaments/` (tela de duplas). Fora de escopo.
- Comando de teste: `cd nexago_app && flutter test <caminho>`.
- Comando de análise: `cd nexago_app && flutter analyze`.

---

### Task 1: `AthleteProfile.fromMap` — destravar teste sem Firestore

`AthleteProfile.fromFirestore` usa do snapshot apenas `doc.data()` (linha 134) e `doc.id`
(linha 251). Extrair um `fromMap` torna todo o resto do plano testável com mapas simples.

**Files:**
- Modify: `nexago_app/lib/features/athlete/domain/athlete_profile.dart:131-134,251`
- Test: `nexago_app/test/features/athlete/athlete_profile_from_map_test.dart`

**Interfaces:**
- Consumes: nada.
- Produces: `factory AthleteProfile.fromMap(String id, Map<String, dynamic> data)`.
  `AthleteProfile.fromFirestore(DocumentSnapshot<Map<String, dynamic>> doc)` continua existindo
  com a mesma assinatura, delegando.

- [ ] **Step 1: Write the failing test**

Criar `nexago_app/test/features/athlete/athlete_profile_from_map_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';

void main() {
  test('fromMap lê id e campos sem depender de snapshot', () {
    final profile = AthleteProfile.fromMap('uid-1', {
      'fullName': 'João Silva',
      'nickname': 'jo',
      'city': 'Goiânia',
      'state': 'GO',
    });

    expect(profile.id, 'uid-1');
    expect(profile.name, 'João Silva');
    expect(profile.nickname, 'jo');
    expect(profile.city, 'Goiânia');
    expect(profile.state, 'GO');
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd nexago_app && flutter test test/features/athlete/athlete_profile_from_map_test.dart`
Expected: FAIL na compilação — `The method 'fromMap' isn't defined for the type 'AthleteProfile'`.

- [ ] **Step 3: Write minimal implementation**

Em `athlete_profile.dart`, trocar o cabeçalho de `fromFirestore` por um delegador e mover o corpo
para `fromMap`. O corpo NÃO muda em mais nada — só as duas referências ao snapshot:

```dart
  factory AthleteProfile.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    return AthleteProfile.fromMap(doc.id, doc.data() ?? {});
  }

  factory AthleteProfile.fromMap(String id, Map<String, dynamic> data) {
    // corpo original de fromFirestore, MOVIDO SEM OUTRAS ALTERAÇÕES
  }
```

Este passo é um **movimento mecânico**, e é onde erro silencioso entra. São exatamente três
edições no corpo de ~120 linhas, e nenhuma outra:

1. Apagar a linha 134, `final data = doc.data() ?? {};` — `data` agora é parâmetro.
2. Na linha 251, trocar `id: doc.id,` por `id: id,`.
3. Nada mais muda. Não reordenar, não "melhorar", não renomear variável nenhuma.

Conferir que foi só isso, antes de rodar os testes:

```bash
cd nexago_app && git diff --stat lib/features/athlete/domain/athlete_profile.dart
```

Espere ver poucas linhas alteradas além do cabeçalho dos dois factories. Se o diff estiver grande,
algo foi reescrito sem querer — desfaça e refaça só as três edições.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd nexago_app && flutter test test/features/athlete/ && flutter analyze`
Expected: PASS, sem novos avisos. Os testes existentes de perfil continuam verdes — `fromFirestore`
manteve assinatura.

- [ ] **Step 5: Commit**

```bash
git add nexago_app/lib/features/athlete/domain/athlete_profile.dart nexago_app/test/features/athlete/athlete_profile_from_map_test.dart
git commit -m "refactor(athlete): extrai AthleteProfile.fromMap de fromFirestore"
```

---

### Task 2: O núcleo puro da busca — a correção do bug

Aqui mora o defeito: hoje `searchProfiles` colapsa a frase num token só. Esta task cria a função
pura que ordena e filtra, e o teste que prova `"joão silva"` casando.

**Files:**
- Create: `nexago_app/lib/features/athlete/domain/athlete_discover_search.dart`
- Test: `nexago_app/test/features/athlete/athlete_discover_search_test.dart`

**Interfaces:**
- Consumes: `AthleteProfile.fromMap` (Task 1); `AthleteSearchDoc.fromMap`,
  `rankAthleteSearchResults` (existentes, não alterar); `isDiscoverableProfile` (existente).
- Produces:
  ```dart
  const int kDiscoverSearchResultLimit = 25;
  List<AthleteProfile> rankDiscoverSearchProfiles(
    Map<String, Map<String, dynamic>> docsById,
    List<String> tokens, {
    int max = kDiscoverSearchResultLimit,
  });
  ```

- [ ] **Step 1: Write the failing test**

Criar `nexago_app/test/features/athlete/athlete_discover_search_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/search/search_keywords.dart';
import 'package:nexago_app/features/athlete/domain/athlete_discover_search.dart';

Map<String, dynamic> _doc({
  required String fullName,
  String? nickname,
  bool athlete = true,
  bool publicProfile = true,
}) {
  return {
    'fullName': fullName,
    if (nickname != null) 'nickname': nickname,
    'hasAthleteRole': athlete,
    'keywords': generateKeywords([fullName, nickname ?? '']),
    'publicProfileEnabled': publicProfile,
  };
}

void main() {
  test('nome composto casa — o bug do token único', () {
    final docs = {
      'a': _doc(fullName: 'João Silva'),
      'b': _doc(fullName: 'João Pereira'),
    };

    final result = rankDiscoverSearchProfiles(
      docs,
      searchQueryTokens('joão silva'),
    );

    expect(result.map((p) => p.id), ['a']);
  });

  test('apelido colado encontra apelido com separador', () {
    final docs = {'a': _doc(fullName: 'Ana Paula', nickname: 'ana_paula')};

    final result = rankDiscoverSearchProfiles(
      docs,
      searchQueryTokens('anapaula'),
    );

    expect(result.map((p) => p.id), ['a']);
  });

  test('termo sem acento encontra nome acentuado', () {
    final docs = {'a': _doc(fullName: 'João Gonçalves')};

    final result = rankDiscoverSearchProfiles(
      docs,
      searchQueryTokens('joao goncalves'),
    );

    expect(result.map((p) => p.id), ['a']);
  });

  test('perfil não discoverable fica de fora', () {
    final docs = {
      'a': _doc(fullName: 'João Silva'),
      'b': _doc(fullName: 'João Silva', publicProfile: false),
    };

    final result = rankDiscoverSearchProfiles(
      docs,
      searchQueryTokens('joão silva'),
    );

    expect(result.map((p) => p.id), ['a']);
  });

  test('respeita o teto de resultados', () {
    final docs = {
      for (var i = 0; i < 30; i++) 'u$i': _doc(fullName: 'João Silva $i'),
    };

    final result = rankDiscoverSearchProfiles(
      docs,
      searchQueryTokens('joão'),
      max: 5,
    );

    expect(result.length, 5);
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd nexago_app && flutter test test/features/athlete/athlete_discover_search_test.dart`
Expected: FAIL — `Target of URI doesn't exist: 'athlete_discover_search.dart'`.

- [ ] **Step 3: Write minimal implementation**

Criar `nexago_app/lib/features/athlete/domain/athlete_discover_search.dart`:

```dart
import '../../../core/profiles/athlete_search_results.dart';
import 'athlete_discover_logic.dart';
import 'athlete_profile.dart';

/// Teto de resultados da busca do Descobrir.
const int kDiscoverSearchResultLimit = 25;

/// Ordena por relevância e devolve só os perfis discoverable.
///
/// Recebe os documentos CRUS já lidos (`id` -> `data`) para não custar
/// round-trip nenhum: o mesmo mapa alimenta o ranqueador compartilhado e o
/// mapper de `AthleteProfile`.
List<AthleteProfile> rankDiscoverSearchProfiles(
  Map<String, Map<String, dynamic>> docsById,
  List<String> tokens, {
  int max = kDiscoverSearchResultLimit,
}) {
  if (docsById.isEmpty || tokens.isEmpty) return const [];

  final searchDocs = docsById.entries
      .map((e) => AthleteSearchDoc.fromMap(e.key, e.value))
      .toList();

  final ranked = rankAthleteSearchResults(searchDocs, tokens, max: max);

  final profiles = <AthleteProfile>[];
  for (final user in ranked) {
    final data = docsById[user.uid];
    if (data == null) continue;
    final profile = AthleteProfile.fromMap(user.uid, data);
    if (isDiscoverableProfile(profile)) profiles.add(profile);
  }
  return profiles;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd nexago_app && flutter test test/features/athlete/athlete_discover_search_test.dart`
Expected: PASS nos 5 testes.

Se `nome composto casa` falhar devolvendo os dois perfis, leia
`profileMatchesSearchTokens` — ele exige que TODOS os tokens casem. Não "conserte" relaxando o
teste: o ponto da entrega é justamente esse `AND`.

- [ ] **Step 5: Commit**

```bash
git add nexago_app/lib/features/athlete/domain/athlete_discover_search.dart nexago_app/test/features/athlete/athlete_discover_search_test.dart
git commit -m "feat(discover): busca multi-token pura para a listagem de atletas"
```

---

### Task 3: Ligar o repositório ao núcleo puro

**Files:**
- Modify: `nexago_app/lib/features/athlete/data/athlete_discover_repository.dart:243-283`
  (método `searchProfiles` inteiro)

**Interfaces:**
- Consumes: `rankDiscoverSearchProfiles`, `kDiscoverSearchResultLimit` (Task 2).
- Produces: `Future<List<AthleteProfile>> searchProfiles(String term)` — mesma assinatura de hoje,
  então `AthleteDiscoverNotifier.search` não muda.

- [ ] **Step 1: Substituir o método**

Trocar `searchProfiles` por (o import de `search_keywords.dart` já existe no arquivo):

```dart
  Future<List<Map<String, dynamic>>> _keywordDocs(
    String anchor, {
    required bool onlyFlagged,
  }) async {
    Query<Map<String, dynamic>> query = _users;
    if (onlyFlagged) {
      query = query.where('hasAthleteRole', isEqualTo: true);
    }
    final snap = await query
        .where('keywords', arrayContains: anchor)
        .limit(_searchFetchLimit)
        .get();
    return snap.docs
        .map((d) => {'__id': d.id, ...d.data()})
        .toList();
  }

  /// Busca por nome/apelido. Delega o `AND` dos tokens e o ranqueamento ao
  /// núcleo compartilhado — o `array-contains` do Firestore aceita UM valor,
  /// então a consulta ancora no token mais longo e o resto sai no client, do
  /// próprio doc já lido.
  Future<List<AthleteProfile>> searchProfiles(String term) async {
    final tokens = searchQueryTokens(term);
    final anchor = searchAnchorToken(tokens);
    if (anchor.length < kSearchMinPrefixLength) return const [];

    try {
      var docs = await _keywordDocs(anchor, onlyFlagged: true);
      // Perfil antigo sem `hasAthleteRole` gravado some da busca — repete sem
      // a flag; o ranqueador confere o papel pelo `roles[]` do próprio doc.
      if (docs.isEmpty) {
        docs = await _keywordDocs(anchor, onlyFlagged: false);
      }

      final byId = <String, Map<String, dynamic>>{};
      for (final doc in docs) {
        final id = doc['__id'] as String;
        byId[id] = Map<String, dynamic>.from(doc)..remove('__id');
      }

      return rankDiscoverSearchProfiles(byId, tokens);
    } catch (e, stackTrace) {
      if (kDebugMode) {
        debugPrint('AthleteDiscoverRepository.searchProfiles failed: $e');
        debugPrint('$stackTrace');
      }
      return const [];
    }
  }
```

Adicionar a constante junto de `pageSize`:

```dart
  static const _searchFetchLimit = 100;
```

Adicionar o import:

```dart
import '../domain/athlete_discover_search.dart';
```

- [ ] **Step 2: Remover o fallback N+1 morto**

O fallback antigo fazia `_usersRepository.searchUsersByNicknameOrName` e depois um
`_users.doc(uid).get()` **por resultado**. Ele sai junto com o método antigo. Verificar se
`_usersRepository` ainda é usado no arquivo:

Run: `cd nexago_app && grep -n "_usersRepository" lib/features/athlete/data/athlete_discover_repository.dart`

Se não houver mais uso, remover o campo, o parâmetro do construtor e o
`usersRepository: ref.watch(usersRepositoryProvider)` do provider no fim do arquivo. Se ainda
houver, deixar como está.

- [ ] **Step 3: Verificar**

Run: `cd nexago_app && flutter analyze && flutter test test/features/athlete/`
Expected: sem erros, testes verdes.

- [ ] **Step 4: Commit**

```bash
git add nexago_app/lib/features/athlete/data/athlete_discover_repository.dart
git commit -m "fix(discover): busca de atleta volta a casar nome composto"
```

---

### Task 4: O `@` para de ser inventado

**Files:**
- Modify: `nexago_app/lib/features/athlete/domain/athlete_public_profile_models.dart:161-173`
- Test: `nexago_app/test/features/athlete/athlete_public_handle_test.dart`

**Interfaces:**
- Consumes: nada.
- Produces: `String? athletePublicHandle(AthleteProfile profile)` — mesma assinatura; passa a
  devolver `null` quando não há apelido.

- [ ] **Step 1: Write the failing test**

Criar `nexago_app/test/features/athlete/athlete_public_handle_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/athlete/domain/athlete_public_profile_models.dart';

void main() {
  test('sem apelido não inventa handle', () {
    final profile = AthleteProfile.fromMap('u1', {'fullName': 'João Silva'});
    expect(athletePublicHandle(profile), isNull);
  });

  test('com apelido devolve @apelido em minúsculas', () {
    final profile = AthleteProfile.fromMap('u1', {
      'fullName': 'Ana Paula',
      'nickname': 'AnaP',
    });
    expect(athletePublicHandle(profile), '@anap');
  });

  test('apelido já com @ não duplica o prefixo', () {
    final profile = AthleteProfile.fromMap('u1', {
      'fullName': 'Ana Paula',
      'nickname': '@anap',
    });
    expect(athletePublicHandle(profile), '@anap');
  });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd nexago_app && flutter test test/features/athlete/athlete_public_handle_test.dart`
Expected: FAIL no primeiro teste — devolve `'@joao.silva'` em vez de `null`.

- [ ] **Step 3: Write minimal implementation**

Substituir a função inteira:

```dart
/// Handle público do atleta. Só existe quando a pessoa ESCOLHEU um apelido —
/// derivar `@primeiro.ultimo` do nome fabricava identidade: o campo é livre e
/// não tem unicidade nenhuma, então dois "João Silva" exibiam o mesmo `@`.
String? athletePublicHandle(AthleteProfile profile) {
  final nick = profile.nickname?.trim();
  if (nick == null || nick.isEmpty) return null;
  final handle = nick.startsWith('@') ? nick : '@$nick';
  return handle.toLowerCase();
}
```

- [ ] **Step 4: Run tests and check consumers**

Run: `cd nexago_app && flutter test test/features/athlete/ && flutter analyze`

Conferir que quem exibe o handle já trata `null`:

Run: `cd nexago_app && grep -rn "handle" lib/features/athlete/presentation/widgets/discover/athlete_discover_card.dart`

Se algum widget fizer `handle!` ou concatenar sem checar, ajustar para omitir a linha quando
`null`. Não inventar texto substituto — a ausência do `@` é o comportamento desejado.

- [ ] **Step 5: Commit**

```bash
git add nexago_app/lib/features/athlete/domain/athlete_public_profile_models.dart nexago_app/test/features/athlete/athlete_public_handle_test.dart
git commit -m "fix(athlete): @ deixa de ser derivado do nome quando não há apelido"
```

---

### Task 5: Distância honesta no card

`proximityDistanceLabel` devolve hoje as strings hard-coded `'2.1 km'` e `'25 km'` a partir de
mera comparação de cidade/UF, e o card imprime isso. Ninguém mediu esses números.

**Files:**
- Modify: `nexago_app/lib/features/athlete/domain/athlete_discover_models.dart:170-181`
- Modify: `nexago_app/lib/features/athlete/domain/athlete_discover_logic.dart` — funções
  `discoverStatsLine` e `discoverContextTag`
- Test: `nexago_app/test/features/athlete/athlete_discover_logic_test.dart` (acrescentar grupo)

**Interfaces:**
- Consumes: nada.
- Produces: `String? AthleteDiscoverEntry.proximityLabel(AthleteProfile? viewer)` — substitui
  `proximityDistanceLabel`, devolvendo `'Mesma cidade'`, `'Mesmo estado'` ou `null`.

- [ ] **Step 1: Write the failing test**

Acrescentar ao fim de `athlete_discover_logic_test.dart`, dentro de `main()`:

```dart
  group('proximidade honesta', () {
    test('mesma cidade vira rótulo, não quilometragem', () {
      final viewer = _profile(id: 'v', city: 'Goiânia', state: 'GO');
      final entry = _entry(
        profile: _profile(id: 'a', city: 'Goiânia', state: 'GO'),
      );
      expect(entry.proximityLabel(viewer), 'Mesma cidade');
    });

    test('mesmo estado, cidade diferente', () {
      final viewer = _profile(id: 'v', city: 'Goiânia', state: 'GO');
      final entry = _entry(
        profile: _profile(id: 'a', city: 'Anápolis', state: 'GO'),
      );
      expect(entry.proximityLabel(viewer), 'Mesmo estado');
    });

    test('estado diferente não gera rótulo', () {
      final viewer = _profile(id: 'v', city: 'Goiânia', state: 'GO');
      final entry = _entry(
        profile: _profile(id: 'a', city: 'Santos', state: 'SP'),
      );
      expect(entry.proximityLabel(viewer), isNull);
    });

    test('linha de stats não contém quilometragem', () {
      final viewer = _profile(id: 'v', city: 'Goiânia', state: 'GO');
      final entry = _entry(
        profile: _profile(id: 'a', city: 'Goiânia', state: 'GO'),
      );
      expect(
        discoverStatsLine(entry: entry, viewer: viewer),
        isNot(contains('km')),
      );
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd nexago_app && flutter test test/features/athlete/athlete_discover_logic_test.dart`
Expected: FAIL — `proximityLabel` não existe.

- [ ] **Step 3: Write minimal implementation**

Em `athlete_discover_models.dart`, substituir `proximityDistanceLabel` por:

```dart
  /// Proximidade por cidade/UF. NÃO é distância: o app não tem geolocalização
  /// de atleta, e o `'2.1 km'` que ficava aqui era literal inventado.
  String? proximityLabel(AthleteProfile? viewer) {
    if (viewer == null) return null;
    final viewerCity = viewer.city.trim().toLowerCase();
    final city = profile.city.trim().toLowerCase();
    if (viewerCity.isNotEmpty && city == viewerCity) return 'Mesma cidade';
    final viewerState = viewer.state?.trim().toLowerCase() ?? '';
    final state = profile.state?.trim().toLowerCase() ?? '';
    if (viewerState.isNotEmpty && state.isNotEmpty && viewerState == state) {
      return 'Mesmo estado';
    }
    return null;
  }
```

Em `athlete_discover_logic.dart`, dentro de `discoverStatsLine`, trocar o bloco da distância:

```dart
  final proximity = entry.proximityLabel(viewer);
  if (proximity != null) parts.add(proximity);
```

(some o `.replaceAll('.0', '')` / `.replaceAll('.1', '')`, que só existia para maquiar o literal).

E `discoverContextTag` passa a derivar do rótulo, não do prefixo da string:

```dart
String? discoverContextTag({
  required AthleteDiscoverEntry entry,
  AthleteProfile? viewer,
}) {
  if (entry.proximityLabel(viewer) == 'Mesma cidade') return 'Perto de você';
  final mutual = entry.mutualFollowersCount;
  if (mutual != null && mutual > 0) {
    return '$mutual amigo${mutual == 1 ? '' : 's'} em comum';
  }
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd nexago_app && flutter test test/features/athlete/ && flutter analyze`
Expected: PASS. `flutter analyze` acusa se algum widget ainda chamava `proximityDistanceLabel`.

**Atenção:** existe função de MESMO NOME em
`lib/features/tournaments/domain/team_discover_models.dart:189`. É a tela de duplas, **fora de
escopo** — não tocar.

- [ ] **Step 5: Commit**

```bash
git add nexago_app/lib/features/athlete/domain/athlete_discover_models.dart nexago_app/lib/features/athlete/domain/athlete_discover_logic.dart nexago_app/test/features/athlete/athlete_discover_logic_test.dart
git commit -m "fix(discover): substitui distância inventada por rótulo de proximidade"
```

---

### Task 6: Remover os filtros de fachada

Saem distância, "disponíveis agora" e "objetivo do jogo" — do modelo e da lógica.
**Releia as Global Constraints antes:** `isAthleteOnline`, `countOnlineAthletes` e
`AthleteProfile.gameObjective` FICAM.

**Files:**
- Modify: `nexago_app/lib/features/athlete/domain/athlete_discover_models.dart` — classe
  `AthleteDiscoverFilters`
- Modify: `nexago_app/lib/features/athlete/domain/athlete_discover_logic.dart` —
  `applyDiscoverFilters`, e remover `_matchesProximity`, `_matchesGameObjective`,
  `gameObjectiveFromFirestore`
- Test: `nexago_app/test/features/athlete/athlete_discover_logic_test.dart`

**Interfaces:**
- Consumes: nada.
- Produces: `AthleteDiscoverFilters` sem os campos `maxDistanceKm`, `unlimitedDistance`,
  `availableNowOnly`, `gameObjective`. Campos restantes: `sportFirestoreId`, `levels`, `gender`,
  `lookingForPartnerOnly`, `completeProfileOnly`, `quickLevel` (mais os da Task 7).

- [ ] **Step 1: Write the failing test**

Acrescentar em `athlete_discover_logic_test.dart`:

```dart
  group('filtros de fachada removidos', () {
    test('filtros padrão não contam como ativos', () {
      expect(AthleteDiscoverFilters.defaults.hasActiveFilters, isFalse);
    });

    test('só gênero já conta como ativo', () {
      const filters = AthleteDiscoverFilters(
        gender: AthleteDiscoverGenderFilter.female,
      );
      expect(filters.hasActiveFilters, isTrue);
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd nexago_app && flutter test test/features/athlete/athlete_discover_logic_test.dart`
Expected: os testes acima até passam hoje; a falha real vem no Step 4, quando o compilador acusar
referências aos campos removidos. Rodar mesmo assim para ter a linha de base verde.

- [ ] **Step 3: Write minimal implementation**

Em `AthleteDiscoverFilters`: remover os 4 campos do construtor, das declarações, de `copyWith` e de
`hasActiveFilters`. O `hasActiveFilters` fica:

```dart
  bool get hasActiveFilters =>
      sportFirestoreId != null ||
      levels.isNotEmpty ||
      gender != AthleteDiscoverGenderFilter.all ||
      lookingForPartnerOnly ||
      completeProfileOnly ||
      quickLevel.label.isNotEmpty;
```

Em `athlete_discover_logic.dart`, remover de `applyDiscoverFilters` as três linhas:

```dart
    if (!_matchesProximity(profile, viewerProfile, filters)) return false;
    if (!_matchesGameObjective(profile, filters)) return false;
    if (filters.availableNowOnly && !isAthleteOnline(profile, reference)) {
      return false;
    }
```

E apagar as funções `_matchesProximity`, `_matchesGameObjective` e `gameObjectiveFromFirestore`.
Remover também o `enum AthleteDiscoverGameObjective` de `athlete_discover_models.dart`.

Se `reference` ficar sem uso em `applyDiscoverFilters`, remover a variável e o parâmetro `now`
**só se nenhum teste existente o passar** — conferir com
`grep -n "applyDiscoverFilters" test/features/athlete/athlete_discover_logic_test.dart`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd nexago_app && flutter analyze && flutter test test/features/athlete/`
Expected: `flutter analyze` aponta cada referência sobrando — o sheet da Task 8 ainda usa os campos
removidos. **Esperado nesta task**; corrigir só o que estiver em `domain/`. Se o sheet quebrar a
compilação do teste, seguir direto para a Task 8 antes de commitar as duas juntas.

- [ ] **Step 5: Commit**

```bash
git add nexago_app/lib/features/athlete/domain/
git commit -m "refactor(discover): remove filtros de distância, online e objetivo de jogo"
```

---

### Task 7: Cidade e UF como filtro

**Files:**
- Modify: `nexago_app/lib/features/athlete/domain/athlete_discover_models.dart` —
  `AthleteDiscoverFilters`
- Modify: `nexago_app/lib/features/athlete/domain/athlete_discover_logic.dart` —
  `applyDiscoverFilters`, `DiscoverFirestoreConstraints`, `discoverFirestoreConstraints`
- Modify: `nexago_app/lib/features/athlete/data/athlete_discover_repository.dart` —
  `_buildDiscoverQuery`
- Test: `nexago_app/test/features/athlete/athlete_discover_logic_test.dart`

**Interfaces:**
- Consumes: `AthleteDiscoverFilters` (Task 6).
- Produces: campos `String? stateUf` e `String? city` em `AthleteDiscoverFilters`;
  `DiscoverFirestoreConstraints` ganha `String? stateUf`;
  `List<String> discoverCityOptions(List<AthleteDiscoverEntry> entries, String? stateUf)`.

- [ ] **Step 1: Write the failing test**

Acrescentar em `athlete_discover_logic_test.dart`:

```dart
  group('filtro de localização', () {
    test('UF filtra por estado', () {
      final entries = [
        _entry(profile: _profile(id: '1', city: 'Goiânia', state: 'GO')),
        _entry(profile: _profile(id: '2', city: 'Santos', state: 'SP')),
      ];
      final result = applyDiscoverFilters(
        entries: entries,
        filters: const AthleteDiscoverFilters(stateUf: 'GO'),
      );
      expect(result.map((e) => e.userId), ['1']);
    });

    test('cidade compara sem acento e sem caixa', () {
      final entries = [
        _entry(profile: _profile(id: '1', city: 'Goiânia', state: 'GO')),
        _entry(profile: _profile(id: '2', city: 'Anápolis', state: 'GO')),
      ];
      final result = applyDiscoverFilters(
        entries: entries,
        filters: const AthleteDiscoverFilters(stateUf: 'GO', city: 'goiania'),
      );
      expect(result.map((e) => e.userId), ['1']);
    });

    test('opções de cidade saem do catálogo da UF, ordenadas', () {
      final entries = [
        _entry(profile: _profile(id: '1', city: 'Goiânia', state: 'GO')),
        _entry(profile: _profile(id: '2', city: 'Anápolis', state: 'GO')),
        _entry(profile: _profile(id: '3', city: 'Santos', state: 'SP')),
      ];
      expect(discoverCityOptions(entries, 'GO'), ['Anápolis', 'Goiânia']);
    });

    test('UF entra nas constraints de servidor', () {
      const filters = AthleteDiscoverFilters(stateUf: 'GO');
      expect(discoverFirestoreConstraints(filters).stateUf, 'GO');
    });

    test('cidade NÃO entra nas constraints — não há índice', () {
      const filters = AthleteDiscoverFilters(stateUf: 'GO', city: 'Goiânia');
      final c = discoverFirestoreConstraints(filters);
      expect(c.stateUf, 'GO');
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd nexago_app && flutter test test/features/athlete/athlete_discover_logic_test.dart`
Expected: FAIL — parâmetros `stateUf`/`city` não existem.

- [ ] **Step 3: Write minimal implementation**

Em `AthleteDiscoverFilters`, acrescentar ao construtor, campos e `copyWith` (usando o sentinela
`_unset` já existente para permitir limpar):

```dart
    this.stateUf,
    this.city,
```
```dart
  final String? stateUf;
  final String? city;
```

E em `hasActiveFilters`, somar `|| stateUf != null || city != null`.

Em `athlete_discover_logic.dart`, acrescentar o predicado e usá-lo em `applyDiscoverFilters`
(`_normalizePlace` já existe no arquivo e remove acento):

```dart
bool _matchesLocation(AthleteProfile profile, AthleteDiscoverFilters filters) {
  final uf = filters.stateUf?.trim().toUpperCase();
  if (uf != null && uf.isNotEmpty) {
    if ((profile.state?.trim().toUpperCase() ?? '') != uf) return false;
  }
  final city = _normalizePlace(filters.city);
  if (city.isEmpty) return true;
  return _normalizePlace(profile.city) == city;
}

/// Cidades presentes no catálogo daquela UF — a lista é derivada dos perfis
/// carregados, não digitada: acento e caixa livres impediriam consulta.
List<String> discoverCityOptions(
  List<AthleteDiscoverEntry> entries,
  String? stateUf,
) {
  final uf = stateUf?.trim().toUpperCase();
  if (uf == null || uf.isEmpty) return const [];
  final cities = <String>{};
  for (final entry in entries) {
    if ((entry.profile.state?.trim().toUpperCase() ?? '') != uf) continue;
    final city = entry.profile.city.trim();
    if (city.isNotEmpty) cities.add(city);
  }
  final sorted = cities.toList()
    ..sort((a, b) => _normalizePlace(a).compareTo(_normalizePlace(b)));
  return sorted;
}
```

Em `applyDiscoverFilters`, junto dos demais predicados:

```dart
    if (!_matchesLocation(profile, filters)) return false;
```

Em `DiscoverFirestoreConstraints`, acrescentar `final String? stateUf;` ao construtor e a
`isEmpty`, e preenchê-lo em `discoverFirestoreConstraints`:

```dart
    stateUf: filters.stateUf?.trim().isNotEmpty == true
        ? filters.stateUf!.trim().toUpperCase()
        : null,
```

Em `_buildDiscoverQuery` no repositório, após o filtro de gênero:

```dart
    if (constraints.stateUf != null) {
      query = query.where('state', isEqualTo: constraints.stateUf);
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd nexago_app && flutter test test/features/athlete/ && flutter analyze`
Expected: PASS.

**Nota de índice:** `hasAthleteRole + state` existe. `hasAthleteRole + gender + state` **não**.
Com os dois ativos, a query falha e `fetchProfilesForDiscover` cai no `catch` para o catálogo
completo — comportamento já implementado, degradação aceita. Não criar índice.

- [ ] **Step 5: Commit**

```bash
git add nexago_app/lib/features/athlete/domain/ nexago_app/lib/features/athlete/data/athlete_discover_repository.dart nexago_app/test/features/athlete/athlete_discover_logic_test.dart
git commit -m "feat(discover): cidade e UF viram filtro, com UF no servidor"
```

---

### Task 8: Folha de filtros — seção LOCALIZAÇÃO

**Files:**
- Modify: `nexago_app/lib/features/athlete/presentation/widgets/discover/athlete_discover_filters_sheet.dart`
- Modify: `nexago_app/lib/features/athlete/presentation/athlete_discover_page.dart:62-78`
  (`_openFilters`, para passar as opções de cidade)

**Interfaces:**
- Consumes: `AthleteDiscoverFilters` com `stateUf`/`city` (Task 7); `discoverCityOptions` (Task 7).
- Produces: `showAthleteDiscoverFiltersSheet` ganha o parâmetro nomeado
  `required List<String> Function(String? stateUf) cityOptionsFor`.

- [ ] **Step 1: Remover o que saiu**

No sheet, apagar: os campos de estado `_distanceKm`, `_unlimitedDistance`, `_availableNow`,
`_objective`; suas linhas em `initState`, `_clear` e `_draft`; e os blocos de UI da seção
`DISTÂNCIA`, do `SwitchListTile` "Disponíveis agora" e da seção `OBJETIVO DO JOGO`.

- [ ] **Step 2: Acrescentar a seção LOCALIZAÇÃO**

Novos campos de estado, inicializados em `initState` a partir de `widget.initial` e zerados em
`_clear`:

```dart
  String? _stateUf;
  String? _city;
```

E, no lugar onde ficava a seção `DISTÂNCIA`, dentro do `ListView`:

```dart
                    const _SectionLabel(label: 'LOCALIZAÇÃO'),
                    _ChipWrap(
                      options: _ufOptions,
                      selectedLabel: _stateUf,
                      onToggle: (label) {
                        setState(() {
                          if (_stateUf == label) {
                            _stateUf = null;
                          } else {
                            _stateUf = label;
                          }
                          // Cidade pertence a uma UF: trocar de UF invalida.
                          _city = null;
                        });
                      },
                    ),
                    if (_stateUf != null) ...[
                      const SizedBox(height: 12),
                      Builder(
                        builder: (context) {
                          final cities = widget.cityOptionsFor(_stateUf);
                          if (cities.isEmpty) {
                            return Text(
                              'Nenhuma cidade no catálogo desta UF.',
                              style: AppTypography.mono(
                                fontSize: 11,
                                color: context.themeColors.onSurfaceMuted,
                              ),
                            );
                          }
                          return _ChipWrap(
                            options: cities,
                            selectedLabel: _city,
                            onToggle: (label) => setState(
                              () => _city = _city == label ? null : label,
                            ),
                          );
                        },
                      ),
                    ],
```

Constante das 27 unidades federativas, no topo do arquivo:

```dart
const _ufOptions = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS',
  'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC',
  'SP', 'SE', 'TO',
];
```

Incluir os dois em `_draft()`:

```dart
      stateUf: _stateUf,
      city: _city,
```

- [ ] **Step 3: Passar as opções da página**

Na assinatura de `showAthleteDiscoverFiltersSheet` e do widget, acrescentar
`required List<String> Function(String? stateUf) cityOptionsFor`, repassando ao
`_AthleteDiscoverFiltersSheet`. Em `_openFilters` na página:

```dart
      cityOptionsFor: (uf) => discoverCityOptions(
        ref.read(athleteDiscoverProvider).rawEntries,
        uf,
      ),
```

(importar `athlete_discover_logic.dart` na página, se ainda não estiver importado).

- [ ] **Step 4: Verificar**

Run: `cd nexago_app && flutter analyze && flutter test test/features/athlete/`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add nexago_app/lib/features/athlete/presentation/
git commit -m "feat(discover): seção LOCALIZAÇÃO na folha de filtros"
```

---

### Task 9: UX do campo de busca

**Files:**
- Modify: `nexago_app/lib/features/athlete/presentation/athlete_discover_page.dart:118-146`
  (o `TextField`) e `:240-252` (o ramo de `isLoading` em `_buildBodySlivers`)

**Interfaces:**
- Consumes: `AthleteDiscoverState` (existente).
- Produces: nada consumido por outras tasks.

- [ ] **Step 1: Hint honesto e botão de limpar**

No `TextField`, trocar o `hintText` e acrescentar o `suffixIcon`:

```dart
                          hintText: 'Nome ou @apelido',
```
```dart
                          suffixIcon: _searchController.text.isEmpty
                              ? null
                              : IconButton(
                                  icon: Icon(
                                    Icons.close_rounded,
                                    color: context.themeColors.onSurfaceMuted,
                                  ),
                                  onPressed: () {
                                    _searchController.clear();
                                    ref
                                        .read(athleteDiscoverProvider.notifier)
                                        .search('');
                                  },
                                ),
```

Para o botão aparecer/sumir conforme o texto, `_onSearchChanged` precisa reconstruir. Acrescentar
como primeira linha do método:

```dart
    setState(() {});
```

(o `Timer` de debounce continua igual, logo abaixo — só a reconstrução é imediata).

- [ ] **Step 2: A lista para de piscar**

Em `_buildBodySlivers`, o ramo atual troca a lista inteira por spinner sempre que
`isLoading`. Restringir ao primeiro carregamento, quando não há o que mostrar:

```dart
  if (state.isLoading && state.displayEntries.isEmpty) {
```

E, quando há resultados anteriores em tela durante um carregamento, mostrar faixa fina no topo da
lista. Dentro do `SliverList.separated`, no `itemBuilder`, o índice extra do fim já existe; para o
topo, acrescentar antes do `SliverPadding` da lista:

```dart
    if (state.isLoading)
      const SliverToBoxAdapter(
        child: Padding(
          padding: EdgeInsets.symmetric(horizontal: _discoverHorizontalPadding),
          child: LinearProgressIndicator(
            minHeight: 2,
            color: AppColors.brand,
            backgroundColor: Colors.transparent,
          ),
        ),
      ),
```

- [ ] **Step 3: Verificar**

Run: `cd nexago_app && flutter analyze && flutter test test/features/athlete/`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add nexago_app/lib/features/athlete/presentation/athlete_discover_page.dart
git commit -m "feat(discover): campo de busca com limpar e sem piscar a lista"
```

---

### Task 10: Verificação final

- [ ] **Step 1: Suíte inteira**

Run: `cd nexago_app && flutter analyze && flutter test`
Expected: sem erro de análise; suíte verde. Falha em `features/tournaments/` significa que alguma
task vazou para a tela de duplas — reverter a parte que vazou.

- [ ] **Step 2: Exercitar no app**

Rodar o app apontando para dev e, na tela Descobrir:

1. Buscar um nome COMPOSTO de atleta que exista na base. **É o caso que falhava.**
2. Buscar o mesmo nome sem acento.
3. Buscar por um `@apelido` de quem tenha apelido preenchido.
4. Confirmar que atleta SEM apelido não exibe mais `@` nenhum.
5. Abrir filtros, escolher uma UF, conferir que a lista de cidades aparece e filtra.
6. Confirmar que não há mais "km" em card nenhum.

- [ ] **Step 3: Medir o risco do backfill — não presumir**

A spec registra que o backfill de `keywords` não rodou. O impacto real é mais estreito do que
parece, e precisa ser MEDIDO, não afirmado: `profileMatchesSearchTokens`
(`search_keywords.dart:228-233`) já confere contra as variantes do nome do próprio doc, então
`keywords` desatualizado não esconde quem casa. **Só a consulta-âncora depende de `keywords`** —
se o token âncora não estiver no array, o doc nunca é lido.

Em dev, buscar por atleta cujo perfil nunca foi regravado desde 20/08 e anotar se aparece.
Registrar o resultado no PR. Se não aparecer, o backfill vira pré-requisito de produção e isso
precisa estar escrito — não deduzido.

- [ ] **Step 4: Commit final e PR**

```bash
git add -A
git commit -m "test(discover): verificação da busca e filtros de atletas"
```

Na descrição do PR, incluir: o que foi medido no Step 3, e a lista de "Fora de escopo" da spec —
ordenação e contador desligados, `athlete_discover_level_chips.dart` ainda morto, distância falsa
ainda presente na tela de duplas.
