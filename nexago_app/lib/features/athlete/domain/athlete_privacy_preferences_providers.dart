import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'athlete_privacy_preferences.dart';
import 'athlete_profile_providers.dart';

enum AthletePrivacyPreferencesStatus { loading, ready, error }

class AthletePrivacyPreferencesUiState {
  const AthletePrivacyPreferencesUiState({
    required this.status,
    this.prefs = AthletePrivacyPreferences.defaults,
    this.baseline = AthletePrivacyPreferences.defaults,
    this.isSaving = false,
    this.errorMessage,
  });

  final AthletePrivacyPreferencesStatus status;
  final AthletePrivacyPreferences prefs;
  final AthletePrivacyPreferences baseline;
  final bool isSaving;
  final String? errorMessage;

  bool get canEdit => status == AthletePrivacyPreferencesStatus.ready;

  AthletePrivacyPreferencesUiState copyWith({
    AthletePrivacyPreferencesStatus? status,
    AthletePrivacyPreferences? prefs,
    AthletePrivacyPreferences? baseline,
    bool? isSaving,
    String? errorMessage,
    bool clearError = false,
  }) {
    return AthletePrivacyPreferencesUiState(
      status: status ?? this.status,
      prefs: prefs ?? this.prefs,
      baseline: baseline ?? this.baseline,
      isSaving: isSaving ?? this.isSaving,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
    );
  }
}

final athletePrivacyPreferencesProvider = AutoDisposeNotifierProvider<
    AthletePrivacyPreferencesNotifier,
    AthletePrivacyPreferencesUiState>(
  AthletePrivacyPreferencesNotifier.new,
);

class AthletePrivacyPreferencesNotifier
    extends AutoDisposeNotifier<AthletePrivacyPreferencesUiState> {
  Timer? _saveDebounce;
  AthletePrivacyPreferencesUiState? _cachedReadyState;

  @override
  AthletePrivacyPreferencesUiState build() {
    ref.onDispose(() => _saveDebounce?.cancel());

    final profileAsync = ref.watch(athleteProfileProvider);
    final cached = _cachedReadyState;

    if (cached != null &&
        cached.status == AthletePrivacyPreferencesStatus.ready &&
        (profileAsync.isLoading || profileAsync.isRefreshing)) {
      return cached;
    }

    return profileAsync.when(
      loading: () {
        if (cached != null &&
            cached.status == AthletePrivacyPreferencesStatus.ready) {
          return cached;
        }
        return const AthletePrivacyPreferencesUiState(
          status: AthletePrivacyPreferencesStatus.loading,
        );
      },
      error: (e, _) => AthletePrivacyPreferencesUiState(
        status: AthletePrivacyPreferencesStatus.error,
        errorMessage: e.toString(),
      ),
      data: (profile) {
        if (profile == null) {
          if (cached != null &&
              cached.status == AthletePrivacyPreferencesStatus.ready) {
            return cached;
          }
          return const AthletePrivacyPreferencesUiState(
            status: AthletePrivacyPreferencesStatus.loading,
          );
        }

        if (cached != null &&
            cached.status == AthletePrivacyPreferencesStatus.ready &&
            cached.prefs.isDirtyComparedTo(cached.baseline)) {
          final next = cached.copyWith(
            baseline: profile.privacyPreferences,
          );
          _cachedReadyState = next;
          return next;
        }

        if (cached != null &&
            cached.status == AthletePrivacyPreferencesStatus.ready &&
            !cached.prefs.isDirtyComparedTo(cached.baseline) &&
            cached.prefs == profile.privacyPreferences) {
          return cached.copyWith(isSaving: cached.isSaving);
        }

        final hydrated = AthletePrivacyPreferencesUiState(
          status: AthletePrivacyPreferencesStatus.ready,
          prefs: profile.privacyPreferences,
          baseline: profile.privacyPreferences,
          isSaving: cached?.isSaving ?? false,
        );
        _cachedReadyState = hydrated;
        return hydrated;
      },
    );
  }

  void _commitState(AthletePrivacyPreferencesUiState next) {
    if (next.status == AthletePrivacyPreferencesStatus.ready) {
      _cachedReadyState = next;
    }
    state = next;
  }

  void setProfileVisibility(AthleteProfileVisibility visibility) {
    if (!state.canEdit) return;
    final next = state.prefs.copyWith(profileVisibility: visibility);
    _commitState(state.copyWith(prefs: next, clearError: true));
    unawaited(_saveNow());
  }

  void setShowOthers({
    bool? achievementsAndLevel,
    bool? upcomingBookings,
    bool? frequentPartners,
  }) {
    if (!state.canEdit) return;
    final next = state.prefs.copyWith(
      showOthers: state.prefs.showOthers.copyWith(
        achievementsAndLevel: achievementsAndLevel,
        upcomingBookings: upcomingBookings,
        frequentPartners: frequentPartners,
      ),
    );
    _applyPrefs(next);
  }

  void _applyPrefs(AthletePrivacyPreferences prefs) {
    _commitState(state.copyWith(prefs: prefs, clearError: true));
    _scheduleDebouncedSave();
  }

  void _scheduleDebouncedSave() {
    _saveDebounce?.cancel();
    _saveDebounce = Timer(const Duration(milliseconds: 400), () {
      unawaited(_saveNow());
    });
  }

  Future<void> _saveNow() async {
    if (state.status != AthletePrivacyPreferencesStatus.ready) return;
    if (!state.prefs.isDirtyComparedTo(state.baseline)) return;

    final profile = ref.read(athleteProfileProvider).valueOrNull;
    if (profile == null) return;

    _commitState(state.copyWith(isSaving: true, clearError: true));

    try {
      await ref.read(athleteProfileRepositoryProvider).savePrivacyPreferences(
            uid: profile.id,
            preferences: state.prefs,
          );
      _commitState(state.copyWith(
        baseline: state.prefs,
        isSaving: false,
        clearError: true,
      ));
    } catch (_) {
      _commitState(state.copyWith(
        isSaving: false,
        errorMessage: 'Não foi possível salvar. Tente novamente.',
      ));
    }
  }
}
