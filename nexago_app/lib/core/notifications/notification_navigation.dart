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

  final url = (data['url'] as String?)?.trim();
  if (url != null && url.startsWith('/')) {
    return url;
  }

  if (type == 'slot_vacancy_available') {
    final arenaId = (data['arenaId'] as String?)?.trim() ?? '';
    if (arenaId.isEmpty) return null;
    final date = (data['date'] as String?)?.trim();
    final courtId = (data['courtId'] as String?)?.trim();
    final startTime = (data['startTime'] as String?)?.trim();
    final path = AppRoutes.arenaSlots.replaceAll(':arenaId', arenaId);
    final params = <String, String>{};
    if (date != null && date.isNotEmpty) params['date'] = date;
    if (courtId != null && courtId.isNotEmpty) params['courtId'] = courtId;
    if (startTime != null && startTime.isNotEmpty) {
      params['startTime'] = startTime;
    }
    if (params.isEmpty) return path;
    final query = params.entries
        .map((e) => '${e.key}=${Uri.encodeComponent(e.value)}')
        .join('&');
    return '$path?$query';
  }

  if (type == 'tournament_partner_invite') {
    final inviteId = (data['inviteId'] as String?)?.trim() ?? '';
    if (inviteId.isEmpty) return null;
    return AppRoutes.tournamentPartnerInvite.replaceAll(':inviteId', inviteId);
  }

  if (type == 'booking_invite') {
    final inviteId = (data['inviteId'] as String?)?.trim() ?? '';
    if (inviteId.isEmpty) return null;
    return AppRoutes.bookingInvite.replaceAll(':inviteId', inviteId);
  }

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
