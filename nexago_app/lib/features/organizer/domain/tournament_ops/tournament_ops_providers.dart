import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/organizer_category_ops_repository.dart';
import '../../data/organizer_category_ops_service.dart';
import '../../data/organizer_contacts_service.dart';
import '../../data/organizer_tournament_ops_repository.dart';
import '../../data/organizer_user_profiles_repository.dart';
import '../../../tournaments/data/tournament_inscriptions_repository.dart';
import 'package:nexago_app/core/profiles/app_user_profile.dart';
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
  var viaApp = 0;
  var viaOrganizer = 0;
  final categoryId = (categoryMap['id'] as String?) ??
      (categoryMap['categoryName'] as String?) ??
      '';
  final entryFee = (categoryMap['entryFeeCents'] as num?)?.toInt() ??
      (((categoryMap['entryFee'] as num?)?.toDouble() ?? 0) * 100).round();

  for (final row in inscriptions) {
    final catId = (row.inscription['categoryId'] as String?)?.trim() ?? '';
    if (catId != categoryId) continue;
    if (row.inscription['waitlist'] == true) continue;
    if (row.inscription['isPaid'] == true) {
      paid++;
      final payment = confirmedInscriptionPayment(
        inscription: row.inscription,
        entryFeeCents: entryFee,
      );
      if (payment != null) {
        switch (payment.channel) {
          case OrganizerPaymentChannel.viaApp:
            viaApp += payment.cents;
          case OrganizerPaymentChannel.viaOrganizer:
            viaOrganizer += payment.cents;
        }
      }
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
    collectedCents: viaApp + viaOrganizer,
    viaAppCents: viaApp,
    viaOrganizerCents: viaOrganizer,
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
      var paymentsBreakdown = const OrganizerPaymentsBreakdown();
      for (final row in inscriptions) {
        if (row.inscription['waitlist'] == true) continue;
        if (row.inscription['isPaid'] == true) {
          paidTotal++;
        } else {
          pendingTotal++;
        }
      }
      for (final category in categories) {
        paymentsBreakdown = paymentsBreakdown +
            OrganizerPaymentsBreakdown(
              viaAppCents: category.viaAppCents,
              viaOrganizerCents: category.viaOrganizerCents,
            );
      }

      final summary = buildTournamentSummary(
        tournamentId: tid,
        data: tournament,
        categories: categories,
        paidCount: paidTotal,
        pendingCount: pendingTotal,
        paymentsBreakdown: paymentsBreakdown,
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
  String phoneNumber = '',
}) {
  if (profile == null) {
    return OrganizerCategoryPlayerInfo(uid: uid, phoneNumber: phoneNumber);
  }
  return OrganizerCategoryPlayerInfo(
    uid: uid,
    name: appUserDisplayName(profile),
    city: profile.city ?? '',
    state: profile.state ?? '',
    // Telefone vem da callable com ACL do torneio (o espelho público de
    // perfis não carrega PII); fallback no perfil cobre a transição.
    phoneNumber:
        phoneNumber.isNotEmpty ? phoneNumber : (profile.phoneNumber ?? ''),
    profilePhotoUrl: profile.profilePhotoUrl ?? '',
  );
}

Future<List<OrganizerCategoryTeamRow>> _mapInscriptionsToTeams({
  required List<OrganizerInscriptionWithTeam> rows,
  required OrganizerUserProfilesRepository profilesRepo,
  required CategoryOpsState ops,
  required int expectedPerTeamCents,
  Map<String, String> phoneByUid = const {},
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
    final paidAmount =
        inscriptionPaidAmountCents(row.inscription['paidAmount'] as num?);
    final registeredAtRaw = row.inscription['createdAt'];
    DateTime? registeredAt;
    if (registeredAtRaw is Timestamp) {
      registeredAt = registeredAtRaw.toDate();
    }

    teams.add(
      OrganizerCategoryTeamRow(
        registrationId: row.registrationId,
        teamId: teamId,
        player1: _playerFromProfile(
          profiles[p1Id],
          uid: p1Id,
          phoneNumber: phoneByUid[p1Id] ?? '',
        ),
        player2: _playerFromProfile(
          profiles[p2Id],
          uid: p2Id,
          phoneNumber: phoneByUid[p2Id] ?? '',
        ),
        status: registrationStatusFromInscription(row.inscription),
        paidAmountCents: paidAmount,
        expectedAmountCents: expectedPerTeamCents,
        registeredAt: registeredAt,
        paymentMethod: (row.inscription['paymentMethod'] as String?) ?? '',
        partnerPending: row.inscription['partnerPending'] == true,
        lgpdAcceptedUids: (row.inscription['lgpdAcceptedUids'] as List?)
                ?.whereType<String>()
                .toList() ??
            const [],
        cancellationRequestReason: _pendingCancellationReason(row.inscription),
        sharePaidUids: _uidList(row.inscription['sharePaidUids']),
        organizerConfirmedShareUids:
            _uidList(row.inscription['organizerConfirmedShareUids']),
        declaredPaidAt: switch (row.inscription['declaredPaidAt']) {
          final Timestamp ts => ts.toDate(),
          _ => null,
        },
        paymentVerifiedByOrganizer:
            row.inscription['paymentVerifiedByOrganizer'] == true,
      ),
    );
  }

  return applySeedOrder(teams, ops.seeds);
}

/// Lista de uids do doc, sem lixo (não-string, vazio) — os campos de parcela
/// (`sharePaidUids`, `organizerConfirmedShareUids`) chegam como `arrayUnion`.
List<String> _uidList(Object? raw) {
  if (raw is! List) return const [];
  return raw
      .whereType<String>()
      .map((uid) => uid.trim())
      .where((uid) => uid.isNotEmpty)
      .toList(growable: false);
}

/// Motivo do pedido de cancelamento PENDENTE, ou `null`. Doc antigo (sem o
/// campo), lixo e pedido já recusado contam como "sem pedido".
String? _pendingCancellationReason(Map<String, dynamic> inscription) {
  final raw = inscription['cancellationRequest'];
  if (raw is! Map) return null;
  if (raw['status'] != 'pending') return null;
  final reason = raw['reason'];
  return reason is String ? reason : '';
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
    final phoneByUid = await ref
        .read(organizerContactsServiceProvider)
        .phonesForTournament(key.tournamentId);
    return _mapInscriptionsToTeams(
      rows: rows,
      profilesRepo: profilesRepo,
      ops: ops,
      expectedPerTeamCents: entryFee,
      phoneByUid: phoneByUid,
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
      return buildPaymentsBreakdown(
        teams: rows,
        expectedPerTeamCents: expected,
      );
    },
    loading: () => const OrganizerPaymentsBreakdown(),
    error: (_, __) => const OrganizerPaymentsBreakdown(),
  );
});

class OrganizerCategoryFilterState {
  const OrganizerCategoryFilterState({
    this.filter = OrganizerCategoryTeamFilter.all,
    this.sort = OrganizerTeamSort.registrationOrder,
    this.searchQuery = '',
  });

  final OrganizerCategoryTeamFilter filter;
  final OrganizerTeamSort sort;
  final String searchQuery;

  OrganizerCategoryFilterState copyWith({
    OrganizerCategoryTeamFilter? filter,
    OrganizerTeamSort? sort,
    String? searchQuery,
  }) {
    return OrganizerCategoryFilterState(
      filter: filter ?? this.filter,
      sort: sort ?? this.sort,
      searchQuery: searchQuery ?? this.searchQuery,
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
