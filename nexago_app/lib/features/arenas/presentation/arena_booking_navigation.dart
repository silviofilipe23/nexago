import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/formatting/app_date_format.dart';

import '../../../core/router/routes.dart';
import '../../athlete/domain/athlete_shell_providers.dart';
import '../domain/arena_list_item.dart';
import '../domain/arena_slot.dart';
import 'arena_detail_route_extra.dart';

void openArenaDetail(
  BuildContext context,
  ArenaListItem arena, {
  bool isBestPrice = false,
}) {
  context.pushNamed(
    AppRouteNames.arenaDetail,
    pathParameters: {'arenaId': arena.id},
    extra: ArenaDetailRouteExtra(arena: arena, isBestPrice: isBestPrice),
  );
}

void openArenaBookingSlots(
  BuildContext context, {
  required ArenaListItem arena,
  ArenaSlot? slot,
  required DateTime date,
  String? courtId,
}) {
  final dateKey = calendarDateKey(date);
  final resolvedCourtId =
      courtId?.trim().isNotEmpty == true ? courtId!.trim() : slot?.courtId.trim();
  context.pushNamed(
    AppRouteNames.arenaSlots,
    pathParameters: {'arenaId': arena.id},
    queryParameters: <String, String>{
      if (resolvedCourtId != null && resolvedCourtId.isNotEmpty)
        'courtId': resolvedCourtId,
      if (slot?.startTime.trim().isNotEmpty == true)
        'startTime': slot!.startTime.trim(),
      'date': dateKey,
    },
    extra: arena,
  );
}

void openDiscoverAgendaTab(BuildContext context, {WidgetRef? ref}) {
  if (ref != null) {
    ref.read(athleteShellTabIndexProvider.notifier).state =
        athleteShellAgendaTabIndex;
  } else {
    try {
      ProviderScope.containerOf(context, listen: false)
          .read(athleteShellTabIndexProvider.notifier)
          .state = athleteShellAgendaTabIndex;
    } catch (_) {
      // Sem Riverpod acima na árvore — initialIndex do discover resolve a aba.
    }
  }
  context.goNamed(
    AppRouteNames.discover,
    queryParameters: const {'tab': 'agenda'},
  );
}

void openDiscoverCompeteTab(BuildContext context, {WidgetRef? ref}) {
  if (ref != null) {
    ref.read(athleteShellTabIndexProvider.notifier).state =
        athleteShellCompeteTabIndex;
  } else {
    try {
      ProviderScope.containerOf(context, listen: false)
          .read(athleteShellTabIndexProvider.notifier)
          .state = athleteShellCompeteTabIndex;
    } catch (_) {
      // Sem Riverpod acima na árvore — initialIndex do discover resolve a aba.
    }
  }
  context.goNamed(
    AppRouteNames.discover,
    queryParameters: const {'tab': 'torneios'},
  );
}

void openDiscoverReservarTab(BuildContext context, {WidgetRef? ref}) {
  if (ref != null) {
    ref.read(athleteShellTabIndexProvider.notifier).state =
        athleteShellReservarTabIndex;
  } else {
    try {
      ProviderScope.containerOf(context, listen: false)
          .read(athleteShellTabIndexProvider.notifier)
          .state = athleteShellReservarTabIndex;
    } catch (_) {
      // Sem Riverpod acima na árvore — initialIndex do discover resolve a aba.
    }
  }
  context.goNamed(
    AppRouteNames.discover,
    queryParameters: const {'tab': 'reservar'},
  );
}
