import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:nexago_app/core/router/routes.dart';
import '../../domain/arena_manager_booking.dart';
import '../../domain/arena_slot_detail_providers.dart';

/// Quem está na reserva, em uma linha: aula, cliente do balcão ou atleta.
String? arenaNowStaticWho(ArenaManagerBooking b) {
  if (b.isClassBlock) return 'Aula';
  final customer = b.customerName;
  if (customer != null) return customer;
  if (b.athleteId.trim().isEmpty) return 'Reserva';
  return null;
}

/// Texto com o nome de quem reservou (busca o atleta quando preciso).
class ArenaNowBookingWho extends ConsumerWidget {
  const ArenaNowBookingWho({super.key, required this.booking, this.style});

  final ArenaManagerBooking booking;
  final TextStyle? style;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final fixed = arenaNowStaticWho(booking);
    final String label =
        fixed ??
        ref
            .watch(athleteDisplayLabelProvider(booking.athleteId.trim()))
            .maybeWhen<String>(data: (v) => v, orElse: () => 'Reserva');
    return Text(
      label,
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: style,
    );
  }
}

/// Abre o detalhe da reserva (ou a lista de aulas, no bloqueio de aula).
void openArenaNowBooking(BuildContext context, ArenaManagerBooking booking) {
  if (booking.isClassBlock) {
    context.pushNamed(AppRouteNames.arenaClasses);
    return;
  }
  context.pushNamed(
    AppRouteNames.arenaBookingDetail,
    pathParameters: {'bookingId': booking.id},
    extra: booking,
  );
}
