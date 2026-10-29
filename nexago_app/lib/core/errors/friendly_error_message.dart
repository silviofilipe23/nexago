import 'dart:async';
import 'dart:io';

import 'package:firebase_core/firebase_core.dart';

import '../observability/flow_error_log.dart';

/// Texto de falha para o atleta: "<ação>. <motivo>".
///
/// Antes as telas mostravam o erro cru — "Não foi possível cancelar:
/// [firebase_functions/failed-precondition] …" — justo quando o atleta já
/// está frustrado. Aqui:
/// - frase pronta (mensagem PT do servidor no `HttpsError` ou das exceções do
///   app, como `BookingException`) aparece como veio;
/// - sem internet / servidor fora do ar vira "Sem conexão…";
/// - sessão expirada e falta de permissão têm texto próprio;
/// - o resto (técnico, inglês, "NOT FOUND" de callable não publicada) vira
///   "Tente de novo em instantes." — e, com [logReason], vai ao Crashlytics,
///   para a falha que ninguém previu não sumir junto com o texto.
///
/// [action] é a frase da tela, sem ponto final: "Não foi possível cancelar".
String friendlyErrorMessage(
  Object error, {
  required String action,
  String? logReason,
}) {
  final reason = friendlyErrorReason(error);
  if (reason == null && logReason != null) {
    recordFlowError(logReason, error, StackTrace.current);
  }
  return '$action. ${reason ?? _retryLater}';
}

const _retryLater = 'Tente de novo em instantes.';
const _offline = 'Sem conexão. Confira sua internet e tente de novo.';

/// Motivo legível do erro, ou `null` quando ele é técnico demais para mostrar.
String? friendlyErrorReason(Object error) {
  if (error is SocketException || error is TimeoutException) return _offline;
  if (error is FirebaseException) {
    return friendlyFirebaseErrorReason(
        code: error.code, message: error.message);
  }
  final String text;
  if (error is StateError) {
    text = error.message;
  } else if (error is ArgumentError) {
    text = '${error.message ?? ''}';
  } else {
    // `Exception('…')` vira "Exception: …"; as exceções do app (Booking,
    // Payment, convite de dupla…) já devolvem só a mensagem no toString.
    text = error.toString().replaceFirst(RegExp(r'^Exception:\s*'), '');
  }
  return _isSentence(text) ? text.trim() : null;
}

/// Mapeamento puro por código do Firebase (Functions, Firestore, Storage,
/// Auth) — testável sem construir a exceção.
String? friendlyFirebaseErrorReason({required String code, String? message}) {
  switch (code) {
    case 'unavailable':
    case 'deadline-exceeded':
    case 'network-request-failed':
      return _offline;
    case 'unauthenticated':
      return 'Sua sessão expirou. Entre de novo e tente outra vez.';
    case 'resource-exhausted':
      return _isSentence(message)
          ? message!.trim()
          : 'Muitas tentativas seguidas. Espere um pouco e tente de novo.';
    case 'permission-denied':
    case 'unauthorized':
      return _isSentence(message)
          ? message!.trim()
          : 'Você não tem permissão para fazer isso.';
    // Erros de regra de negócio: o servidor escreve a mensagem para o atleta.
    case 'failed-precondition':
    case 'invalid-argument':
    case 'not-found':
    case 'already-exists':
    case 'out-of-range':
    case 'aborted':
      return _isSentence(message) ? message!.trim() : null;
  }
  return null;
}

/// Frase escrita para gente: começa com maiúscula, termina em pontuação e não
/// tem cara de código ("NOT FOUND", "[firebase/…]", "type 'Null' …",
/// "No element"). As mensagens do servidor e das exceções do app seguem esse
/// formato; as internas do Dart e do Firebase, não.
bool _isSentence(String? text) {
  final t = text?.trim() ?? '';
  if (t.length < 3 || t.length > 200) return false;
  if (t == t.toUpperCase()) return false;
  if (!RegExp(r'^[A-ZÀ-Ú]').hasMatch(t)) return false;
  if (!RegExp(r'[.!?]$').hasMatch(t)) return false;
  if (RegExp(r'[\[\]{}_]|Exception|Error|dart:|null', caseSensitive: false)
      .hasMatch(t)) {
    return false;
  }
  return true;
}
