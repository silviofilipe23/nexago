import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/auth/auth_providers.dart';
import '../../../../core/observability/analytics_service.dart';
import '../../domain/athlete_profile_providers.dart';
import '../../domain/athlete_referral_providers.dart';
import 'athlete_onboarding_draft.dart';

final athleteOnboardingDraftProvider =
    NotifierProvider<AthleteOnboardingDraftNotifier, AthleteOnboardingDraft>(
  AthleteOnboardingDraftNotifier.new,
);

class AthleteOnboardingDraftNotifier extends Notifier<AthleteOnboardingDraft> {
  @override
  AthleteOnboardingDraft build() => const AthleteOnboardingDraft();

  void reset() => state = const AthleteOnboardingDraft();

  void setPrimarySport(String id) {
    final nextOthers = Set<String>.from(state.otherSportIds)..remove(id);
    state = state.copyWith(primarySportId: id, otherSportIds: nextOthers);
  }

  void toggleOtherSport(String id) {
    if (id == state.primarySportId) return;
    final next = Set<String>.from(state.otherSportIds);
    if (next.contains(id)) {
      next.remove(id);
    } else {
      next.add(id);
    }
    state = state.copyWith(otherSportIds: next);
  }

  void setLevel(String level) => state = state.copyWith(level: level);

  void toggleGoal(String id) {
    final next = Set<String>.from(state.goalIds);
    if (next.contains(id)) {
      next.remove(id);
    } else {
      next.add(id);
    }
    state = state.copyWith(goalIds: next);
  }

  void setName(String v) => state = state.copyWith(name: v);
  void setNickname(String v) => state = state.copyWith(nickname: v);
  void setVerifiedPhoneNumber(String v) =>
      state = state.copyWith(verifiedPhoneNumber: v);
  void setBirthDate(String v) => state = state.copyWith(birthDate: v);
  void setGender(String? v) => state = state.copyWith(gender: v);

  void setReferralCode(String v) => state = state.copyWith(referralCode: v);

  void setAvatar({required Uint8List bytes, required String contentType}) {
    state = state.copyWith(
      avatarBytes: bytes,
      avatarContentType: contentType,
    );
  }

  void clearAvatar() => state = state.copyWith(clearAvatar: true);

  /// Persiste o perfil. Retorna aviso se a foto opcional falhar (perfil já salvo).
  Future<String?> submit() async {
    final user = ref.read(authProvider).valueOrNull;
    if (user == null) {
      throw StateError('Usuário não autenticado');
    }
    if (!state.isProfileValid) {
      throw StateError('Perfil incompleto');
    }

    final repo = ref.read(athleteProfileRepositoryProvider);
    final profile = state.toAthleteProfile(uid: user.uid);

    await repo.saveProfile(profile);

    ref.read(athleteOnboardingJustCompletedProvider.notifier).state = true;
    ref.read(analyticsServiceProvider).logOnboardingComplete();
    ref.invalidate(athleteProfileProvider);

    await _registerReferralIfProvided();

    final bytes = state.avatarBytes;
    final contentType = state.avatarContentType;
    if (bytes == null || contentType == null) {
      return null;
    }

    try {
      final url = await repo.uploadAvatar(
        uid: user.uid,
        bytes: bytes,
        contentType: contentType,
      );
      await repo.saveProfile(profile.copyWith(avatarUrl: url));
      ref.invalidate(athleteProfileProvider);
      return null;
    } on FirebaseException {
      return 'Cadastro concluído. A foto não foi enviada — você pode adicionar depois no perfil.';
    }
  }

  /// Registra a indicação (se um código foi informado no onboarding). Não
  /// bloqueia a conclusão do cadastro: falha aqui não deve impedir o atleta
  /// de entrar no app — o vínculo de indicação é um efeito colateral do
  /// cadastro, não um requisito dele. Idempotente no servidor
  /// (`registerReferral`): repetir com o mesmo ou outro código depois de já
  /// setado é ignorado.
  Future<void> _registerReferralIfProvided() async {
    final code = state.referralCode.trim();
    if (code.isEmpty) return;

    try {
      await ref
          .read(athleteReferralServiceProvider)
          .registerReferral(referralCode: code);
    } on FirebaseFunctionsException catch (e) {
      if (kDebugMode) {
        debugPrint('registerReferral: falha (${e.code}) $e');
      }
    } catch (e) {
      if (kDebugMode) {
        debugPrint('registerReferral: falha inesperada $e');
      }
    }
  }
}
