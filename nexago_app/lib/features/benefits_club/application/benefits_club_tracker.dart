import 'dart:async';

import 'package:flutter/foundation.dart';

import '../domain/benefit_event.dart';
import '../domain/benefits_club_repository.dart';

/// Manda os eventos do funil sem segurar a tela: fire-and-forget, e falha
/// (sem rede, sessão expirada, callable fora do ar) só aparece no log de
/// debug. Número perdido é melhor que tela travada.
class BenefitsClubTracker {
  BenefitsClubTracker(this._service);

  final BenefitsClubService _service;

  bool _hubCardViewSent = false;

  /// `hub_card_view` uma vez por sessão do app (o tracker vive enquanto o
  /// app está aberto).
  void hubCardViewed() {
    if (_hubCardViewSent) return;
    _hubCardViewSent = true;
    track(BenefitEventType.hubCardView, source: BenefitSource.hubCard);
  }

  void track(
    BenefitEventType type, {
    required BenefitSource source,
    String? partnerId,
  }) {
    unawaited(_send(type, source, partnerId));
  }

  Future<void> _send(
    BenefitEventType type,
    BenefitSource source,
    String? partnerId,
  ) async {
    // Telemetria nunca derruba nada: qualquer falha (inclusive a síncrona de
    // um Firebase não inicializado) fica só no log de debug.
    try {
      await _service.trackEvent(
        type: type,
        source: source,
        partnerId: partnerId,
      );
    } catch (error) {
      if (kDebugMode) {
        debugPrint('clube: evento ${type.key} não gravado: $error');
      }
    }
  }
}
