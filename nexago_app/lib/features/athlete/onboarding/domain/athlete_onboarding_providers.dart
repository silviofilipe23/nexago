import 'dart:async';
import 'dart:io';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/auth/auth_providers.dart';
import '../../../../core/observability/analytics_service.dart';
import '../../../../core/observability/flow_error_log.dart';
import '../../domain/athlete_profile_providers.dart';
import '../../domain/athlete_referral_providers.dart';
import 'athlete_onboarding_draft.dart';

/// Etapas de rede do "Concluir cadastro", na ordem em que rodam.
enum AthleteOnboardingSubmitStage { uploadAvatar, grantAthleteRole, saveProfile }

/// Falha numa etapa do "Concluir cadastro". Carrega a etapa e a causa: a tela
/// diz o que falhou (foto, rede, permissão) e o Crashlytics recebe
/// `onboarding:<etapa>` — sem isso o atleta refaz o formulário inteiro atrás
/// de um problema que era só de rede, e ninguém fica sabendo.
class AthleteOnboardingSubmitException implements Exception {
  const AthleteOnboardingSubmitException(this.stage, this.cause, [this.stackTrace]);

  final AthleteOnboardingSubmitStage stage;
  final Object cause;
  final StackTrace? stackTrace;

  bool get isNetwork => isOnboardingNetworkFailure(cause);

  @override
  String toString() =>
      'AthleteOnboardingSubmitException(${stage.name}: $cause)';
}

/// Falha ao subir a foto — distinta das outras porque a tela precisa dizer
/// que foi a FOTO que não subiu.
class AthleteOnboardingPhotoUploadException
    extends AthleteOnboardingSubmitException {
  const AthleteOnboardingPhotoUploadException(Object cause, [StackTrace? st])
      : super(AthleteOnboardingSubmitStage.uploadAvatar, cause, st);
}

const _networkCodes = {
  'unavailable',
  'deadline-exceeded',
  'aborted',
  'cancelled',
  'canceled',
  'unknown',
  'internal',
  'network-request-failed',
  'retry-limit-exceeded',
};

/// Erro que é de conexão, não do que o atleta digitou: tempo esgotado, socket
/// caído, TLS derrubado ("unknown" com mensagem de rede), servidor
/// indisponível. Quem cai aqui deve ser convidado a tentar de novo.
bool isOnboardingNetworkFailure(Object error) {
  if (error is TimeoutException || error is SocketException) return true;
  if (error is FirebaseException) return _networkCodes.contains(error.code);
  return false;
}

final athleteOnboardingDraftProvider =
    NotifierProvider<AthleteOnboardingDraftNotifier, AthleteOnboardingDraft>(
  AthleteOnboardingDraftNotifier.new,
);

class AthleteOnboardingDraftNotifier extends Notifier<AthleteOnboardingDraft> {
  @override
  AthleteOnboardingDraft build() => const AthleteOnboardingDraft();

  /// Foto já enviada nesta sessão (uid + bytes exatos): uma segunda tentativa
  /// depois de falha de rede não sobe a mesma imagem outra vez.
  Uint8List? _uploadedAvatarBytes;
  String? _uploadedAvatarUrl;
  String? _uploadedAvatarUid;

  void reset() {
    _uploadedAvatarBytes = null;
    _uploadedAvatarUrl = null;
    _uploadedAvatarUid = null;
    state = const AthleteOnboardingDraft();
  }

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
  ///
  /// Toda falha sai como [AthleteOnboardingSubmitException] com a etapa.
  /// [onStage] avisa a tela em que elo da cadeia estamos, para o botão não
  /// ser um spinner mudo por 10–25 s.
  Future<void> submit({
    void Function(AthleteOnboardingSubmitStage stage)? onStage,
  }) async {
    final user = ref.read(authProvider).valueOrNull;
    if (user == null) {
      throw StateError('Usuário não autenticado');
    }
    if (!state.isProfileValid) {
      throw StateError('Perfil incompleto');
    }

    final repo = ref.read(athleteProfileRepositoryProvider);

    // Papel de atleta em PARALELO com a foto: a callable sofre cold start em
    // quase todo cadastro (5–16 s medidos) e não depende da imagem. Falha
    // aqui não derruba nada — `saveProfile` chama de novo se o papel ainda
    // faltar no doc; só fica registrada.
    final roleWarmup = repo.grantAthleteRole().then<void>(
      (_) {},
      onError: (Object e, StackTrace st) {
        recordFlowError('onboarding:grantAthleteRoleWarmup', e, st);
      },
    );

    final bytes = state.avatarBytes!;
    final String avatarUrl;
    final cachedUrl = _uploadedAvatarUrl;
    if (cachedUrl != null &&
        _uploadedAvatarUid == user.uid &&
        identical(bytes, _uploadedAvatarBytes)) {
      avatarUrl = cachedUrl;
    } else {
      onStage?.call(AthleteOnboardingSubmitStage.uploadAvatar);
      try {
        avatarUrl = await repo.uploadAvatar(
          uid: user.uid,
          bytes: bytes,
          contentType: state.avatarContentType!,
        );
      } catch (e, st) {
        throw AthleteOnboardingPhotoUploadException(e, st);
      }
      _uploadedAvatarBytes = bytes;
      _uploadedAvatarUrl = avatarUrl;
      _uploadedAvatarUid = user.uid;
    }

    onStage?.call(AthleteOnboardingSubmitStage.grantAthleteRole);
    await roleWarmup;

    onStage?.call(AthleteOnboardingSubmitStage.saveProfile);
    try {
      await repo.saveProfile(
        state.toAthleteProfile(uid: user.uid, avatarUrl: avatarUrl),
      );
    } catch (e, st) {
      throw AthleteOnboardingSubmitException(
        e is FirebaseFunctionsException
            ? AthleteOnboardingSubmitStage.grantAthleteRole
            : AthleteOnboardingSubmitStage.saveProfile,
        e,
        st,
      );
    }

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
