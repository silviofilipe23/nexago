import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/league_create_local_store.dart';
import '../../data/organizer_leagues_repository.dart';
import '../tournament_create/tournament_create_draft.dart';
import 'league_create_draft.dart';
import 'league_create_logic.dart';
import 'league_create_session.dart';

final organizerLeaguesRepositoryProvider =
    Provider<OrganizerLeaguesRepository>((ref) {
  return OrganizerLeaguesRepository(
    FirebaseFirestore.instance,
    FirebaseAuth.instance,
  );
});

final managedOrganizerLeaguesProvider =
    StreamProvider.autoDispose<List<Map<String, dynamic>>>((ref) {
  final uid = FirebaseAuth.instance.currentUser?.uid;
  if (uid == null || uid.isEmpty) return Stream.value(const []);
  return ref
      .watch(organizerLeaguesRepositoryProvider)
      .watchManagedLeagues(uid);
});

final leagueCreateLocalStoreProvider =
    FutureProvider<LeagueCreateLocalStore>((ref) {
  return LeagueCreateLocalStore.create();
});

@immutable
class LeagueCreateWizardState {
  const LeagueCreateWizardState({
    this.draft = const LeagueCreateDraft(),
    this.currentStep = LeagueCreateStep.identity,
  });

  final LeagueCreateDraft draft;
  final LeagueCreateStep currentStep;

  LeagueCreateWizardState copyWith({
    LeagueCreateDraft? draft,
    LeagueCreateStep? currentStep,
  }) {
    return LeagueCreateWizardState(
      draft: draft ?? this.draft,
      currentStep: currentStep ?? this.currentStep,
    );
  }
}

class LeagueCreateWizardNotifier extends Notifier<LeagueCreateWizardState> {
  static const _persistDebounce = Duration(milliseconds: 400);

  Timer? _persistTimer;
  LeagueCreateLocalStore? _localStore;
  int _persistGeneration = 0;

  @override
  LeagueCreateWizardState build() {
    ref.onDispose(() => _persistTimer?.cancel());
    return const LeagueCreateWizardState();
  }

  Future<LeagueCreateLocalStore?> _ensureLocalStore() async {
    if (_localStore != null && _localStore!.hasPersistence) return _localStore;
    _localStore = await LeagueCreateLocalStore.create();
    return _localStore;
  }

  void _updateDraft(LeagueCreateDraft draft) {
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

    if (!hasMeaningfulLocalLeagueDraft(state.draft)) {
      await _clearLocalOnly();
      return;
    }

    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null || uid.isEmpty) return;

    final store = await _ensureLocalStore();
    if (store == null || !store.hasPersistence) return;

    final session = LeagueCreateSession(
      draft: state.draft,
      currentStep: state.currentStep,
      updatedAt: DateTime.now(),
      managerUid: uid,
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

  void setCurrentStep(LeagueCreateStep step) {
    if (state.currentStep == step) return;
    state = state.copyWith(currentStep: step);
    _schedulePersist();
  }

  void reset() {
    state = const LeagueCreateWizardState();
    _schedulePersist();
  }

  Future<void> clearSession({
    bool deleteRemoteDraft = true,
    String? remoteDraftId,
  }) async {
    _persistTimer?.cancel();
    _persistGeneration++;
    final leagueId = (remoteDraftId ?? state.draft.leagueId)?.trim();

    await _clearLocalOnly();
    state = const LeagueCreateWizardState();

    if (deleteRemoteDraft && leagueId != null && leagueId.isNotEmpty) {
      await ref
          .read(organizerLeaguesRepositoryProvider)
          .deleteDraftLeague(leagueId);
    }
  }

  /// Descarta sessão local imediatamente; limpa Firestore só se existir rascunho salvo.
  Future<void> discardSession({String? remoteDraftId}) async {
    final draft = state.draft;
    final explicit = (remoteDraftId ?? draft.leagueId)?.trim();
    final nameLower = draft.name.trim().toLowerCase();

    _persistTimer?.cancel();
    _persistGeneration++;
    await _clearLocalOnly();
    state = const LeagueCreateWizardState();

    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null || uid.isEmpty) return;

    try {
      final repo = ref.read(organizerLeaguesRepositoryProvider);
      final ids = <String>{};
      if (explicit != null && explicit.isNotEmpty) ids.add(explicit);

      final leagues = await repo.fetchManagedLeaguesFromServer(uid);
      if (nameLower.isNotEmpty) {
        for (final league in leagues) {
          if (!isFirestoreLeagueDraftData(league)) continue;
          final id = (league['id'] as String?)?.trim();
          if (id == null || id.isEmpty) continue;
          if (((league['name'] as String?) ?? '').trim().toLowerCase() ==
              nameLower) {
            ids.add(id);
          }
        }
      }

      for (final id in ids) {
        await repo.deleteDraftLeague(id);
      }
    } catch (_) {
      // Rascunho só no aparelho (sem doc em leagues): descarte local já feito.
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

    state = LeagueCreateWizardState(
      draft: session.draft,
      currentStep: session.currentStep,
    );
  }

  void restoreSession(LeagueCreateSession session) {
    state = LeagueCreateWizardState(
      draft: session.draft,
      currentStep: session.currentStep,
    );
    _schedulePersist();
  }

  Future<void> loadFirestoreDraft(String leagueId) async {
    final id = leagueId.trim();
    if (id.isEmpty) {
      throw ArgumentError('ID da liga inválido.');
    }

    final loaded = await ref
        .read(organizerLeaguesRepositoryProvider)
        .getLeagueDraft(id);
    if (loaded == null) {
      throw StateError('Rascunho não encontrado.');
    }

    await _clearLocalOnly();
    state = LeagueCreateWizardState(
      draft: loaded.draft,
      currentStep: loaded.step,
    );
    _schedulePersist();
  }

  void setLeagueId(String? id) {
    if (id == null || id.isEmpty) {
      _updateDraft(state.draft.copyWith(clearLeagueId: true));
    } else {
      _updateDraft(state.draft.copyWith(leagueId: id));
    }
  }

  void setSport(TournamentSport sport) =>
      _updateDraft(state.draft.copyWith(sport: sport));

  void setName(String value) => _updateDraft(state.draft.copyWith(name: value));

  void setOrganizationName(String value) =>
      _updateDraft(state.draft.copyWith(organizationName: value));

  void setCoverImagePath(String? path) {
    if (path == null || path.isEmpty) {
      _updateDraft(state.draft.copyWith(clearCoverImagePath: true));
    } else {
      _updateDraft(state.draft.copyWith(coverImagePath: path));
    }
  }

  void setDescription(String value) =>
      _updateDraft(state.draft.copyWith(description: value));

  void setCity(String value) => _updateDraft(state.draft.copyWith(city: value));

  void setStateCode(String value) =>
      _updateDraft(state.draft.copyWith(state: value));

  void setSeasonStartAt(DateTime? value) =>
      _updateDraft(state.draft.copyWith(seasonStartAt: value));

  void setSeasonEndAt(DateTime? value) =>
      _updateDraft(state.draft.copyWith(seasonEndAt: value));

  void setPlannedStagesCount(int value) {
    if (value < 2 || value > 12) return;
    _updateDraft(state.draft.copyWith(plannedStagesCount: value));
    syncStagesWithPlan();
  }

  void setGrandFinalEnabled(bool value) {
    _updateDraft(state.draft.copyWith(grandFinalEnabled: value));
    syncStagesWithPlan();
  }

  void syncStagesWithPlan() {
    final existing = state.draft.stages;
    if (existing.isEmpty) {
      _updateDraft(
        state.draft.copyWith(stages: buildDefaultLeagueStages(state.draft)),
      );
      return;
    }

    final planned = state.draft.plannedStagesCount.clamp(2, 12);
    final regular = existing.where((s) => !s.isGrandFinal).toList()
      ..sort((a, b) => a.order.compareTo(b.order));
    final gf = existing.where((s) => s.isGrandFinal).toList();

    final next = <LeagueStageDraft>[];
    for (var i = 1; i <= planned; i++) {
      if (i <= regular.length) {
        next.add(regular[i - 1].copyWith(order: i));
      } else {
        next.add(
          LeagueStageDraft(
            id: 'stage-$i',
            name: 'Etapa $i',
            order: i,
            status: LeagueStageStatus.pending,
          ),
        );
      }
    }

    if (state.draft.grandFinalEnabled) {
      if (gf.isNotEmpty) {
        next.add(gf.first.copyWith(order: planned + 1));
      } else {
        next.add(
          LeagueStageDraft(
            id: 'grand-final',
            name: 'Grande Final',
            order: planned + 1,
            status: LeagueStageStatus.pending,
            isGrandFinal: true,
          ),
        );
      }
    }

    _updateDraft(state.draft.copyWith(stages: next));
  }

  void ensureDefaultStages() {
    if (state.draft.stages.isNotEmpty) return;
    _updateDraft(
      state.draft.copyWith(stages: buildDefaultLeagueStages(state.draft)),
    );
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

  void setCountingStagesMode(LeagueCountingStagesMode mode) =>
      _updateDraft(state.draft.copyWith(countingStagesMode: mode));

  void setRankingTableId(String value) =>
      _updateDraft(state.draft.copyWith(rankingTableId: value));

  void setRankingPointsByPlace(Map<String, int> points) =>
      _updateDraft(state.draft.copyWith(rankingPointsByPlace: points));

  void setGrandFinalSpots(int value) {
    if (value < 4) return;
    _updateDraft(state.draft.copyWith(grandFinalSpots: value));
  }

  void setWildcardEnabled(bool value) =>
      _updateDraft(state.draft.copyWith(wildcardEnabled: value));

  void setWildcardSpots(int value) {
    if (value < 0) return;
    _updateDraft(state.draft.copyWith(wildcardSpots: value));
  }

  void updateStage(LeagueStageDraft stage) {
    final next = state.draft.stages
        .map((s) => s.id == stage.id ? stage : s)
        .toList(growable: false);
    _updateDraft(state.draft.copyWith(stages: next));
  }

  void setStages(List<LeagueStageDraft> stages) =>
      _updateDraft(state.draft.copyWith(stages: stages));
}

final leagueCreateWizardProvider =
    NotifierProvider<LeagueCreateWizardNotifier, LeagueCreateWizardState>(
  LeagueCreateWizardNotifier.new,
);

final leagueCreateDraftProvider = Provider<LeagueCreateDraft>((ref) {
  return ref.watch(leagueCreateWizardProvider).draft;
});

final leagueCreateCurrentStepProvider = Provider<LeagueCreateStep>((ref) {
  return ref.watch(leagueCreateWizardProvider).currentStep;
});

final hasMeaningfulLocalLeagueWizardSessionProvider = Provider<bool>((ref) {
  final draft = ref.watch(leagueCreateDraftProvider);
  return hasMeaningfulLocalLeagueDraft(draft);
});

final leagueCreateCanContinueProvider = Provider.autoDispose
    .family<bool, LeagueCreateStep>((ref, step) {
  final draft = ref.watch(leagueCreateDraftProvider);
  return canContinueFromLeagueStep(draft, step);
});
