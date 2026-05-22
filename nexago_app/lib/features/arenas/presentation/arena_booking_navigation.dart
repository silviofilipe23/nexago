import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../athlete/domain/athlete_shell_providers.dart';
import '../domain/arena_list_item.dart';
import '../domain/arena_slot.dart';

void openArenaDetail(BuildContext context, ArenaListItem arena) {
  context.pushNamed(
    AppRouteNames.arenaDetail,
    pathParameters: {'arenaId': arena.id},
    extra: arena,
  );
}

void openArenaBookingSlots(
  BuildContext context, {
  required ArenaListItem arena,
  required ArenaSlot? slot,
  required DateTime date,
}) {
  final y = date.year.toString().padLeft(4, '0');
  final m = date.month.toString().padLeft(2, '0');
  final d = date.day.toString().padLeft(2, '0');
  final dateKey = '$y-$m-$d';
  context.pushNamed(
    AppRouteNames.arenaSlots,
    pathParameters: {'arenaId': arena.id},
    queryParameters: <String, String>{
      if (slot?.courtId.trim().isNotEmpty == true)
        'courtId': slot!.courtId.trim(),
      if (slot?.startTime.trim().isNotEmpty == true)
        'startTime': slot!.startTime.trim(),
      'date': dateKey,
    },
    extra: arena,
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
