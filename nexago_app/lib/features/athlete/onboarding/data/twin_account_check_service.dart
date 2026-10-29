import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/firebase/functions_region.dart';

/// A outra conta que já usa o WhatsApp digitado no cadastro, mascarada.
class PhoneInOtherAccount {
  const PhoneInOtherAccount({
    required this.maskedEmail,
    required this.signInMethod,
  });

  /// `jo•••@gmail.com`; vazio quando a conta não tem e-mail.
  final String maskedEmail;

  /// "Google", "Apple", "e-mail e senha" ou vazio.
  final String signInMethod;

  /// "Google · jo•••@gmail.com" — o que a pessoa precisa para achar a conta.
  String get hint =>
      [signInMethod, maskedEmail].where((p) => p.isNotEmpty).join(' · ');
}

/// Teto da consulta: ela é um aviso, não pode virar mais um elo lento na
/// cadeia de rede do "Concluir cadastro".
const Duration kTwinAccountCheckTimeout = Duration(seconds: 4);

/// Consulta `checkPhoneInOtherAccount` (mesma pessoa com duas contas).
///
/// Best-effort de ponta a ponta: sem rede, sem a callable publicada ou com
/// erro, devolve `null` e o cadastro segue como se não houvesse outra conta.
class TwinAccountCheckService {
  TwinAccountCheckService({FirebaseFunctions? functions})
      : _functionsOverride = functions;

  // Resolvido dentro do try: sem Firebase inicializado (testes) o getter
  // lançaria fora da proteção.
  final FirebaseFunctions? _functionsOverride;

  Future<PhoneInOtherAccount?> findOtherAccount({
    required String phoneNumber,
    required String birthDate,
  }) async {
    try {
      final functions = _functionsOverride ?? nexagoFunctions;
      final result = await functions
          .httpsCallable('checkPhoneInOtherAccount')
          .call<Map<String, dynamic>>({
        'phoneNumber': phoneNumber,
        'birthDate': birthDate,
      }).timeout(kTwinAccountCheckTimeout);
      final data = result.data;
      if (data['inOtherAccount'] != true) return null;
      return PhoneInOtherAccount(
        maskedEmail: (data['maskedEmail'] as String?) ?? '',
        signInMethod: (data['signInMethod'] as String?) ?? '',
      );
    } catch (_) {
      return null;
    }
  }
}

final twinAccountCheckServiceProvider = Provider<TwinAccountCheckService>(
  (ref) => TwinAccountCheckService(),
);
