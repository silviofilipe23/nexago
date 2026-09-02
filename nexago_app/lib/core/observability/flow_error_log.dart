import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:flutter/foundation.dart';

/// Erro de um fluxo crítico (cadastro, onboarding) nunca some em silêncio: em
/// produção vai ao Crashlytics como não-fatal com `reason` = `<fluxo>:<etapa>`
/// — é por ele que a próxima falha em campo aparece com nome. O guard cobre
/// testes e builds sem Firebase.
void recordFlowError(
  String reason,
  Object error,
  StackTrace stack, {
  Iterable<Object> information = const [],
}) {
  debugPrint('$reason: $error');
  try {
    FirebaseCrashlytics.instance.recordError(
      error,
      stack,
      reason: reason,
      information: information,
      fatal: false,
    );
  } catch (_) {}
}
