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
