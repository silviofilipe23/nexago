import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/observability/analytics_service.dart';

/// Evento das Peladas sem nunca quebrar a tela: analytics indisponível (teste,
/// Firebase fora) só não registra.
void logPelada(WidgetRef ref, Future<void> Function(AnalyticsService a) event) {
  try {
    event(ref.read(analyticsServiceProvider)).catchError((Object _) {});
  } catch (_) {}
}
