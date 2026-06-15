import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/organizer_tournaments_repository.dart';
import '../../data/tournament_create_local_store.dart';
import 'tournament_create_draft.dart';
import 'tournament_create_logic.dart';
import 'tournament_create_session.dart';

final organizerTournamentsRepositoryProvider =
    Provider<OrganizerTournamentsRepository>((ref) {
  return OrganizerTournamentsRepository(
    FirebaseFirestore.instance,
    FirebaseAuth.instance,
  );
});

final tournamentCreateLocalStoreProvider =
    FutureProvider<TournamentCreateLocalStore>((ref) {
  return TournamentCreateLocalStore.create();
});

final managedOrganizerTournamentsProvider =
    StreamProvider.autoDispose<List<Map<String, dynamic>>>((ref) {
  final uid = FirebaseAuth.instance.currentUser?.uid;
  if (uid == null || uid.isEmpty) return Stream.value(const []);
  return ref
      .watch(organizerTournamentsRepositoryProvider)
      .watchManagedTournaments(uid);
});

@immutable
class TournamentCreateWizardState {
  const TournamentCreateWizardState({
    this.draft = const TournamentCreateDraft(),
    this.currentStep = TournamentCreateStep.identity,
  });

  final TournamentCreateDraft draft;
  final TournamentCreateStep currentStep;

  TournamentCreateWizardState copyWith({
    TournamentCreateDraft? draft,
    TournamentCreateStep? currentStep,
  }) {
    return TournamentCreateWizardState(
      draft: draft ?? this.draft,
      currentStep: currentStep ?? this.currentStep,
    );
  }
}

class TournamentCreateWizardNotifier extends Notifier<TournamentCreateWizardState> {
  static const _persistDebounce = Duration(milliseconds: 400);

  Timer? _persistTimer;
  TournamentCreateLocalStore? _localStore;

  @override
  TournamentCreateWizardState build() {
    ref.onDispose(() => _persistTimer?.cancel());
    return const TournamentCreateWizardState();
  }

  Future<TournamentCreateLocalStore?> _ensureLocalStore() async {
    if (_localStore != null) return _localStore;
    _localStore = await ref.read(tournamentCreateLocalStoreProvider.future);
    return _localStore;
  }

  void _updateDraft(TournamentCreateDraft draft) {
    state = state.copyWith(draft: draft);
    _schedulePersist();
  }

  void _schedulePersist() {
    _persistTimer?.cancel();
    _persistTimer = Timer(_persistDebounce, () {
      unawaited(_persistSession());
    });
  }

  Future<void> _persistSession() async {
    if (!hasMeaningfulLocalDraft(state.draft)) {
      await _clearLocalOnly();
      return;
    }

    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null || uid.isEmpty) return;

    final store = await _ensureLocalStore();
    if (store == null || !store.hasPersistence) return;

    final session = TournamentCreateSession(
      draft: state.draft,
      currentStep: state.currentStep,
      updatedAt: DateTime.now(),
      managerUid: uid,
    );
    await store.save(session);
  }

  Future<void> _clearLocalOnly() async {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null || uid.isEmpty) return;
    final store = await _ensureLocalStore();
    if (store == null) return;
    await store.clear(uid);
  }

  void setCurrentStep(TournamentCreateStep step) {
    if (state.currentStep == step) return;
    state = state.copyWith(currentStep: step);
    _schedulePersist();
  }

  void reset() {
    state = const TournamentCreateWizardState();
    _schedulePersist();
  }

  Future<void> clearSession() async {
    _persistTimer?.cancel();
    state = const TournamentCreateWizardState();
    await _clearLocalOnly();
  }

  Future<void> tryRestoreFromLocal() async {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null || uid.isEmpty) return;

    final store = await _ensureLocalStore();
    if (store == null) return;

    final session = await store.load(uid);
    if (session == null) return;

    state = TournamentCreateWizardState(
      draft: session.draft,
      currentStep: session.currentStep,
    );
  }

  void restoreSession(TournamentCreateSession session) {
    state = TournamentCreateWizardState(
      draft: session.draft,
      currentStep: session.currentStep,
    );
    _schedulePersist();
  }

  Future<void> loadFirestoreDraft(String tournamentId) async {
    final id = tournamentId.trim();
    if (id.isEmpty) {
      throw ArgumentError('ID do torneio inválido.');
    }

    final loaded = await ref
        .read(organizerTournamentsRepositoryProvider)
        .getTournamentDraft(id);
    if (loaded == null) {
      throw StateError('Rascunho não encontrado.');
    }

    await _clearLocalOnly();
    state = TournamentCreateWizardState(
      draft: loaded.draft,
      currentStep: loaded.step,
    );
  }

  void setTournamentId(String? id) {
    if (id == null || id.isEmpty) {
      _updateDraft(state.draft.copyWith(clearTournamentId: true));
    } else {
      _updateDraft(state.draft.copyWith(tournamentId: id));
    }
  }

  void setSport(TournamentSport sport) => _updateDraft(state.draft.copyWith(sport: sport));

  void setName(String value) => _updateDraft(state.draft.copyWith(name: value));

  void setCoverImagePath(String? path) {
    if (path == null || path.isEmpty) {
      _updateDraft(state.draft.copyWith(clearCoverImagePath: true));
    } else {
      _updateDraft(state.draft.copyWith(coverImagePath: path));
    }
  }

  void setDescription(String value) =>
      _updateDraft(state.draft.copyWith(description: value));

  void setArena({
    required String? arenaId,
    required String locationName,
    required String address,
    required String city,
    required String stateCode,
  }) {
    _updateDraft(
      state.draft.copyWith(
        arenaId: arenaId,
        clearArenaId: arenaId == null,
        locationName: locationName,
        locationAddress: address,
        city: city,
        state: stateCode,
      ),
    );
  }

  void setLocationManual({
    required String locationName,
    required String address,
    required String city,
    required String stateCode,
  }) {
    _updateDraft(
      state.draft.copyWith(
        clearArenaId: true,
        locationName: locationName,
        locationAddress: address,
        city: city,
        state: stateCode,
      ),
    );
  }

  void setStartAt(DateTime? value) =>
      _updateDraft(state.draft.copyWith(startAt: value));

  void setEndAt(DateTime? value) => _updateDraft(state.draft.copyWith(endAt: value));

  void setFirstMatchAt(DateTime? value) =>
      _updateDraft(state.draft.copyWith(firstMatchAt: value));

  void setCourtsCount(int value) {
    if (value < 1) return;
    _updateDraft(state.draft.copyWith(courtsCount: value));
  }

  void setDefaultPriceCents(int cents) {
    if (cents < 0) return;
    _updateDraft(state.draft.copyWith(defaultPriceCents: cents));
    syncCategoryDefaultPrices();
  }

  void syncCategoryDefaultPrices() {
    final next = state.draft.categories
        .map(
          (c) => c.useDefaultPrice
              ? c.copyWith(priceCents: state.draft.defaultPriceCents)
              : c,
        )
        .toList(growable: false);
    _updateDraft(state.draft.copyWith(categories: next));
  }

  void addCategory(TournamentCategoryDraft category) {
    _updateDraft(
      state.draft.copyWith(categories: [...state.draft.categories, category]),
    );
  }

  void updateCategory(TournamentCategoryDraft category) {
    final next = state.draft.categories
        .map((c) => c.id == category.id ? category : c)
        .toList(growable: false);
    _updateDraft(state.draft.copyWith(categories: next));
  }

  void removeCategory(String categoryId) {
    _updateDraft(
      state.draft.copyWith(
        categories:
            state.draft.categories.where((c) => c.id != categoryId).toList(),
      ),
    );
  }

  void setRegistrationOpensAt(DateTime? value) =>
      _updateDraft(state.draft.copyWith(registrationOpensAt: value));

  void setRegistrationClosesAt(DateTime? value) =>
      _updateDraft(state.draft.copyWith(registrationClosesAt: value));

  void setPaymentMode(TournamentPaymentMode value) =>
      _updateDraft(state.draft.copyWith(paymentMode: value));

  void setWaitlistEnabled(bool value) =>
      _updateDraft(state.draft.copyWith(waitlistEnabled: value));

  void setInviteConfirmEnabled(bool value) =>
      _updateDraft(state.draft.copyWith(inviteConfirmEnabled: value));

  void setCashPrizesEnabled(bool value) {
    _updateDraft(state.draft.copyWith(cashPrizesEnabled: value));
    if (value) {
      ensureDefaultPrizesForAllCategories();
    }
  }

  void ensureDefaultPrizesForAllCategories() {
    final next = state.draft.categories.map((category) {
      if (category.prizes.isNotEmpty) return category;
      final total = categoryPrizeTotalCents(category) > 0
          ? categoryPrizeTotalCents(category)
          : category.spots * category.priceCents ~/ 4;
      return category.copyWith(
        prizes: defaultCategoryPrizes(total > 0 ? total : 800000),
      );
    }).toList(growable: false);
    _updateDraft(state.draft.copyWith(categories: next));
  }

  void updateCategoryPrizes(
    String categoryId,
    List<TournamentCategoryPrizeDraft> prizes, {
    bool applyToAll = false,
  }) {
    if (applyToAll) {
      final next = state.draft.categories
          .map((c) => c.copyWith(prizes: prizes))
          .toList(growable: false);
      _updateDraft(state.draft.copyWith(categories: next));
      return;
    }
    final next = state.draft.categories
        .map(
          (c) => c.id == categoryId ? c.copyWith(prizes: prizes) : c,
        )
        .toList(growable: false);
    _updateDraft(state.draft.copyWith(categories: next));
  }

  void setRegulationPdfPath(String? path) {
    if (path == null || path.isEmpty) {
      _updateDraft(state.draft.copyWith(clearRegulationPdfPath: true));
    } else {
      _updateDraft(state.draft.copyWith(regulationPdfPath: path));
    }
  }

  void setRegulationNotes(String value) =>
      _updateDraft(state.draft.copyWith(regulationNotes: value));

  void setUniformRequired(bool value) => _updateDraft(
        state.draft.copyWith(
          uniformRequired: value,
          uniformNumberOnShirt: value ? state.draft.uniformNumberOnShirt : false,
          uniformNameOnShirt: value ? state.draft.uniformNameOnShirt : false,
        ),
      );

  void setUniformNumberOnShirt(bool value) =>
      _updateDraft(state.draft.copyWith(uniformNumberOnShirt: value));

  void setUniformNameOnShirt(bool value) =>
      _updateDraft(state.draft.copyWith(uniformNameOnShirt: value));

  void setRankingEnabled(bool value) =>
      _updateDraft(state.draft.copyWith(rankingEnabled: value));

  void setRankingTableId(String value) =>
      _updateDraft(state.draft.copyWith(rankingTableId: value));

  void setVisibility(TournamentVisibility value) =>
      _updateDraft(state.draft.copyWith(visibility: value));
}

final tournamentCreateWizardProvider =
    NotifierProvider<TournamentCreateWizardNotifier, TournamentCreateWizardState>(
  TournamentCreateWizardNotifier.new,
);

final tournamentCreateDraftProvider = Provider<TournamentCreateDraft>((ref) {
  return ref.watch(tournamentCreateWizardProvider).draft;
});

final tournamentCreateCurrentStepProvider = Provider<TournamentCreateStep>((ref) {
  return ref.watch(tournamentCreateWizardProvider).currentStep;
});

final hasMeaningfulLocalWizardSessionProvider = Provider<bool>((ref) {
  final draft = ref.watch(tournamentCreateDraftProvider);
  return hasMeaningfulLocalDraft(draft);
});

final tournamentCreateCanContinueProvider = Provider.autoDispose
    .family<bool, TournamentCreateStep>((ref, step) {
  final draft = ref.watch(tournamentCreateDraftProvider);
  return canContinueFromStep(draft, step);
});
