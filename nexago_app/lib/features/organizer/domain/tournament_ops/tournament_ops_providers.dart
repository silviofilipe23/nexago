import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/organizer_category_ops_repository.dart';
import '../../data/organizer_category_ops_service.dart';
import '../../data/organizer_tournament_ops_repository.dart';
import '../../data/organizer_user_profiles_repository.dart';
import '../../../tournaments/data/tournament_inscriptions_repository.dart';
import '../../../tournaments/domain/app_user_profile.dart';
import '../category_ops/category_ops_logic.dart';
import '../category_ops/category_ops_models.dart';
import 'tournament_ops_logic.dart';
import 'tournament_ops_models.dart';

export 'tournament_ops_models.dart';

final organizerTournamentOpsRepositoryProvider =
    Provider<OrganizerTournamentOpsRepository>((ref) {
  return OrganizerTournamentOpsRepository(
    FirebaseFirestore.instance,
    FirebaseAuth.instance,
  );
});

final organizerCategoryOpsRepositoryProvider =
    Provider<OrganizerCategoryOpsRepository>((ref) {
  return OrganizerCategoryOpsRepository(
    FirebaseFirestore.instance,
    FirebaseAuth.instance,
  );
});

final organizerUserProfilesRepositoryProvider =
    Provider<OrganizerUserProfilesRepository>((ref) {
  return OrganizerUserProfilesRepository(FirebaseFirestore.instance);
});

final organizerCategoryOpsServiceProvider =
    Provider<OrganizerCategoryOpsService>((ref) {
  return OrganizerCategoryOpsService(functions: FirebaseFunctions.instance);
});

@immutable
class OrganizerCategoryKey {
  const OrganizerCategoryKey({
    required this.tournamentId,
    required this.categoryId,
  });

  final String tournamentId;
  final String categoryId;

  @override
  bool operator ==(Object other) =>
      other is OrganizerCategoryKey &&
      tournamentId == other.tournamentId &&
      categoryId == other.categoryId;

  @override
  int get hashCode => Object.hash(tournamentId, categoryId);
}

@immutable
class OrganizerTournamentDetailState {
  const OrganizerTournamentDetailState({
    this.tournament,
    this.summary,
    this.categories = const [],
    this.isLoading = true,
    this.error,
  });

  final Map<String, dynamic>? tournament;
  final OrganizerTournamentSummary? summary;
  final List<OrganizerTournamentCategorySummary> categories;
  final bool isLoading;
  final Object? error;
}

OrganizerTournamentCategorySummary _categoryFromData({
  required Map<String, dynamic> categoryMap,
  required List<OrganizerInscriptionWithTeam> inscriptions,
  required Map<String, dynamic>? categoryOpsRaw,
}) {
  var paid = 0;
  var pending = 0;
  var collected = 0;
  final categoryId = (categoryMap['id'] as String?) ??
      (categoryMap['categoryName'] as String?) ??
      '';

  for (final row in inscriptions) {
    final catId = (row.inscription['categoryId'] as String?)?.trim() ?? '';
    if (catId != categoryId) continue;
    if (row.inscription['waitlist'] == true) continue;
    if (row.inscription['isPaid'] == true) {
      paid++;
      final paidAmount = (row.inscription['paidAmount'] as num?)?.toInt() ?? 0;
      collected += paidAmount;
    } else {
      pending++;
    }
  }

  CategoryBracketStatus bracketStatus = CategoryBracketStatus.none;
  if (categoryOpsRaw != null) {
    final raw = categoryOpsRaw[categoryId];
    if (raw is Map) {
      bracketStatus = categoryOpsFromMap(
        Map<String, dynamic>.from(raw),
      ).bracketStatus;
    }
  }

  return buildCategorySummary(
    categoryMap: categoryMap,
    paidCount: paid,
    pendingCount: pending,
    collectedCents: collected,
    bracketStatus: switch (bracketStatus) {
      CategoryBracketStatus.draft => OrganizerCategoryBracketStatus.draft,
      CategoryBracketStatus.published =>
        OrganizerCategoryBracketStatus.published,
      CategoryBracketStatus.none => OrganizerCategoryBracketStatus.none,
    },
  );
}

final organizerTournamentDetailProvider = StreamProvider.autoDispose
    .family<OrganizerTournamentDetailState, String>((ref, tournamentId) {
  final tid = tournamentId.trim();
  if (tid.isEmpty) {
    return Stream.value(const OrganizerTournamentDetailState(isLoading: false));
  }

  final repo = ref.watch(organizerTournamentOpsRepositoryProvider);
  final inscriptionsRepo = ref.watch(tournamentInscriptionsRepositoryProvider);

  return repo.watchTournament(tid).asyncExpand((tournament) {
    if (tournament == null) {
      return Stream.value(
        const OrganizerTournamentDetailState(
          isLoading: false,
          error: 'Torneio não encontrado',
        ),
      );
    }
    return inscriptionsRepo.watchByTournament(tid).map((inscriptions) {
      final categoriesRaw = tournament['categories'];
      final categoryOpsRaw = tournament['categoryOps'];
      final categories = <OrganizerTournamentCategorySummary>[];
      if (categoriesRaw is List) {
        for (final item in categoriesRaw) {
          if (item is! Map) continue;
          categories.add(
            _categoryFromData(
              categoryMap: Map<String, dynamic>.from(item),
              inscriptions: inscriptions,
              categoryOpsRaw: categoryOpsRaw is Map
                  ? Map<String, dynamic>.from(categoryOpsRaw)
                  : null,
            ),
          );
        }
      }

      var paidTotal = 0;
      var pendingTotal = 0;
      var collectedTotal = 0;
      for (final row in inscriptions) {
        if (row.inscription['waitlist'] == true) continue;
        if (row.inscription['isPaid'] == true) {
          paidTotal++;
          collectedTotal +=
              (row.inscription['paidAmount'] as num?)?.toInt() ?? 0;
        } else {
          pendingTotal++;
        }
      }

      final summary = buildTournamentSummary(
        tournamentId: tid,
        data: tournament,
        categories: categories,
        paidCount: paidTotal,
        pendingCount: pendingTotal,
        collectedCents: collectedTotal,
      );

      return OrganizerTournamentDetailState(
        tournament: tournament,
        summary: summary,
        categories: categories,
        isLoading: false,
      );
    });
  });
});

OrganizerCategoryPlayerInfo _playerFromProfile(
  AppUserProfile? profile, {
  required String uid,
}) {
  if (profile == null) {
    return OrganizerCategoryPlayerInfo(uid: uid);
  }
  return OrganizerCategoryPlayerInfo(
    uid: uid,
    name: appUserDisplayName(profile),
    city: profile.city ?? '',
    state: profile.state ?? '',
    phoneNumber: profile.phoneNumber ?? '',
    profilePhotoUrl: profile.profilePhotoUrl ?? '',
  );
}

Future<List<OrganizerCategoryTeamRow>> _mapInscriptionsToTeams({
  required List<OrganizerInscriptionWithTeam> rows,
  required OrganizerUserProfilesRepository profilesRepo,
  required CategoryOpsState ops,
  required int expectedPerTeamCents,
}) async {
  final uids = <String>{};
  for (final row in rows) {
    final team = row.team;
    if (team == null) continue;
    final p1 = (team['player1Id'] as String?)?.trim();
    final p2 = (team['player2Id'] as String?)?.trim();
    if (p1 != null && p1.isNotEmpty) uids.add(p1);
    if (p2 != null && p2.isNotEmpty) uids.add(p2);
  }
  final profiles = await profilesRepo.batchGetProfiles(uids);

  final teams = <OrganizerCategoryTeamRow>[];
  for (final row in rows) {
    final team = row.team;
    if (team == null) continue;
    final p1Id = (team['player1Id'] as String?)?.trim() ?? '';
    final p2Id = (team['player2Id'] as String?)?.trim() ?? '';
    final teamId = (row.inscription['teamId'] as String?)?.trim() ?? '';
    final paidAmount = (row.inscription['paidAmount'] as num?)?.toInt() ?? 0;
    final registeredAtRaw = row.inscription['createdAt'];
    DateTime? registeredAt;
    if (registeredAtRaw is Timestamp) {
      registeredAt = registeredAtRaw.toDate();
    }

    teams.add(
      OrganizerCategoryTeamRow(
        registrationId: row.registrationId,
        teamId: teamId,
        player1: _playerFromProfile(profiles[p1Id], uid: p1Id),
        player2: _playerFromProfile(profiles[p2Id], uid: p2Id),
        status: registrationStatusFromInscription(row.inscription),
        paidAmountCents: paidAmount,
        expectedAmountCents: expectedPerTeamCents,
        registeredAt: registeredAt,
        paymentMethod: (row.inscription['paymentMethod'] as String?) ?? '',
        partnerPending: row.inscription['partnerPending'] == true,
      ),
    );
  }

  return applySeedOrder(teams, ops.seeds);
}

final organizerCategoryRegistrationsProvider = StreamProvider.autoDispose
    .family<List<OrganizerCategoryTeamRow>, OrganizerCategoryKey>((ref, key) {
  final inscriptionsRepo = ref.watch(tournamentInscriptionsRepositoryProvider);
  final profilesRepo = ref.watch(organizerUserProfilesRepositoryProvider);
  final opsRepo = ref.watch(organizerCategoryOpsRepositoryProvider);
  final categoryRepo = ref.watch(organizerCategoryOpsRepositoryProvider);

  return inscriptionsRepo
      .watchByTournamentAndCategory(
        tournamentId: key.tournamentId,
        categoryId: key.categoryId,
      )
      .asyncMap((rows) async {
    final category = await categoryRepo.getCategory(
      tournamentId: key.tournamentId,
      categoryId: key.categoryId,
    );
    final entryFee = (category?['entryFeeCents'] as num?)?.toInt() ??
        (((category?['entryFee'] as num?)?.toDouble() ?? 0) * 100).round();
    final ops = await opsRepo.getCategoryOps(
      tournamentId: key.tournamentId,
      categoryId: key.categoryId,
    );
    return _mapInscriptionsToTeams(
      rows: rows,
      profilesRepo: profilesRepo,
      ops: ops,
      expectedPerTeamCents: entryFee,
    );
  });
});

final organizerCategoryOpsProvider = StreamProvider.autoDispose
    .family<CategoryOpsState, OrganizerCategoryKey>((ref, key) {
  return ref
      .watch(organizerCategoryOpsRepositoryProvider)
      .watchCategoryOps(
        tournamentId: key.tournamentId,
        categoryId: key.categoryId,
      );
});

final organizerCategoryPaymentsProvider = Provider.autoDispose
    .family<OrganizerCategoryPaymentsSummary, OrganizerCategoryKey>((ref, key) {
  final teams = ref.watch(organizerCategoryVisibleTeamsProvider(key));
  return teams.when(
    data: (rows) {
      final expected = rows.isNotEmpty ? rows.first.expectedAmountCents : 0;
      return buildPaymentsSummary(
        teams: rows,
        expectedPerTeamCents: expected,
      );
    },
    loading: () => const OrganizerCategoryPaymentsSummary(),
    error: (_, __) => const OrganizerCategoryPaymentsSummary(),
  );
});

class OrganizerCategoryFilterState {
  const OrganizerCategoryFilterState({
    this.filter = OrganizerCategoryTeamFilter.all,
    this.sort = OrganizerTeamSort.registrationOrder,
    this.searchQuery = '',
    this.tab = OrganizerCategoryShellTab.teams,
  });

  final OrganizerCategoryTeamFilter filter;
  final OrganizerTeamSort sort;
  final String searchQuery;
  final OrganizerCategoryShellTab tab;

  OrganizerCategoryFilterState copyWith({
    OrganizerCategoryTeamFilter? filter,
    OrganizerTeamSort? sort,
    String? searchQuery,
    OrganizerCategoryShellTab? tab,
  }) {
    return OrganizerCategoryFilterState(
      filter: filter ?? this.filter,
      sort: sort ?? this.sort,
      searchQuery: searchQuery ?? this.searchQuery,
      tab: tab ?? this.tab,
    );
  }
}

class OrganizerCategoryFilterNotifier
    extends AutoDisposeNotifier<OrganizerCategoryFilterState> {
  @override
  OrganizerCategoryFilterState build() =>
      const OrganizerCategoryFilterState();

  void setFilter(OrganizerCategoryTeamFilter filter) {
    state = state.copyWith(filter: filter);
  }

  void setSort(OrganizerTeamSort sort) {
    state = state.copyWith(sort: sort);
  }

  void setSearch(String query) {
    state = state.copyWith(searchQuery: query);
  }

  void setTab(OrganizerCategoryShellTab tab) {
    state = state.copyWith(tab: tab);
  }
}

final organizerCategoryFilterProvider =
    NotifierProvider.autoDispose<OrganizerCategoryFilterNotifier,
        OrganizerCategoryFilterState>(OrganizerCategoryFilterNotifier.new);

final organizerCategoryVisibleTeamsProvider = Provider.autoDispose
    .family<AsyncValue<List<OrganizerCategoryTeamRow>>, OrganizerCategoryKey>(
        (ref, key) {
  final teams = ref.watch(organizerCategoryRegistrationsProvider(key));
  final ops = ref.watch(organizerCategoryOpsProvider(key));
  return teams.when(
    data: (rows) {
      final visible = visibleCategoryTeams(
        teams: rows,
        ops: ops.valueOrNull,
      );
      return AsyncData(visible);
    },
    loading: () => const AsyncLoading(),
    error: (e, st) => AsyncError(e, st),
  );
});

final organizerCategoryFilteredTeamsProvider = Provider.autoDispose
    .family<List<OrganizerCategoryTeamRow>, OrganizerCategoryKey>((ref, key) {
  final teams = ref.watch(organizerCategoryVisibleTeamsProvider(key));
  final filterState = ref.watch(organizerCategoryFilterProvider);
  return teams.when(
    data: (rows) => sortCategoryTeams(
      filterCategoryTeams(rows, filterState.filter, filterState.searchQuery),
      filterState.sort,
    ),
    loading: () => const [],
    error: (_, __) => const [],
  );
});

final organizerTournamentDetailTabProvider =
    NotifierProvider.autoDispose<_TournamentDetailTabNotifier,
        OrganizerTournamentDetailTab>(_TournamentDetailTabNotifier.new);

class _TournamentDetailTabNotifier
    extends AutoDisposeNotifier<OrganizerTournamentDetailTab> {
  @override
  OrganizerTournamentDetailTab build() => OrganizerTournamentDetailTab.categories;

  void select(OrganizerTournamentDetailTab tab) => state = tab;
}
