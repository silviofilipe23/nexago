import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../onboarding/domain/athlete_onboarding_options.dart';
import 'athlete_firestore_codes.dart';
import 'athlete_profile.dart';
import 'athlete_profile_options.dart';
import 'athlete_profile_providers.dart';
import 'athlete_sports_levels_draft.dart';
import 'athlete_sports_levels_mapper.dart';
import 'gamification_providers.dart';

/// Regra "nível só sobe": mensagem ao tentar reduzir o nível salvo.
const String athleteLevelDowngradeBlockedMessage =
    'Seu nível não pode ser reduzido. Se precisar corrigir, fale com o suporte.';

enum AthleteSportsLevelsStatus { loading, ready, error }

class AthleteSportsLevelsUiState {
  const AthleteSportsLevelsUiState({
    required this.status,
    this.draft = const AthleteSportsLevelsDraft(),
    this.baseline = const AthleteSportsLevelsDraft(),
    this.enrollments = const [],
    this.availableToAdd = const [],
    this.totalGames = 0,
    this.isSaving = false,
    this.errorMessage,
    this.levelLocked = const {},
  });

  final AthleteSportsLevelsStatus status;
  final AthleteSportsLevelsDraft draft;
  final AthleteSportsLevelsDraft baseline;
  final List<AthleteSportEnrollment> enrollments;
  final List<OnboardingSportOption> availableToAdd;
  final int totalGames;
  final bool isSaving;
  final String? errorMessage;
  /// Espelho de `users/{uid}.sportOnboarding.levelLocked` — código Firestore
  /// do esporte (ex.: `VOLEI_PRAIA`) → `true` quando a janela de calibração
  /// já fechou (1ª inscrição ativa naquele esporte).
  final Map<String, bool> levelLocked;

  bool get canEdit => status == AthleteSportsLevelsStatus.ready && !isSaving;

  /// Rank do nível já salvo para o esporte (piso da regra "nível só sobe").
  /// `null` quando o esporte ainda não tem nível persistido.
  int? lockedLevelRankFor(String appSportId) {
    return AthleteProfileOptions.levelRank(
      baseline.levelByAppSportId[appSportId],
    );
  }

  /// `true` quando a janela de calibração já fechou para este esporte (1ª
  /// inscrição ativa) — a partir daí "nível só sobe" volta a valer. Antes do
  /// lock o atleta pode corrigir o nível livremente, pra cima ou pra baixo.
  bool isLevelLockedFor(String appSportId) {
    final firestoreSportId = AthleteFirestoreCodes.sportAppToFirestore(
      appSportId,
    );
    if (firestoreSportId == null) return false;
    return levelLocked[firestoreSportId] == true;
  }

  AthleteSportsLevelsUiState copyWith({
    AthleteSportsLevelsStatus? status,
    AthleteSportsLevelsDraft? draft,
    AthleteSportsLevelsDraft? baseline,
    List<AthleteSportEnrollment>? enrollments,
    List<OnboardingSportOption>? availableToAdd,
    int? totalGames,
    bool? isSaving,
    String? errorMessage,
    bool clearError = false,
    Map<String, bool>? levelLocked,
  }) {
    return AthleteSportsLevelsUiState(
      status: status ?? this.status,
      draft: draft ?? this.draft,
      baseline: baseline ?? this.baseline,
      enrollments: enrollments ?? this.enrollments,
      availableToAdd: availableToAdd ?? this.availableToAdd,
      totalGames: totalGames ?? this.totalGames,
      isSaving: isSaving ?? this.isSaving,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
      levelLocked: levelLocked ?? this.levelLocked,
    );
  }
}

final athleteSportsLevelsProvider = AutoDisposeNotifierProvider<
    AthleteSportsLevelsNotifier, AthleteSportsLevelsUiState>(
  AthleteSportsLevelsNotifier.new,
);

class AthleteSportsLevelsNotifier
    extends AutoDisposeNotifier<AthleteSportsLevelsUiState> {
  Timer? _saveDebounce;

  /// Cache local para preservar edições sem ler [state] em [build] (ainda não inicializado).
  AthleteSportsLevelsUiState? _cachedReadyState;

  @override
  AthleteSportsLevelsUiState build() {
    ref.onDispose(() => _saveDebounce?.cancel());

    final profileAsync = ref.watch(athleteProfileProvider);
    final totalGames =
        ref.watch(gamificationSummaryProvider).valueOrNull?.totalGames ?? 0;

    return profileAsync.when(
      loading: () => AthleteSportsLevelsUiState(
        status: AthleteSportsLevelsStatus.loading,
        totalGames: totalGames,
      ),
      error: (e, _) => AthleteSportsLevelsUiState(
        status: AthleteSportsLevelsStatus.error,
        totalGames: totalGames,
        errorMessage: e.toString(),
      ),
      data: (profile) {
        if (profile == null) {
          return AthleteSportsLevelsUiState(
            status: AthleteSportsLevelsStatus.loading,
            totalGames: totalGames,
          );
        }

        final cached = _cachedReadyState;
        if (cached != null &&
            cached.status == AthleteSportsLevelsStatus.ready &&
            cached.draft.isDirtyComparedTo(cached.baseline)) {
          final next = cached.copyWith(totalGames: totalGames);
          _cachedReadyState = next;
          return next;
        }

        final hydrated = _hydrateFromProfile(profile, totalGames: totalGames);
        _cachedReadyState = hydrated;
        return hydrated;
      },
    );
  }

  void _commitState(AthleteSportsLevelsUiState next) {
    if (next.status == AthleteSportsLevelsStatus.ready) {
      _cachedReadyState = next;
    }
    state = next;
  }

  AthleteSportsLevelsUiState _hydrateFromProfile(
    AthleteProfile profile, {
    required int totalGames,
  }) {
    final enrollments = AthleteSportsLevelsMapper.fromProfile(profile);
    final draft = AthleteSportsLevelsDraft.fromEnrollments(enrollments);
    return AthleteSportsLevelsUiState(
      status: AthleteSportsLevelsStatus.ready,
      draft: draft,
      baseline: draft,
      enrollments: AthleteSportsLevelsMapper.enrollmentsFromDraft(draft),
      availableToAdd: draft.availableToAdd,
      totalGames: totalGames,
      levelLocked: profile.levelLocked,
    );
  }

  /// Regra "nível só sobe" (anti-sandbagging) — com a janela de calibração:
  /// antes da 1ª inscrição ativa naquele esporte (`!isLevelLockedFor`), o
  /// atleta corrige o nível livremente, inclusive pra baixo; depois do lock,
  /// nunca abaixo do nível salvo. A página já explica os dois casos ao
  /// usuário; aqui só protege o estado.
  void updateLevel(String appSportId, String levelLabel) {
    if (!state.canEdit) return;
    final nextRank = AthleteProfileOptions.levelRank(levelLabel);
    if (nextRank == null) return;
    if (state.isLevelLockedFor(appSportId)) {
      final lockedRank = state.lockedLevelRankFor(appSportId);
      if (lockedRank != null && nextRank < lockedRank) {
        return;
      }
    }
    final nextDraft = state.draft.setLevel(appSportId, levelLabel);
    _applyDraft(nextDraft, debouncedSave: true);
  }

  /// Escolha obrigatória: um esporte novo nunca entra com nível silencioso —
  /// [levelLabel] é o nível explicitamente escolhido pelo atleta no sheet da
  /// página. Nível vazio/inválido ou esporte já matriculado é um no-op (nada
  /// muda, nada salva).
  void addSport(String appSportId, String levelLabel) {
    if (!state.canEdit) return;
    final nextDraft = state.draft.addSport(appSportId, levelLabel);
    if (identical(nextDraft, state.draft)) return;
    _applyDraft(nextDraft, debouncedSave: false);
    unawaited(_saveNow());
  }

  void setPrimary(String appSportId) {
    if (!state.canEdit) return;
    final nextDraft = state.draft.setPrimary(appSportId);
    _applyDraft(nextDraft, debouncedSave: false);
    unawaited(_saveNow());
  }

  void _applyDraft(
    AthleteSportsLevelsDraft draft, {
    required bool debouncedSave,
  }) {
    _commitState(state.copyWith(
      draft: draft,
      enrollments: AthleteSportsLevelsMapper.enrollmentsFromDraft(draft),
      availableToAdd: draft.availableToAdd,
      clearError: true,
    ));
    if (debouncedSave) {
      _scheduleDebouncedSave();
    }
  }

  void _scheduleDebouncedSave() {
    _saveDebounce?.cancel();
    _saveDebounce = Timer(const Duration(milliseconds: 400), () {
      unawaited(_saveNow());
    });
  }

  Future<void> _saveNow() async {
    if (state.status != AthleteSportsLevelsStatus.ready) return;
    if (!state.draft.isDirtyComparedTo(state.baseline)) return;

    final profile = ref.read(athleteProfileProvider).valueOrNull;
    if (profile == null) return;

    _commitState(state.copyWith(isSaving: true, clearError: true));

    try {
      final updated = AthleteSportsLevelsMapper.toProfile(
        draft: state.draft,
        base: profile,
      );
      await ref.read(athleteProfileRepositoryProvider).saveProfile(updated);
      ref.invalidate(athleteProfileProvider);
      _commitState(state.copyWith(
        baseline: state.draft,
        isSaving: false,
        clearError: true,
      ));
    } catch (e) {
      _commitState(state.copyWith(
        isSaving: false,
        errorMessage: 'Não foi possível salvar. Tente novamente.',
      ));
    }
  }
}
