import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../router/routes.dart';

void navigateFromNotification(
  RemoteMessage message,
  GoRouter router,
) {
  final target = _resolveRoute(message.data);
  if (target == null || target.isEmpty) return;

  // Garante navegação após estabilizar o frame atual.
  WidgetsBinding.instance.addPostFrameCallback((_) {
    router.go(target);
  });
}

String? _resolveRoute(Map<String, dynamic> data) {
  final type = (data['type'] as String?)?.toLowerCase().trim() ?? '';

  // Fluxo de reserva (atleta) -> tela de reservas.
  if (type.contains('booking') || data['bookingId'] != null) {
    return AppRoutes.myBookings;
  }

  // Fluxo de arena (gestor) -> agenda da arena.
  if (type.contains('arena') || data['arenaId'] != null) {
    return AppRoutes.arenaSchedule;
  }

  return null;
}
