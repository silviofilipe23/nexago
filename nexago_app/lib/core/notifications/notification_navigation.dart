import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../auth/auth_providers.dart';
import '../deep_link/deep_link_providers.dart';
import '../router/routes.dart';

/// Tempo máximo esperando a sessão assentar antes de decidir o destino.
const _sessionSettleTimeout = Duration(seconds: 8);

/// Destino do toque em uma notificação, já confrontado com o estado da sessão.
class NotificationTapDestination {
  const NotificationTapDestination({
    required this.path,
    required this.requiresLogin,
  });

  /// Rota interna do app (ex.: `/torneios-convite/inv-1`).
  final String path;

  /// Sem sessão o destino não pode abrir agora: vira deep link pendente e o
  /// router o consome ao sair do login.
  final bool requiresLogin;
}

/// Resolve o destino do toque considerando se já existe sessão.
NotificationTapDestination? resolveNotificationTapDestination({
  required Map<String, dynamic> data,
  required bool hasSession,
}) {
  final target = resolveNotificationRoute(data);
  if (target == null || target.isEmpty) return null;
  return NotificationTapDestination(
    path: target,
    requiresLogin: !hasSession,
  );
}

Future<void> navigateFromNotification(
  RemoteMessage message,
  GoRouter router, {
  required WidgetRef ref,
}) {
  return navigateFromNotificationData(message.data, router, ref: ref);
}

Future<void> navigateFromNotificationData(
  Map<String, dynamic> data,
  GoRouter router, {
  required WidgetRef ref,
}) async {
  // Cold start (toque com o app fechado): o payload chega antes do Firebase
  // Auth restaurar a sessão. Navegar nesse instante mandava o atleta para o
  // login e o destino se perdia — o convite nunca abria.
  final hasSession = await _awaitSettledSession(ref);
  final destination = resolveNotificationTapDestination(
    data: data,
    hasSession: hasSession,
  );
  if (destination == null) return;

  if (destination.requiresLogin) {
    // Mesmo mecanismo dos deep links: consumido em `leavingAuthRoute`.
    ref.read(pendingDeepLinkPathProvider.notifier).state = destination.path;
    router.go(AppRoutes.login);
    return;
  }

  // Garante navegação após estabilizar o frame atual.
  WidgetsBinding.instance.addPostFrameCallback((_) {
    router.go(destination.path);
  });
}

/// Espera a primeira resolução do estado de auth (sessão restaurada ou não).
Future<bool> _awaitSettledSession(WidgetRef ref) async {
  final current = ref.read(authProvider);
  if (!current.isLoading) return current.valueOrNull != null;
  try {
    final user = await ref
        .read(authProvider.future)
        .timeout(_sessionSettleTimeout);
    return user != null;
  } catch (_) {
    return ref.read(authProvider).valueOrNull != null;
  }
}

String? resolveNotificationRoute(Map<String, dynamic> data) {
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

  // Convite de substituição (jornada v2) mora na MESMA coleção/tela de
  // convite de parceiro (`attachRegistrationId`, ver
  // `functions/src/tournament-substitution.ts`) — a tela de convite já
  // distingue pelo `isSubstitutionInvite`. Cobre tanto o push original
  // quanto o lembrete (`resendSubstitutionInvite`), que manda o mesmo tipo.
  if (type == 'tournament_substitution_invite') {
    final inviteId = (data['inviteId'] as String?)?.trim() ?? '';
    if (inviteId.isEmpty) return null;
    return AppRoutes.tournamentPartnerInvite.replaceAll(':inviteId', inviteId);
  }

  if (type == 'tournament_partner_invite_accepted') {
    final url = (data['url'] as String?)?.trim();
    if (url != null && url.startsWith('/')) return url;
    final tournamentId = (data['tournamentId'] as String?)?.trim() ?? '';
    final registrationId = (data['registrationId'] as String?)?.trim() ?? '';
    final categoryId = (data['categoryId'] as String?)?.trim() ?? '';
    final inviteId = (data['inviteId'] as String?)?.trim() ?? '';
    if (tournamentId.isEmpty || registrationId.isEmpty) return null;
    final path = AppRoutes.tournamentRegistration
        .replaceAll(':tournamentId', tournamentId);
    final params = <String, String>{
      'registrationId': registrationId,
      'step': 'payment',
    };
    if (categoryId.isNotEmpty) params['categoryId'] = categoryId;
    if (inviteId.isNotEmpty) params['inviteId'] = inviteId;
    final query = params.entries
        .map((e) => '${e.key}=${Uri.encodeComponent(e.value)}')
        .join('&');
    return '$path?$query';
  }

  if (type == 'booking_invite') {
    final inviteId = (data['inviteId'] as String?)?.trim() ?? '';
    if (inviteId.isEmpty) return null;
    return AppRoutes.bookingInvite.replaceAll(':inviteId', inviteId);
  }

  // Bora Jogar (match finder): todos os tipos caem no detalhe do jogo —
  // a tela se adapta ao status/papel.
  if (type.startsWith('friendly_match_')) {
    final matchId = (data['matchId'] as String?)?.trim() ?? '';
    if (matchId.isEmpty) return AppRoutes.friendlyMatchHub;
    return AppRoutes.friendlyMatchDetail.replaceAll(':matchId', matchId);
  }

  if (type == 'tournament_bracket_published' ||
      type == 'tournament_cancelled' ||
      type == 'tournament_registration_cancelled') {
    final bracketUrl = (data['url'] as String?)?.trim();
    if (bracketUrl != null && bracketUrl.startsWith('/')) return bracketUrl;
    final tournamentId = (data['tournamentId'] as String?)?.trim() ?? '';
    if (tournamentId.isNotEmpty) {
      return AppRoutes.tournamentDetail.replaceAll(
        ':tournamentId',
        tournamentId,
      );
    }
  }

  // Escada de níveis (engine de rating) -> Esportes e níveis. O backend já
  // envia `url`; isto é o fallback explícito por tipo.
  if (type == 'level_promotion' ||
      type == 'relegation_warning' ||
      type == 'relegation_applied' ||
      type == 'relegation_cleared') {
    return AppRoutes.athleteSportsLevels;
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
