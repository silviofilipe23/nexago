import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'analytics_service.dart';

/// Registra um evento sem nunca quebrar a tela: analytics indisponível
/// (teste, Firebase fora do ar) só não registra. Mesmo desenho do
/// `logPelada`, para qualquer feature.
void logAnalytics(
  WidgetRef ref,
  Future<void> Function(AnalyticsService analytics) event,
) {
  try {
    event(ref.read(analyticsServiceProvider)).catchError((Object _) {});
  } catch (_) {}
}

/// [logAnalytics] para depois de um `await`, quando o widget pode já ter saído
/// da tela: o [ProviderContainer] continua valendo, o `WidgetRef` não.
void logAnalyticsIn(
  ProviderContainer container,
  Future<void> Function(AnalyticsService analytics) event,
) {
  try {
    event(container.read(analyticsServiceProvider)).catchError((Object _) {});
  } catch (_) {}
}
