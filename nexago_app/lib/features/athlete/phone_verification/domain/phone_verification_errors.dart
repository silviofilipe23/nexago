import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';

import '../../../../core/auth/firebase_auth_error_mapper.dart';

/// Mensagem para o usuário a partir de qualquer falha do fluxo de SMS.
///
/// O fluxo atravessa duas fronteiras que erram de formas diferentes: o
/// Firebase Auth (envio do SMS, vínculo da credencial) e a Cloud Function
/// `confirmPhoneVerification` (gravação em `users/{uid}`). O sheet só quer um
/// texto, então a tradução dos dois casos mora aqui.
String phoneVerificationErrorMessage(Object error) {
  if (error is FirebaseAuthException) {
    return mapFirebaseAuthException(error);
  }
  if (error is FirebaseFunctionsException) {
    final message = error.message?.trim();
    if (message != null && message.isNotEmpty) return message;
    return 'Não foi possível confirmar o telefone. Tente novamente.';
  }
  return 'Não foi possível concluir a verificação. Tente novamente.';
}
