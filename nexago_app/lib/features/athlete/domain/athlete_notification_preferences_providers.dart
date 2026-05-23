import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'athlete_notification_preferences.dart';
import 'athlete_profile_providers.dart';

enum AthleteNotificationPreferencesStatus { loading, ready, error }

class AthleteNotificationPreferencesUiState {
  const AthleteNotificationPreferencesUiState({
    required this.status,
    this.prefs = AthleteNotificationPreferences.defaults,
    this.baseline = AthleteNotificationPreferences.defaults,
    this.isSaving = false,
    this.errorMessage,
  });

  final AthleteNotificationPreferencesStatus status;
  final AthleteNotificationPreferences prefs;
  final AthleteNotificationPreferences baseline;
  final bool isSaving;
  final String? errorMessage;

  bool get canEdit => status == AthleteNotificationPreferencesStatus.ready;

  AthleteNotificationPreferencesUiState copyWith({
    AthleteNotificationPreferencesStatus? status,
    AthleteNotificationPreferences? prefs,
    AthleteNotificationPreferences? baseline,
    bool? isSaving,
    String? errorMessage,
    bool clearError = false,
  }) {
    return AthleteNotificationPreferencesUiState(
      status: status ?? this.status,
      prefs: prefs ?? this.prefs,
      baseline: baseline ?? this.baseline,
      isSaving: isSaving ?? this.isSaving,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
    );
  }
}

final athleteNotificationPreferencesProvider = AutoDisposeNotifierProvider<
    AthleteNotificationPreferencesNotifier,
    AthleteNotificationPreferencesUiState>(
  AthleteNotificationPreferencesNotifier.new,
);

class AthleteNotificationPreferencesNotifier
    extends AutoDisposeNotifier<AthleteNotificationPreferencesUiState> {
  Timer? _saveDebounce;
  AthleteNotificationPreferencesUiState? _cachedReadyState;

  @override
  AthleteNotificationPreferencesUiState build() {
    ref.onDispose(() => _saveDebounce?.cancel());

    final profileAsync = ref.watch(athleteProfileProvider);
    final cached = _cachedReadyState;

    // Evita piscar todos os toggles quando o stream do perfil recarrega.
    if (cached != null &&
        cached.status == AthleteNotificationPreferencesStatus.ready &&
        (profileAsync.isLoading || profileAsync.isRefreshing)) {
      return cached;
    }

    return profileAsync.when(
      loading: () {
        if (cached != null &&
            cached.status == AthleteNotificationPreferencesStatus.ready) {
          return cached;
        }
        return const AthleteNotificationPreferencesUiState(
          status: AthleteNotificationPreferencesStatus.loading,
        );
      },
      error: (e, _) => AthleteNotificationPreferencesUiState(
        status: AthleteNotificationPreferencesStatus.error,
        errorMessage: e.toString(),
      ),
      data: (profile) {
        if (profile == null) {
          if (cached != null &&
              cached.status == AthleteNotificationPreferencesStatus.ready) {
            return cached;
          }
          return const AthleteNotificationPreferencesUiState(
            status: AthleteNotificationPreferencesStatus.loading,
          );
        }

        if (cached != null &&
            cached.status == AthleteNotificationPreferencesStatus.ready &&
            cached.prefs.isDirtyComparedTo(cached.baseline)) {
          final next = cached.copyWith(
            baseline: profile.notificationPreferences,
          );
          _cachedReadyState = next;
          return next;
        }

        if (cached != null &&
            cached.status == AthleteNotificationPreferencesStatus.ready &&
            !cached.prefs.isDirtyComparedTo(cached.baseline) &&
            cached.prefs == profile.notificationPreferences) {
          return cached.copyWith(isSaving: cached.isSaving);
        }

        final hydrated = AthleteNotificationPreferencesUiState(
          status: AthleteNotificationPreferencesStatus.ready,
          prefs: profile.notificationPreferences,
          baseline: profile.notificationPreferences,
          isSaving: cached?.isSaving ?? false,
        );
        _cachedReadyState = hydrated;
        return hydrated;
      },
    );
  }

  void _commitState(AthleteNotificationPreferencesUiState next) {
    if (next.status == AthleteNotificationPreferencesStatus.ready) {
      _cachedReadyState = next;
    }
    state = next;
  }

  void setChannel({
    bool? push,
    bool? whatsapp,
    bool? email,
  }) {
    if (!state.canEdit) return;
    final next = state.prefs.copyWith(
      channels: state.prefs.channels.copyWith(
        push: push,
        whatsapp: whatsapp,
        email: email,
      ),
    );
    _applyPrefs(next);
  }

  void setTopic({
    bool? bookingsAndGames,
    bool? athleteInvites,
    bool? achievementsXp,
    bool? availableSlots,
    bool? promotions,
  }) {
    if (!state.canEdit) return;
    final next = state.prefs.copyWith(
      topics: state.prefs.topics.copyWith(
        bookingsAndGames: bookingsAndGames,
        athleteInvites: athleteInvites,
        achievementsXp: achievementsXp,
        availableSlots: availableSlots,
        promotions: promotions,
      ),
    );
    _applyPrefs(next);
  }

  void setQuietHoursEnabled(bool enabled) {
    if (!state.canEdit) return;
    final next = state.prefs.copyWith(
      quietHours: state.prefs.quietHours.copyWith(enabled: enabled),
    );
    _applyPrefs(next);
  }

  void setQuietHoursRange({required String start, required String end}) {
    if (!state.canEdit) return;
    final next = state.prefs.copyWith(
      quietHours: state.prefs.quietHours.copyWith(start: start, end: end),
    );
    _applyPrefs(next, debouncedSave: false);
    unawaited(_saveNow());
  }

  void _applyPrefs(
    AthleteNotificationPreferences prefs, {
    bool debouncedSave = true,
  }) {
    _commitState(state.copyWith(prefs: prefs, clearError: true));
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

  /// Persiste imediatamente (ex.: após push OFF ou horário de silêncio).
  Future<void> saveNow() => _saveNow();

  Future<void> _saveNow() async {
    if (state.status != AthleteNotificationPreferencesStatus.ready) return;
    if (!state.prefs.isDirtyComparedTo(state.baseline)) return;

    final profile = ref.read(athleteProfileProvider).valueOrNull;
    if (profile == null) return;

    _commitState(state.copyWith(isSaving: true, clearError: true));

    try {
      await ref.read(athleteProfileRepositoryProvider).saveNotificationPreferences(
            uid: profile.id,
            preferences: state.prefs,
          );
      // O stream `watchProfile` atualiza sozinho; invalidate causava loading e piscada.
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

  void revertToBaseline() {
    _commitState(state.copyWith(prefs: state.baseline, clearError: true));
  }
}
