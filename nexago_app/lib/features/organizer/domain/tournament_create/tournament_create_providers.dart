import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/organizer_tournaments_repository.dart';
import '../../data/tournament_create_local_store.dart';
import '../../data/tournament_create_mapper.dart';
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
    this.isEditingPublished = false,
  });

  final TournamentCreateDraft draft;
  final TournamentCreateStep currentStep;
  final bool isEditingPublished;

  TournamentCreateWizardState copyWith({
    TournamentCreateDraft? draft,
    TournamentCreateStep? currentStep,
    bool? isEditingPublished,
  }) {
    return TournamentCreateWizardState(
      draft: draft ?? this.draft,
      currentStep: currentStep ?? this.currentStep,
      isEditingPublished: isEditingPublished ?? this.isEditingPublished,
    );
  }
}

class TournamentCreateWizardNotifier extends Notifier<TournamentCreateWizardState> {
  static const _persistDebounce = Duration(milliseconds: 400);

  Timer? _persistTimer;
  TournamentCreateLocalStore? _localStore;
  int _persistGeneration = 0;

  @override
  TournamentCreateWizardState build() {
    ref.onDispose(() => _persistTimer?.cancel());
    return const TournamentCreateWizardState();
  }

  Future<TournamentCreateLocalStore?> _ensureLocalStore() async {
    if (_localStore != null && _localStore!.hasPersistence) return _localStore;
    _localStore = await TournamentCreateLocalStore.create();
    return _localStore;
  }

  void _updateDraft(TournamentCreateDraft draft) {
    state = state.copyWith(draft: draft);
    _schedulePersist();
  }

  void _schedulePersist() {
    _persistTimer?.cancel();
    final generation = _persistGeneration;
    _persistTimer = Timer(_persistDebounce, () {
      unawaited(_persistSession(generation));
    });
  }

  Future<void> _persistSession(int generation) async {
    if (generation != _persistGeneration) return;

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
      isEditingPublished: state.isEditingPublished,
    );
    if (generation != _persistGeneration) return;
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

  Future<void> clearSession({
    bool deleteRemoteDraft = true,
    String? remoteDraftId,
  }) async {
    _persistTimer?.cancel();
    _persistGeneration++;
    final tournamentId =
        (remoteDraftId ?? state.draft.tournamentId)?.trim();

    await _clearLocalOnly();
    state = const TournamentCreateWizardState();

    if (deleteRemoteDraft &&
        tournamentId != null &&
        tournamentId.isNotEmpty) {
      await ref
          .read(organizerTournamentsRepositoryProvider)
          .deleteDraftTournament(tournamentId);
    }
  }

  /// Descarta sessão local imediatamente; limpa Firestore só se existir rascunho salvo.
  Future<void> discardSession({String? remoteDraftId}) async {
    final draft = state.draft;
    final explicit = (remoteDraftId ?? draft.tournamentId)?.trim();
    final nameLower = draft.name.trim().toLowerCase();

    _persistTimer?.cancel();
    _persistGeneration++;
    await _clearLocalOnly();
    state = const TournamentCreateWizardState();

    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null || uid.isEmpty) return;

    try {
      final repo = ref.read(organizerTournamentsRepositoryProvider);
      final ids = <String>{};
      if (explicit != null && explicit.isNotEmpty) ids.add(explicit);

      final tournaments = await repo.fetchManagedTournamentsFromServer(uid);
      if (nameLower.isNotEmpty) {
        for (final tournament in tournaments) {
          if (!isFirestoreDraftData(tournament)) continue;
          final id = (tournament['id'] as String?)?.trim();
          if (id == null || id.isEmpty) continue;
          if (((tournament['name'] as String?) ?? '').trim().toLowerCase() ==
              nameLower) {
            ids.add(id);
          }
        }
      }

      for (final id in ids) {
        await repo.deleteDraftTournament(id);
      }
    } catch (_) {
      // Rascunho só no aparelho (sem doc em tournaments): descarte local já feito.
    }
  }

  Future<void> tryRestoreFromLocal() async {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null || uid.isEmpty) return;

    final store = await _ensureLocalStore();
    if (store == null) return;

    await store.reload();
    final session = await store.load(uid);
    if (session == null) return;

    state = TournamentCreateWizardState(
      draft: session.draft,
      currentStep: session.currentStep,
      isEditingPublished: session.isEditingPublished,
    );
  }

  void restoreSession(TournamentCreateSession session) {
    state = TournamentCreateWizardState(
      draft: session.draft,
      currentStep: session.currentStep,
      isEditingPublished: session.isEditingPublished,
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
      isEditingPublished: false,
    );
    _schedulePersist();
  }

  /// Hidrata o wizard a partir de um documento Firestore (rascunho ou publicado).
  Future<void> loadTournamentFromFirestore(
    Map<String, dynamic> data,
    String tournamentId, {
    required TournamentCreateStep step,
  }) async {
    final id = tournamentId.trim();
    if (id.isEmpty) {
      throw ArgumentError('ID do torneio inválido.');
    }

    final parsed = TournamentCreateMapper.fromFirestore(
      Map<String, dynamic>.from(data),
      id,
    );

    await _clearLocalOnly();
    state = TournamentCreateWizardState(
      draft: parsed.draft,
      currentStep: step,
      isEditingPublished: !isFirestoreDraftData(data),
    );
    _schedulePersist();
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
      _updateDraft(
        state.draft.copyWith(
          coverImagePath: path,
          clearCoverImageUrl: true,
        ),
      );
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

  void setOrganizerPixKey(String value) =>
      _updateDraft(state.draft.copyWith(organizerPixKey: value));

  void setOrganizerPixKeyType(String value) =>
      _updateDraft(state.draft.copyWith(organizerPixKeyType: value));

  void setOrganizerPixRecipientName(String value) =>
      _updateDraft(state.draft.copyWith(organizerPixRecipientName: value));

  void setOrganizerPixCity(String value) =>
      _updateDraft(state.draft.copyWith(organizerPixCity: value));

  void setWaitlistEnabled(bool value) =>
      _updateDraft(state.draft.copyWith(waitlistEnabled: value));

  void setInviteConfirmEnabled(bool value) =>
      _updateDraft(state.draft.copyWith(inviteConfirmEnabled: value));

  void setCashPrizesEnabled(bool value) {
    _updateDraft(state.draft.copyWith(cashPrizesEnabled: value));
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

final tournamentCreateIsEditingPublishedProvider = Provider<bool>((ref) {
  return ref.watch(tournamentCreateWizardProvider).isEditingPublished;
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
