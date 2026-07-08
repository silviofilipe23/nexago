# Filtro de Nível no Ranking Geral — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um filtro por nível (Iniciante 1/2, Intermediário 1/2, Open) na aba Ranking geral do app, análogo ao filtro de gênero já existente, resolvendo o nível do atleta pelo esporte principal do perfil.

**Architecture:** `AppUserProfile` (já usado pelo ranking pra nome/avatar/gênero) ganha os dois campos que faltam (`primarySportFirestoreId`, `levelsBySportFirestore`), lidos do mesmo `sportOnboarding` já espelhado em `public_profiles`. Duas funções puras novas em `ranking_logic.dart` resolvem o rank de nível (atleta e dupla) e filtram as linhas — mesmo padrão de `filterAthleteRowsByGender`/`filterTeamRowsByGender`. `RankingPageFilter` ganha um campo `level` (rank inteiro, `null` = todos). Por fim, `ranking_list_mapper.dart`/`ranking_providers.dart` são religados pra usar essas funções (removendo a leitura hoje feita numa coleção `athlete_profiles` separada, que não é o espelho público real usado no resto do app), e um dropdown novo aparece na tela do ranking.

**Tech Stack:** Flutter/Dart, Riverpod, `flutter_test`.

## Global Constraints

- Nenhuma mudança em Cloud Functions, regras do Firestore, ou nos documentos `athleteRankings`/`teamRankings`.
- Nível resolvido **só** por `sportOnboarding.levelsBySport[primarySportId]` — **sem** fallback pro campo global legado (`level`/`nivel`). Perfil sem esporte principal, ou sem nível registrado nele, fica com nível **não resolvido** (`null`), não "Iniciante".
- Correspondência de nível é **exata** (igual ao gênero) — não é "esse nível ou acima".
- Nível de dupla = o **maior rank** entre os dois atletas (mesma regra do anti-sandbagging).
- Rótulos de nível sempre via `AthleteProfileOptions.labelForRank(rank)` (`package:nexago_app/features/athlete/domain/athlete_profile_options.dart`) — não reimplementar os textos.
- Filtro de nível é independente e combinado (E lógico) com gênero/ano/busca, igual já acontece entre os filtros existentes.
- Nenhuma dependência nova no `pubspec.yaml`.

---

## Task 1: `AppUserProfile` — esporte principal e níveis por esporte

**Files:**
- Modify: `nexago_app/lib/core/profiles/app_user_profile.dart`
- Test: `nexago_app/test/features/tournaments/app_user_profile_test.dart`

**Interfaces:**
- Produces: `AppUserProfile.primarySportFirestoreId` (`String?`), `AppUserProfile.levelsBySportFirestore` (`Map<String, String>`, default `const {}`), e um novo factory `AppUserProfile.fromMap(String uid, Map<String, dynamic> data)` (a lógica real de parsing; `fromFirestore` passa a delegar pra ele — mesmo padrão de `TournamentMatch.fromMap`/`fromFirestore` em `tournament_match_mapper.dart`). Usado pelas Tasks 2 e 3.

- [ ] **Step 1: Escrever os testes (vão falhar — os campos/factory ainda não existem)**

Adicione ao final de `nexago_app/test/features/tournaments/app_user_profile_test.dart`, antes do `}` que fecha `main()`:

```dart
  group('AppUserProfile.fromMap sportOnboarding parsing', () {
    test(
      'parses primary sport and per-sport levels from sportOnboarding',
      () {
        final profile = AppUserProfile.fromMap('u1', {
          'fullName': 'Ana',
          'sportOnboarding': {
            'primarySportId': 'VOLEI_PRAIA',
            'levelsBySport': {
              'VOLEI_PRAIA': 'intermediario_1',
              'VOLEI_QUADRA': 'iniciante_2',
            },
          },
        });

        expect(profile.primarySportFirestoreId, 'VOLEI_PRAIA');
        expect(profile.levelsBySportFirestore, {
          'VOLEI_PRAIA': 'intermediario_1',
          'VOLEI_QUADRA': 'iniciante_2',
        });
      },
    );

    test(
      'defaults to null primary sport and empty levels when sportOnboarding '
      'is missing',
      () {
        final profile = AppUserProfile.fromMap('u2', {'fullName': 'Bruno'});
        expect(profile.primarySportFirestoreId, isNull);
        expect(profile.levelsBySportFirestore, isEmpty);
      },
    );

    test('ignores non-string level values', () {
      final profile = AppUserProfile.fromMap('u3', {
        'sportOnboarding': {
          'primarySportId': 'VOLEI_PRAIA',
          'levelsBySport': {'VOLEI_PRAIA': 42},
        },
      });
      expect(profile.levelsBySportFirestore, isEmpty);
    });
  });
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd nexago_app && flutter test test/features/tournaments/app_user_profile_test.dart`
Expected: FAIL — `The method 'fromMap' isn't defined for the type 'AppUserProfile'`.

- [ ] **Step 3: Implementar os campos e o `fromMap`**

Em `nexago_app/lib/core/profiles/app_user_profile.dart`, troque:

```dart
class AppUserProfile {
  const AppUserProfile({
    required this.uid,
    this.email,
    this.fullName,
    this.nickname,
    this.phoneNumber,
    this.gender,
    this.birthDate,
    this.profilePhotoUrl,
    this.role,
    this.partnerInviteStatus,
    this.invitedByUid,
    this.invitedAt,
    this.city,
    this.state,
    this.roles = const [],
  });

  final String uid;
  final String? email;
  final String? fullName;
  final String? nickname;
  final String? phoneNumber;
  final String? gender;
  final String? birthDate;
  final String? profilePhotoUrl;
  final String? role;
  final String? partnerInviteStatus;
  final String? invitedByUid;
  final DateTime? invitedAt;
  final String? city;
  final String? state;
  final List<String> roles;

  factory AppUserProfile.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data() ?? {};
    return AppUserProfile(
      uid: doc.id,
      email: _str(data['email']),
      fullName: _str(data['fullName']) ?? _str(data['name']),
      nickname: _str(data['nickname']),
      phoneNumber: _str(data['phoneNumber']),
      gender: _str(data['gender']),
      birthDate: _str(data['birthDate']),
      profilePhotoUrl: _str(data['profilePhotoUrl']) ?? _str(data['avatarUrl']),
      role: _str(data['role']),
      partnerInviteStatus: _str(data['partnerInviteStatus']),
      invitedByUid: _str(data['invitedByUid']),
      invitedAt: _timestamp(data['invitedAt']),
      city: _str(data['city']),
      state: _str(data['state']),
      roles: _stringList(data['roles']),
    );
  }
```

por:

```dart
class AppUserProfile {
  const AppUserProfile({
    required this.uid,
    this.email,
    this.fullName,
    this.nickname,
    this.phoneNumber,
    this.gender,
    this.birthDate,
    this.profilePhotoUrl,
    this.role,
    this.partnerInviteStatus,
    this.invitedByUid,
    this.invitedAt,
    this.city,
    this.state,
    this.roles = const [],
    this.primarySportFirestoreId,
    this.levelsBySportFirestore = const {},
  });

  final String uid;
  final String? email;
  final String? fullName;
  final String? nickname;
  final String? phoneNumber;
  final String? gender;
  final String? birthDate;
  final String? profilePhotoUrl;
  final String? role;
  final String? partnerInviteStatus;
  final String? invitedByUid;
  final DateTime? invitedAt;
  final String? city;
  final String? state;
  final List<String> roles;
  final String? primarySportFirestoreId;
  /// Nível por esporte em `sportOnboarding.levelsBySport` (código Firestore
  /// do esporte → código do nível, ex.: `intermediario_1`).
  final Map<String, String> levelsBySportFirestore;

  factory AppUserProfile.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    return AppUserProfile.fromMap(doc.id, doc.data() ?? {});
  }

  factory AppUserProfile.fromMap(String uid, Map<String, dynamic> data) {
    final onboarding = data['sportOnboarding'];
    String? primarySportFirestoreId;
    final levelsBySportFirestore = <String, String>{};
    if (onboarding is Map) {
      primarySportFirestoreId = _str(onboarding['primarySportId']);
      final levelsRaw = onboarding['levelsBySport'];
      if (levelsRaw is Map) {
        for (final entry in levelsRaw.entries) {
          final value = entry.value;
          if (value is String && value.trim().isNotEmpty) {
            levelsBySportFirestore[entry.key.toString()] = value.trim();
          }
        }
      }
    }
    return AppUserProfile(
      uid: uid,
      email: _str(data['email']),
      fullName: _str(data['fullName']) ?? _str(data['name']),
      nickname: _str(data['nickname']),
      phoneNumber: _str(data['phoneNumber']),
      gender: _str(data['gender']),
      birthDate: _str(data['birthDate']),
      profilePhotoUrl: _str(data['profilePhotoUrl']) ?? _str(data['avatarUrl']),
      role: _str(data['role']),
      partnerInviteStatus: _str(data['partnerInviteStatus']),
      invitedByUid: _str(data['invitedByUid']),
      invitedAt: _timestamp(data['invitedAt']),
      city: _str(data['city']),
      state: _str(data['state']),
      roles: _stringList(data['roles']),
      primarySportFirestoreId: primarySportFirestoreId,
      levelsBySportFirestore: levelsBySportFirestore,
    );
  }
```

(Os métodos privados `_stringList`, `_str`, `_timestamp` no restante da classe continuam exatamente como estão — não mexa neles.)

- [ ] **Step 4: Rodar os testes de novo e confirmar que passam**

Run: `cd nexago_app && flutter test test/features/tournaments/app_user_profile_test.dart`
Expected: PASS (todos os testes, incluindo os 3 novos).

- [ ] **Step 5: Commit**

```bash
cd nexago_app
git add lib/core/profiles/app_user_profile.dart test/features/tournaments/app_user_profile_test.dart
git commit -m "feat(ranking): add primary sport and per-sport levels to AppUserProfile"
```

---

## Task 2: Resolução e filtro de nível em `ranking_logic.dart`

**Files:**
- Modify: `nexago_app/lib/features/ranking/domain/ranking_logic.dart`
- Modify: `nexago_app/lib/features/ranking/domain/ranking_list_models.dart`
- Test: `nexago_app/test/features/ranking/ranking_logic_test.dart`

**Interfaces:**
- Consumes: `AppUserProfile.primarySportFirestoreId` / `.levelsBySportFirestore` (Task 1), `AthleteProfileOptions.levelRank` (`package:nexago_app/features/athlete/domain/athlete_profile_options.dart`, já existe).
- Produces: `int? athleteLevelRank(AppUserProfile? profile)`, `int? teamLevelRank(AppUserProfile? player1, AppUserProfile? player2)`, `List<AthleteRankingRow> filterAthleteRowsByLevel(List<AthleteRankingRow> rows, int? levelRank, Map<String, int?> levelRankByAthleteId)`, `List<TeamRankingRow> filterTeamRowsByLevel(List<TeamRankingRow> rows, int? levelRank, Map<String, int?> levelRankByTeamId)`, e o novo campo `RankingPageFilter.level` (`int?`). Usados pela Task 3.

- [ ] **Step 1: Escrever os testes (vão falhar — as funções ainda não existem)**

Adicione ao final de `nexago_app/test/features/ranking/ranking_logic_test.dart`, antes do `}` que fecha `main()` (e adicione o import `package:nexago_app/core/profiles/app_user_profile.dart` no topo do arquivo):

```dart
  group('athleteLevelRank', () {
    test('resolves rank from levelsBySportFirestore of the primary sport', () {
      const profile = AppUserProfile(
        uid: 'a1',
        primarySportFirestoreId: 'VOLEI_PRAIA',
        levelsBySportFirestore: {'VOLEI_PRAIA': 'intermediario_1'},
      );
      expect(athleteLevelRank(profile), 2);
    });

    test('returns null when there is no primary sport', () {
      const profile = AppUserProfile(uid: 'a2');
      expect(athleteLevelRank(profile), isNull);
    });

    test('returns null when the primary sport has no level registered', () {
      const profile = AppUserProfile(
        uid: 'a3',
        primarySportFirestoreId: 'VOLEI_QUADRA',
        levelsBySportFirestore: {'VOLEI_PRAIA': 'open'},
      );
      expect(athleteLevelRank(profile), isNull);
    });

    test('returns null for a null profile', () {
      expect(athleteLevelRank(null), isNull);
    });
  });

  group('teamLevelRank', () {
    test('returns the higher rank between the two athletes', () {
      const p1 = AppUserProfile(
        uid: 'p1',
        primarySportFirestoreId: 'VOLEI_PRAIA',
        levelsBySportFirestore: {'VOLEI_PRAIA': 'iniciante_1'},
      );
      const p2 = AppUserProfile(
        uid: 'p2',
        primarySportFirestoreId: 'VOLEI_PRAIA',
        levelsBySportFirestore: {'VOLEI_PRAIA': 'open'},
      );
      expect(teamLevelRank(p1, p2), 5);
    });

    test('falls back to the resolved player when the other has no level', () {
      const p1 = AppUserProfile(
        uid: 'p1',
        primarySportFirestoreId: 'VOLEI_PRAIA',
        levelsBySportFirestore: {'VOLEI_PRAIA': 'intermediario_2'},
      );
      expect(teamLevelRank(p1, null), 3);
      expect(teamLevelRank(null, p1), 3);
    });

    test('returns null when neither athlete has a resolved level', () {
      expect(teamLevelRank(null, null), isNull);
    });
  });

  group('filterAthleteRowsByLevel', () {
    test('filters and reassigns ranks', () {
      final rows = [
        const AthleteRankingRow(
          rank: 1,
          athleteId: 'a1',
          totalPoints: 500,
          tournamentsCount: 2,
        ),
        const AthleteRankingRow(
          rank: 2,
          athleteId: 'a2',
          totalPoints: 400,
          tournamentsCount: 2,
        ),
      ];
      final filtered = filterAthleteRowsByLevel(rows, 5, {'a1': 2, 'a2': 5});
      expect(filtered.length, 1);
      expect(filtered.first.athleteId, 'a2');
      expect(filtered.first.rank, 1);
    });

    test(
      'excludes athletes with unresolved level when a level is selected',
      () {
        final rows = [
          const AthleteRankingRow(
            rank: 1,
            athleteId: 'a1',
            totalPoints: 500,
            tournamentsCount: 2,
          ),
        ];
        final filtered = filterAthleteRowsByLevel(rows, 5, {'a1': null});
        expect(filtered, isEmpty);
      },
    );

    test('returns all rows unchanged when levelRank is null', () {
      final rows = [
        const AthleteRankingRow(
          rank: 1,
          athleteId: 'a1',
          totalPoints: 500,
          tournamentsCount: 2,
        ),
      ];
      expect(filterAthleteRowsByLevel(rows, null, {'a1': null}), rows);
    });
  });

  group('filterTeamRowsByLevel', () {
    test('filters and reassigns ranks', () {
      final rows = [
        const TeamRankingRow(
          rank: 1,
          teamId: 't1',
          totalPoints: 500,
          tournamentsCount: 2,
        ),
        const TeamRankingRow(
          rank: 2,
          teamId: 't2',
          totalPoints: 400,
          tournamentsCount: 2,
        ),
      ];
      final filtered = filterTeamRowsByLevel(rows, 0, {'t1': 0, 't2': 5});
      expect(filtered.length, 1);
      expect(filtered.first.teamId, 't1');
      expect(filtered.first.rank, 1);
    });
  });
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd nexago_app && flutter test test/features/ranking/ranking_logic_test.dart`
Expected: FAIL — `The function 'athleteLevelRank' isn't defined` (e as demais funções novas).

- [ ] **Step 3: Implementar as funções em `ranking_logic.dart`**

No topo de `nexago_app/lib/features/ranking/domain/ranking_logic.dart`, troque:

```dart
import 'ranking_constants.dart';
import 'ranking_list_models.dart';
import 'ranking_models.dart';
```

por:

```dart
import 'package:nexago_app/core/profiles/app_user_profile.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_options.dart';

import 'ranking_constants.dart';
import 'ranking_list_models.dart';
import 'ranking_models.dart';
```

Depois, adicione ao final do arquivo (depois de `filterTeamRowsByGender`, antes de `filterRankingEntriesBySearch`):

```dart
/// Rank de nível do atleta pro ranking geral: resolvido pelo esporte
/// principal (`levelsBySportFirestore[primarySportFirestoreId]`). Sem
/// fallback pro nível global legado — perfil sem esporte principal, ou sem
/// nível registrado nele, fica sem nível resolvido (`null`).
int? athleteLevelRank(AppUserProfile? profile) {
  if (profile == null) return null;
  final sportCode = profile.primarySportFirestoreId;
  if (sportCode == null || sportCode.isEmpty) return null;
  return AthleteProfileOptions.levelRank(
    profile.levelsBySportFirestore[sportCode],
  );
}

/// Rank de nível da dupla: o maior entre os dois atletas (mesma regra do
/// anti-sandbagging — "vale o integrante mais forte"). `null` só quando
/// nenhum dos dois tem nível resolvido.
int? teamLevelRank(AppUserProfile? player1, AppUserProfile? player2) {
  final r1 = athleteLevelRank(player1);
  final r2 = athleteLevelRank(player2);
  if (r1 == null) return r2;
  if (r2 == null) return r1;
  return r1 > r2 ? r1 : r2;
}

/// Filtra o ranking de atletas por nível exato (`null` = todos os níveis).
/// Atleta sem nível resolvido nunca aparece quando um nível específico é
/// escolhido.
List<AthleteRankingRow> filterAthleteRowsByLevel(
  List<AthleteRankingRow> rows,
  int? levelRank,
  Map<String, int?> levelRankByAthleteId,
) {
  if (levelRank == null) return rows;
  final filtered = rows
      .where((row) => levelRankByAthleteId[row.athleteId] == levelRank)
      .toList();
  return assignRanks(filtered);
}

/// Filtra o ranking de duplas por nível exato (`null` = todos os níveis).
List<TeamRankingRow> filterTeamRowsByLevel(
  List<TeamRankingRow> rows,
  int? levelRank,
  Map<String, int?> levelRankByTeamId,
) {
  if (levelRank == null) return rows;
  final filtered = rows
      .where((row) => levelRankByTeamId[row.teamId] == levelRank)
      .toList();
  return assignTeamRanks(filtered);
}
```

- [ ] **Step 4: Adicionar o campo `level` em `RankingPageFilter`**

Em `nexago_app/lib/features/ranking/domain/ranking_list_models.dart`, troque:

```dart
class RankingPageFilter {
  const RankingPageFilter({
    this.mode = RankingListMode.athletes,
    this.year,
    this.gender = RankingGenderFilter.all,
  });

  final RankingListMode mode;
  final int? year;
  final RankingGenderFilter gender;

  bool get isGeneralMode => year == null;

  String get pointsModeLabel => isGeneralMode ? 'SOMA TOTAL' : 'MELHORES 5';

  RankingPageFilter copyWith({
    RankingListMode? mode,
    int? Function()? year,
    RankingGenderFilter? gender,
  }) {
    return RankingPageFilter(
      mode: mode ?? this.mode,
      year: year != null ? year() : this.year,
      gender: gender ?? this.gender,
    );
  }
}
```

por:

```dart
class RankingPageFilter {
  const RankingPageFilter({
    this.mode = RankingListMode.athletes,
    this.year,
    this.gender = RankingGenderFilter.all,
    this.level,
  });

  final RankingListMode mode;
  final int? year;
  final RankingGenderFilter gender;
  /// Rank de nível selecionado (`null` = todos os níveis).
  final int? level;

  bool get isGeneralMode => year == null;

  String get pointsModeLabel => isGeneralMode ? 'SOMA TOTAL' : 'MELHORES 5';

  RankingPageFilter copyWith({
    RankingListMode? mode,
    int? Function()? year,
    RankingGenderFilter? gender,
    int? Function()? level,
  }) {
    return RankingPageFilter(
      mode: mode ?? this.mode,
      year: year != null ? year() : this.year,
      gender: gender ?? this.gender,
      level: level != null ? level() : this.level,
    );
  }
}
```

- [ ] **Step 5: Rodar os testes de novo e confirmar que passam**

Run: `cd nexago_app && flutter test test/features/ranking/ranking_logic_test.dart`
Expected: PASS (todos os testes, incluindo os novos de nível).

- [ ] **Step 6: Commit**

```bash
cd nexago_app
git add lib/features/ranking/domain/ranking_logic.dart lib/features/ranking/domain/ranking_list_models.dart test/features/ranking/ranking_logic_test.dart
git commit -m "feat(ranking): add level rank resolution and filtering to ranking_logic"
```

---

## Task 3: Dropdown de nível na tela de ranking geral

**Files:**
- Modify: `nexago_app/lib/features/ranking/domain/ranking_list_mapper.dart`
- Modify: `nexago_app/lib/features/ranking/domain/ranking_providers.dart`
- Create: `nexago_app/lib/features/ranking/presentation/widgets/ranking_level_filter_dropdown.dart`
- Modify: `nexago_app/lib/features/ranking/presentation/athlete_ranking_page.dart`

**Interfaces:**
- Consumes: `athleteLevelRank`, `teamLevelRank`, `filterAthleteRowsByLevel`, `filterTeamRowsByLevel`, `RankingPageFilter.level` (Task 2); `AthleteProfileOptions.labelForRank`.
- Produces: nenhuma interface nova consumida por outro arquivo — a mudança é ponta a ponta dentro da própria feature de ranking.

**Nota sobre testes:** `buildAthleteRankingListEntries`/`buildTeamRankingListEntries` e a tela `AthleteRankingPage` já não tinham nenhum teste automatizado antes desta feature (dependem de `RankingRepository`/`UsersRepository`/Riverpod ligados ao Firestore) — mesma situação do widget de ranking de liga num projeto anterior. A lógica de decisão (rank de nível, filtro) já está 100% coberta na Task 2; aqui a verificação é `flutter analyze` + `flutter test` (suíte completa) + um checklist manual documentado no relatório.

- [ ] **Step 1: Religar `buildAthleteRankingListEntries` — remover `athleteLevelsFor`, resolver e filtrar por nível**

Em `nexago_app/lib/features/ranking/domain/ranking_list_mapper.dart`, adicione ao topo do arquivo (junto aos imports existentes):

```dart
import 'package:nexago_app/features/athlete/domain/athlete_profile_options.dart';
```

Troque:

```dart
Future<List<RankingListEntry>> buildAthleteRankingListEntries({
  required RankingRepository repo,
  required UsersRepository users,
  required RankingPageFilter filter,
  required String? currentUid,
  required Future<Map<String, String?>> Function(Iterable<String> uids)
      athleteLevelsFor,
}) async {
  var rows = await repo.loadAthleteRanking(year: filter.year);
  if (rows.isEmpty) return const [];

  // Uma leitura em lote cobre filtro de gênero e exibição.
  final profiles =
      await users.getUsersByIds(rows.map((row) => row.athleteId));

  final genderByAthlete = <String, RankingGenderFilter?>{
    for (final row in rows)
      row.athleteId:
          normalizeRankingGender(profiles[row.athleteId]?.gender),
  };

  rows = filterAthleteRowsByGender(
    rows,
    filter.gender,
    genderByAthlete,
  );
  if (rows.isEmpty) return const [];

  final levels = await athleteLevelsFor(rows.map((row) => row.athleteId));

  final entries = <RankingListEntry>[];
  for (final row in rows) {
    final profile = profiles[row.athleteId];
    final level = levels[row.athleteId];
    entries.add(
      RankingListEntry(
        rank: row.rank,
        points: row.totalPoints,
        tournamentsCount: row.tournamentsCount,
        displayName: rankingDisplayName(profile, row.athleteId),
        subtitle: rankingSubtitle(
          levelLabel: level,
          tournamentsCount: row.tournamentsCount,
        ),
        isCurrentUser: row.athleteId == currentUid,
        entityId: row.athleteId,
        initials: rankingInitials(profile, row.athleteId),
        avatarColor: rankingAvatarColor(row.athleteId),
        avatarUrl: rankingAvatarUrl(profile),
      ),
    );
  }
  return entries;
}
```

por:

```dart
Future<List<RankingListEntry>> buildAthleteRankingListEntries({
  required RankingRepository repo,
  required UsersRepository users,
  required RankingPageFilter filter,
  required String? currentUid,
}) async {
  var rows = await repo.loadAthleteRanking(year: filter.year);
  if (rows.isEmpty) return const [];

  // Uma leitura em lote cobre filtro de gênero, nível e exibição.
  final profiles =
      await users.getUsersByIds(rows.map((row) => row.athleteId));

  final genderByAthlete = <String, RankingGenderFilter?>{
    for (final row in rows)
      row.athleteId:
          normalizeRankingGender(profiles[row.athleteId]?.gender),
  };

  rows = filterAthleteRowsByGender(
    rows,
    filter.gender,
    genderByAthlete,
  );
  if (rows.isEmpty) return const [];

  final levelRankByAthlete = <String, int?>{
    for (final row in rows)
      row.athleteId: athleteLevelRank(profiles[row.athleteId]),
  };
  rows = filterAthleteRowsByLevel(rows, filter.level, levelRankByAthlete);
  if (rows.isEmpty) return const [];

  final entries = <RankingListEntry>[];
  for (final row in rows) {
    final profile = profiles[row.athleteId];
    final levelRank = athleteLevelRank(profile);
    final levelLabel = levelRank != null
        ? AthleteProfileOptions.labelForRank(levelRank)
        : null;
    entries.add(
      RankingListEntry(
        rank: row.rank,
        points: row.totalPoints,
        tournamentsCount: row.tournamentsCount,
        displayName: rankingDisplayName(profile, row.athleteId),
        subtitle: rankingSubtitle(
          levelLabel: levelLabel,
          tournamentsCount: row.tournamentsCount,
        ),
        isCurrentUser: row.athleteId == currentUid,
        entityId: row.athleteId,
        initials: rankingInitials(profile, row.athleteId),
        avatarColor: rankingAvatarColor(row.athleteId),
        avatarUrl: rankingAvatarUrl(profile),
      ),
    );
  }
  return entries;
}
```

- [ ] **Step 2: Religar `buildTeamRankingListEntries` — filtrar duplas por nível**

No mesmo arquivo, troque:

```dart
  rows = filterTeamRowsByGender(rows, filter.gender, genderByTeam);
  if (rows.isEmpty) return const [];

  final profiles = await users.getUsersByIds([
    for (final team in teams.values) ...[
      if (team.player1Id != null) team.player1Id!,
      if (team.player2Id != null) team.player2Id!,
    ],
  ]);

  final entries = <RankingListEntry>[];
```

por:

```dart
  rows = filterTeamRowsByGender(rows, filter.gender, genderByTeam);
  if (rows.isEmpty) return const [];

  final profiles = await users.getUsersByIds([
    for (final team in teams.values) ...[
      if (team.player1Id != null) team.player1Id!,
      if (team.player2Id != null) team.player2Id!,
    ],
  ]);

  final levelRankByTeam = <String, int?>{
    for (final row in rows)
      row.teamId: teamLevelRank(
        profiles[teams[row.teamId]?.player1Id],
        profiles[teams[row.teamId]?.player2Id],
      ),
  };
  rows = filterTeamRowsByLevel(rows, filter.level, levelRankByTeam);
  if (rows.isEmpty) return const [];

  final entries = <RankingListEntry>[];
```

- [ ] **Step 3: Remover `levelsFor` e religar a chamada em `ranking_providers.dart`**

Em `nexago_app/lib/features/ranking/domain/ranking_providers.dart`, troque:

```dart
  final filter = ref.watch(rankingPageFilterProvider);
  final user = await ref.watch(authProvider.future);
  final currentUid = user?.uid.trim();
  final repo = ref.read(rankingRepositoryProvider);
  final users = ref.read(usersRepositoryProvider);
  final firestore = ref.read(firestoreProvider);

  Future<Map<String, String?>> levelsFor(Iterable<String> uids) async {
    final unique = uids
        .map((u) => u.trim())
        .where((u) => u.isNotEmpty)
        .toSet()
        .toList();
    if (unique.isEmpty) return {};

    const chunkSize = 10;
    final futures = <Future<QuerySnapshot<Map<String, dynamic>>>>[];
    for (var i = 0; i < unique.length; i += chunkSize) {
      final end =
          (i + chunkSize) > unique.length ? unique.length : (i + chunkSize);
      futures.add(
        firestore
            .collection('athlete_profiles')
            .where(FieldPath.documentId, whereIn: unique.sublist(i, end))
            .get(),
      );
    }

    final levels = <String, String?>{};
    for (final snap in await Future.wait(futures)) {
      for (final doc in snap.docs) {
        final data = doc.data();
        final level = data['level'] ?? data['nivel'];
        levels[doc.id] = level?.toString().trim();
      }
    }
    return levels;
  }

  if (filter.mode == RankingListMode.teams) {
    return buildTeamRankingListEntries(
      repo: repo,
      users: users,
      filter: filter,
      currentUid: currentUid,
    );
  }

  return buildAthleteRankingListEntries(
    repo: repo,
    users: users,
    filter: filter,
    currentUid: currentUid,
    athleteLevelsFor: levelsFor,
  );
});
```

por:

```dart
  final filter = ref.watch(rankingPageFilterProvider);
  final user = await ref.watch(authProvider.future);
  final currentUid = user?.uid.trim();
  final repo = ref.read(rankingRepositoryProvider);
  final users = ref.read(usersRepositoryProvider);

  if (filter.mode == RankingListMode.teams) {
    return buildTeamRankingListEntries(
      repo: repo,
      users: users,
      filter: filter,
      currentUid: currentUid,
    );
  }

  return buildAthleteRankingListEntries(
    repo: repo,
    users: users,
    filter: filter,
    currentUid: currentUid,
  );
});
```

Depois, remova o import agora não usado no topo do arquivo (verifique se `cloud_firestore` não é usado em mais nenhum lugar do arquivo antes de remover — nesse arquivo não é):

```dart
import 'package:cloud_firestore/cloud_firestore.dart';
```

- [ ] **Step 4: Criar o widget `RankingLevelFilterDropdown`**

Crie `nexago_app/lib/features/ranking/presentation/widgets/ranking_level_filter_dropdown.dart`:

```dart
import 'package:flutter/material.dart';

import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_options.dart';

/// Dropdown de nível na tela de ranking geral — mesmo padrão visual do
/// seletor de categoria do ranking de liga. `null` = todos os níveis.
class RankingLevelFilterDropdown extends StatelessWidget {
  const RankingLevelFilterDropdown({
    super.key,
    required this.selectedRank,
    required this.onChanged,
  });

  final int? selectedRank;
  final ValueChanged<int?> onChanged;

  /// Ranks unificados da escada de 5 (1 e 4 reservados p/ beach tennis).
  static const _ranks = [0, 1, 2, 3, 5];

  @override
  Widget build(BuildContext context) {
    final label = selectedRank == null
        ? 'Todos os níveis'
        : AthleteProfileOptions.labelForRank(selectedRank!);

    return PopupMenuButton<int?>(
      initialValue: selectedRank,
      onSelected: onChanged,
      color: context.themeColors.surfaceRaised,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      itemBuilder: (context) => [
        const PopupMenuItem<int?>(
          value: null,
          child: Text('Todos os níveis'),
        ),
        for (final rank in _ranks)
          PopupMenuItem<int?>(
            value: rank,
            child: Text(AthleteProfileOptions.labelForRank(rank)),
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
              label,
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

- [ ] **Step 5: Inserir o dropdown na tela e preservar o nível ao trocar de ano**

Em `nexago_app/lib/features/ranking/presentation/athlete_ranking_page.dart`, adicione o import (junto aos outros da pasta `widgets/`):

```dart
import 'widgets/ranking_level_filter_dropdown.dart';
```

Troque:

```dart
                    RankingYearFilterRow(
                      yearOptions: [null, ...yearOptions],
                      selectedYear: filter.year,
                      modeLabel: filter.pointsModeLabel,
                      onYearSelected: (year) {
                        ref.read(rankingPageFilterProvider.notifier).state =
                            RankingPageFilter(
                          mode: filter.mode,
                          year: year,
                          gender: filter.gender,
                        );
                      },
                    ),
                    SizedBox(height: 20),
                    if (visible.isEmpty)
```

por:

```dart
                    RankingYearFilterRow(
                      yearOptions: [null, ...yearOptions],
                      selectedYear: filter.year,
                      modeLabel: filter.pointsModeLabel,
                      onYearSelected: (year) {
                        ref.read(rankingPageFilterProvider.notifier).state =
                            RankingPageFilter(
                          mode: filter.mode,
                          year: year,
                          gender: filter.gender,
                          level: filter.level,
                        );
                      },
                    ),
                    SizedBox(height: 10),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: RankingLevelFilterDropdown(
                        selectedRank: filter.level,
                        onChanged: (rank) {
                          ref.read(rankingPageFilterProvider.notifier).state =
                              filter.copyWith(level: () => rank);
                        },
                      ),
                    ),
                    SizedBox(height: 20),
                    if (visible.isEmpty)
```

- [ ] **Step 6: Rodar o analyzer e a suíte de testes completa**

Run: `cd nexago_app && flutter analyze lib/features/ranking lib/core/profiles/app_user_profile.dart`
Expected: `No issues found!`

Run: `cd nexago_app && flutter test`
Expected: PASS em toda a suíte, exceto a falha pré-existente e não relacionada em `test/features/organizer/league_create_mapper_test.dart` (já presente antes desta feature, não tocada por ela).

- [ ] **Step 7: Verificação manual (checklist funcional)**

Use a skill `run` pra subir o app (ou `flutter run` direto). Você vai precisar de pelo menos um atleta com `sportOnboarding.primarySportId` e `levelsBySport` preenchidos (tela "Esportes e Níveis" do próprio atleta) que já tenha pontos no ranking geral. Na aba Ranking:

1. Confirme que o dropdown de nível aparece com "Todos os níveis" por padrão, entre o filtro de ano e a lista.
2. Selecione um nível específico (ex. "Open") e confirme que só atletas/duplas com aquele nível exato aparecem.
3. Confirme que um atleta sem esporte principal definido (ou sem nível registrado nele) some da lista quando um nível específico está selecionado, e volta a aparecer em "Todos os níveis".
4. Troque o ano (ou "Geral") com um nível específico selecionado e confirme que o filtro de nível não reseta.
5. Alterne entre "Duplas" e "Atletas" com um nível selecionado e confirme que a dupla mostrada respeita o nível do integrante mais forte.
6. Confirme que o subtítulo de cada atleta (nível + nº de torneios) continua aparecendo corretamente.

- [ ] **Step 8: Commit**

```bash
cd nexago_app
git add lib/features/ranking/domain/ranking_list_mapper.dart lib/features/ranking/domain/ranking_providers.dart lib/features/ranking/presentation/widgets/ranking_level_filter_dropdown.dart lib/features/ranking/presentation/athlete_ranking_page.dart
git commit -m "feat(ranking): add level filter dropdown to the general ranking screen"
```
