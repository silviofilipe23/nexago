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

/// Falha ao subir a foto do onboarding. Distingue o erro do Storage do erro de
/// gravação do perfil: a tela precisa dizer que foi a FOTO que não subiu, senão
/// o atleta refaz o formulário inteiro atrás de um problema que é só de upload.
class AthleteOnboardingPhotoUploadException implements Exception {
  const AthleteOnboardingPhotoUploadException(this.cause);

  final FirebaseException cause;

  @override
  String toString() => 'AthleteOnboardingPhotoUploadException($cause)';
}

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
  /// WhatsApp digitado pelo atleta. Digitar um número novo derruba o selo:
  /// o SMS confirmou o número anterior, não este.
  void setPhoneNumber(String v) =>
      state = state.copyWith(phoneNumber: v, phoneVerified: false);

  /// Número confirmado pelo fluxo de SMS (E.164, vindo da Cloud Function).
  void setVerifiedPhoneNumber(String v) =>
      state = state.copyWith(phoneNumber: v, phoneVerified: true);
  void setBirthDate(String v) => state = state.copyWith(birthDate: v);
  void setGender(String? v) => state = state.copyWith(gender: v);

  /// Trocar a UF invalida a cidade: as duas mudanças saem juntas, senão sobra
  /// uma cidade de outro estado no rascunho.
  void setUf(String? v) =>
      state = state.copyWith(state: v?.trim() ?? '', city: '');
  void setCity(String? v) => state = state.copyWith(city: v?.trim() ?? '');

  void setReferralCode(String v) => state = state.copyWith(referralCode: v);

  void setAvatar({required Uint8List bytes, required String contentType}) {
    state = state.copyWith(
      avatarBytes: bytes,
      avatarContentType: contentType,
    );
  }

  void clearAvatar() => state = state.copyWith(clearAvatar: true);

  /// Persiste o perfil. A foto sobe ANTES do perfil e é obrigatória: se o
  /// Storage falhar, nada é gravado e o erro sobe pra tela — cadastro sem
  /// imagem deixaria o atleta sem como ser identificado nas inscrições.
  Future<void> submit() async {
    final user = ref.read(authProvider).valueOrNull;
    if (user == null) {
      throw StateError('Usuário não autenticado');
    }
    if (!state.isProfileValid) {
      throw StateError('Perfil incompleto');
    }

    final repo = ref.read(athleteProfileRepositoryProvider);

    final String avatarUrl;
    try {
      avatarUrl = await repo.uploadAvatar(
        uid: user.uid,
        bytes: state.avatarBytes!,
        contentType: state.avatarContentType!,
      );
    } on FirebaseException catch (e) {
      throw AthleteOnboardingPhotoUploadException(e);
    }

    await repo.saveProfile(
      state.toAthleteProfile(uid: user.uid, avatarUrl: avatarUrl),
    );

    ref.read(athleteOnboardingJustCompletedProvider.notifier).state = true;
    ref.read(analyticsServiceProvider).logOnboardingComplete();
    ref.invalidate(athleteProfileProvider);

    await _registerReferralIfProvided();
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
