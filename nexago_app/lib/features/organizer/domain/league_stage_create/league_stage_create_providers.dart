import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/league_stage_create_local_store.dart';
import '../league_create/league_create_providers.dart';
import 'league_stage_create_draft.dart';
import 'league_stage_create_logic.dart';
import 'league_stage_create_session.dart';

final leagueStageCreateLocalStoreProvider =
    FutureProvider<LeagueStageCreateLocalStore>((ref) {
  return LeagueStageCreateLocalStore.create();
});

@immutable
class LeagueStageCreateWizardState {
  const LeagueStageCreateWizardState({
    this.draft = const LeagueStageCreateDraft(),
    this.currentStep = LeagueStageCreateStep.location,
    this.isLoading = false,
  });

  final LeagueStageCreateDraft draft;
  final LeagueStageCreateStep currentStep;
  final bool isLoading;

  LeagueStageCreateWizardState copyWith({
    LeagueStageCreateDraft? draft,
    LeagueStageCreateStep? currentStep,
    bool? isLoading,
  }) {
    return LeagueStageCreateWizardState(
      draft: draft ?? this.draft,
      currentStep: currentStep ?? this.currentStep,
      isLoading: isLoading ?? this.isLoading,
    );
  }
}

class LeagueStageCreateWizardNotifier
    extends Notifier<LeagueStageCreateWizardState> {
  static const _persistDebounce = Duration(milliseconds: 400);

  Timer? _persistTimer;
  LeagueStageCreateLocalStore? _localStore;

  @override
  LeagueStageCreateWizardState build() {
    ref.onDispose(() => _persistTimer?.cancel());
    return const LeagueStageCreateWizardState();
  }

  Future<LeagueStageCreateLocalStore?> _ensureLocalStore() async {
    if (_localStore != null) return _localStore;
    _localStore = await ref.read(leagueStageCreateLocalStoreProvider.future);
    return _localStore;
  }

  void _updateDraft(LeagueStageCreateDraft draft) {
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
    if (!hasMeaningfulLocalStageDraft(state.draft)) {
      await _clearLocalOnly();
      return;
    }

    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null || uid.isEmpty) return;

    final store = await _ensureLocalStore();
    if (store == null || !store.hasPersistence) return;

    final session = LeagueStageCreateSession(
      draft: state.draft,
      currentStep: state.currentStep,
      updatedAt: DateTime.now(),
      managerUid: uid,
    );
    await store.save(session);
  }

  Future<void> _clearLocalOnly() async {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    final leagueId = state.draft.leagueId;
    if (uid == null || uid.isEmpty || leagueId.isEmpty) return;
    final store = await _ensureLocalStore();
    if (store == null) return;
    await store.clear(uid, leagueId);
  }

  void setCurrentStep(LeagueStageCreateStep step) {
    if (state.currentStep == step) return;
    state = state.copyWith(currentStep: step);
    _schedulePersist();
  }

  Future<void> clearSession() async {
    _persistTimer?.cancel();
    state = const LeagueStageCreateWizardState();
    await _clearLocalOnly();
  }

  Future<void> tryRestoreAnyFromLocal() async {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null || uid.isEmpty) return;

    final store = await _ensureLocalStore();
    if (store == null) return;

    final leagueId = await store.findAnyLeagueIdWithDraft(uid);
    if (leagueId == null || leagueId.isEmpty) return;

    await tryRestoreFromLocal(leagueId);
  }

  Future<void> tryRestoreFromLocal(String leagueId) async {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null || uid.isEmpty) return;

    final store = await _ensureLocalStore();
    if (store == null) return;

    final session = await store.load(uid, leagueId);
    if (session == null) return;

    state = LeagueStageCreateWizardState(
      draft: session.draft,
      currentStep: session.currentStep,
    );
  }

  Future<void> loadLeagueContext(String leagueId) async {
    final id = leagueId.trim();
    if (id.isEmpty) {
      throw ArgumentError('ID da liga inválido.');
    }

    state = state.copyWith(isLoading: true);
    try {
      final context = await ref
          .read(organizerLeaguesRepositoryProvider)
          .getPublishedLeagueForStageAdd(id);

      final targetStage = resolveTargetStage(context.existingStages);
      final defaultName = defaultStageName(targetStage);

      state = LeagueStageCreateWizardState(
        draft: LeagueStageCreateDraft(
          leagueId: id,
          leagueName: context.leagueName,
          plannedStagesCount: context.plannedStagesCount,
          sport: context.sport,
          leagueCity: context.city,
          leagueState: context.state,
          defaultPriceCents: context.defaultPriceCents,
          rankingTableId: context.rankingTableId,
          bracketSystem: context.bracketSystem,
          paymentMode: context.paymentMode,
          stage: targetStage.copyWith(
            city: targetStage.city.isEmpty ? context.city : targetStage.city,
            state:
                targetStage.state.isEmpty ? context.state : targetStage.state,
            name: targetStage.name.trim().isEmpty
                ? defaultName
                : targetStage.name,
          ),
          categories: context.categories,
          existingStages: context.existingStages,
        ),
        currentStep: LeagueStageCreateStep.location,
      );
      _schedulePersist();
    } finally {
      state = state.copyWith(isLoading: false);
    }
  }

  void setStageName(String value) => _updateDraft(
        state.draft.copyWith(stage: state.draft.stage.copyWith(name: value)),
      );

  void setStageCity(String value) => _updateDraft(
        state.draft.copyWith(stage: state.draft.stage.copyWith(city: value)),
      );

  void setStageStateCode(String value) => _updateDraft(
        state.draft.copyWith(stage: state.draft.stage.copyWith(state: value)),
      );

  void setStageLocationName(String value) => _updateDraft(
        state.draft.copyWith(
          stage: state.draft.stage.copyWith(locationName: value),
        ),
      );

  void setStageStartAt(DateTime? value) => _updateDraft(
        state.draft.copyWith(stage: state.draft.stage.copyWith(startAt: value)),
      );

  void setStageEndAt(DateTime? value) => _updateDraft(
        state.draft.copyWith(stage: state.draft.stage.copyWith(endAt: value)),
      );

  void setCourtsCount(int value) {
    if (value < 1) return;
    _updateDraft(state.draft.copyWith(courtsCount: value));
  }

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
        locationAddress: address,
        stage: state.draft.stage.copyWith(
          locationName: locationName,
          city: city,
          state: stateCode,
        ),
      ),
    );
  }

  void setCategoryEnabled(String categoryId, bool enabled) {
    final next = state.draft.categories
        .map(
          (c) => c.categoryId == categoryId ? c.copyWith(enabled: enabled) : c,
        )
        .toList(growable: false);
    _updateDraft(state.draft.copyWith(categories: next));
  }

  void setCategorySpots(String categoryId, int spots) {
    if (spots < 4) return;
    final next = state.draft.categories
        .map((c) => c.categoryId == categoryId ? c.copyWith(spots: spots) : c)
        .toList(growable: false);
    _updateDraft(state.draft.copyWith(categories: next));
  }

  void setRegistrationOpensAt(DateTime? value) =>
      _updateDraft(state.draft.copyWith(registrationOpensAt: value));

  void setRegistrationClosesAt(DateTime? value) =>
      _updateDraft(state.draft.copyWith(registrationClosesAt: value));
}

final leagueStageCreateWizardProvider =
    NotifierProvider<LeagueStageCreateWizardNotifier, LeagueStageCreateWizardState>(
  LeagueStageCreateWizardNotifier.new,
);

final leagueStageCreateDraftProvider = Provider<LeagueStageCreateDraft>((ref) {
  return ref.watch(leagueStageCreateWizardProvider).draft;
});

final leagueStageCreateCurrentStepProvider = Provider<LeagueStageCreateStep>((ref) {
  return ref.watch(leagueStageCreateWizardProvider).currentStep;
});

final leagueStageCreateCanContinueProvider = Provider.autoDispose
    .family<bool, LeagueStageCreateStep>((ref, step) {
  final draft = ref.watch(leagueStageCreateDraftProvider);
  return canContinueFromStageStep(draft, step);
});

final hasMeaningfulLocalStageWizardSessionProvider = Provider<bool>((ref) {
  final draft = ref.watch(leagueStageCreateDraftProvider);
  return hasMeaningfulLocalStageDraft(draft);
});
