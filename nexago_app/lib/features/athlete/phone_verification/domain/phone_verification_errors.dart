import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';

import '../../../../core/auth/firebase_auth_error_mapper.dart';

/// Texto genérico para falhas sem tradução própria.
const _fallbackMessage = 'Não foi possível concluir a verificação. Tente novamente.';

/// Mensagem para o usuário a partir de qualquer falha do fluxo de SMS.
///
/// O fluxo atravessa duas fronteiras que erram de formas diferentes: o
/// Firebase Auth (envio do SMS, vínculo da credencial) e a Cloud Function
/// `confirmPhoneVerification` (gravação em `users/{uid}`). O sheet só quer um
/// texto, então a tradução dos dois casos mora aqui.
///
/// Nada de mensagem crua do SDK: para códigos sem tradução o usuário vê o
/// texto genérico e o original só aparece no log de debug. Sem isso, um app
/// iOS sem verificação configurada exibe em tela o inglês do SDK, com link
/// para a documentação do Google Cloud.
String phoneVerificationErrorMessage(Object error) {
  if (error is FirebaseAuthException) {
    final mapped = tryMapFirebaseAuthException(error);
    if (mapped != null) return mapped;
    _logUnmapped('FirebaseAuthException', error.code, error.message);
    return _fallbackMessage;
  }
  if (error is FirebaseFunctionsException) {
    // As mensagens de `confirmPhoneVerification` já vêm em português; só
    // `internal`/`unknown` trazem texto de infraestrutura.
    final message = error.message?.trim();
    final usable = error.code != 'internal' &&
        error.code != 'unknown' &&
        message != null &&
        message.isNotEmpty;
    if (usable) return message;
    _logUnmapped('FirebaseFunctionsException', error.code, error.message);
    return 'Não foi possível confirmar o telefone. Tente novamente.';
  }
  _logUnmapped(error.runtimeType.toString(), '-', error.toString());
  return _fallbackMessage;
}

void _logUnmapped(String type, String code, String? message) {
  if (!kDebugMode) return;
  debugPrint('phone verification · $type($code): ${message ?? '-'}');
}
