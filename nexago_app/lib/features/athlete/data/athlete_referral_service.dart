import 'package:cloud_functions/cloud_functions.dart';

/// Resultado de [AthleteReferralService.registerReferral].
class ReferralRegistrationResult {
  const ReferralRegistrationResult({required this.applied, this.rejection});

  /// `true` se o vínculo `referredBy` foi gravado nesta chamada.
  final bool applied;

  /// Motivo da rejeição/ignoro quando [applied] é `false`
  /// (`MISSING_CODE` | `SELF_REFERRAL` | `REFERRER_NOT_FOUND` | `ALREADY_SET`).
  final String? rejection;
}

/// Programa de indicação (referral) — recompensa em XP via gamificação.
///
/// Código de indicação: o próprio UID do atleta (não existe handle/username
/// curto reaproveitável no app hoje). Registro é server-side via Cloud
/// Function `registerReferral` (idempotente, valida auto-indicação).
class AthleteReferralService {
  AthleteReferralService({FirebaseFunctions? functions})
    : _functions = functions ?? FirebaseFunctions.instance;

  final FirebaseFunctions _functions;

  /// XP creditado ao indicador quando o indicado conclui a 1ª partida
  /// (espelha `XP_REFERRAL_BONUS` em `functions/src/athlete-referral.ts`).
  static const int xpReferralBonus = 50;

  /// Código de indicação do próprio atleta — hoje é literalmente o UID.
  String referralCodeFor(String uid) => uid.trim();

  /// Registra a indicação (chamado uma vez, no onboarding do atleta novo).
  /// Idempotente: repetir a chamada depois de já setado não sobrescreve.
  Future<ReferralRegistrationResult> registerReferral({
    required String referralCode,
  }) async {
    final code = referralCode.trim();
    if (code.isEmpty) {
      return const ReferralRegistrationResult(
        applied: false,
        rejection: 'MISSING_CODE',
      );
    }

    final result = await _functions
        .httpsCallable('registerReferral')
        .call<Map<String, dynamic>>(<String, dynamic>{'referralCode': code});
    final data = result.data;
    return ReferralRegistrationResult(
      applied: data['applied'] == true,
      rejection: data['rejection'] as String?,
    );
  }
}
