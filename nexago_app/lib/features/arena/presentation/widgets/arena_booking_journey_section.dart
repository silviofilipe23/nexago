import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../domain/arena_access_providers.dart';
import '../../domain/arena_booking_journey.dart';
import '../../domain/arena_manager_booking.dart';
import '../../domain/arena_now_providers.dart';
import '../../domain/arena_slot_detail_providers.dart';
import '../../domain/arena_staff_role.dart';
import '../../domain/comandas/arena_comanda.dart';
import '../../domain/comandas/arena_comanda_providers.dart';
import 'arena_booking_card_actions.dart';
import 'arena_booking_court_bill.dart';
import 'arena_booking_journey_steps.dart';
import 'arena_booking_live_hero.dart';

/// Jornada ao vivo do detalhe da reserva: anel do tempo, etapas com as suas
/// ações e a conta da quadra (hora + comanda).
///
/// As ações são as mesmas do card da lista: check-in pelo balcão
/// ([runArenaBookingCheckIn]) e receber pela comanda ligada à reserva
/// ([openArenaBookingReceive]).
class ArenaBookingJourneySection extends ConsumerStatefulWidget {
  const ArenaBookingJourneySection({
    super.key,
    required this.booking,
    required this.whoLabel,
  });

  final ArenaManagerBooking booking;
  final String whoLabel;

  @override
  ConsumerState<ArenaBookingJourneySection> createState() =>
      _ArenaBookingJourneySectionState();
}

class _ArenaBookingJourneySectionState
    extends ConsumerState<ArenaBookingJourneySection> {
  bool _checkInBusy = false;

  ArenaManagerBooking get _b => widget.booking;

  @override
  Widget build(BuildContext context) {
    final now = ref.watch(arenaNowClockProvider).valueOrNull ?? DateTime.now();
    final comanda =
        ref.watch(arenaComandaByBookingIdStreamProvider(_b.id)).valueOrNull;
    final journey = buildArenaBookingJourney(_b, now: now, comanda: comanda);
    final canAgenda = ref.watch(arenaCanWriteProvider(ArenaArea.agenda));
    final canComandas = ref.watch(arenaCanWriteProvider(ArenaArea.comandas));
    // Comanda fechada não recebe item novo, e abrir outra cobraria a hora
    // de novo: "Adicionar consumo" só com comanda aberta ou sem comanda.
    final canAddConsumption = canComandas &&
        !journey.isCanceled &&
        (comanda == null || comanda.status.isActive);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ArenaBookingLiveHero(
          booking: _b,
          journey: journey,
          whoLabel: widget.whoLabel,
        ),
        if (!journey.isCanceled) ...[
          const SizedBox(height: 14),
          ArenaBookingJourneySteps(
            journey: journey,
            checkInBusy: _checkInBusy,
            onCheckIn: canAgenda ? _checkIn : null,
            onReceive: canComandas ? () => _receive(comanda) : null,
          ),
        ],
        const SizedBox(height: 14),
        ArenaBookingCourtBill(
          bill: journey.bill,
          bookingData: _b.data,
          timeRange: '${_b.startTime}–${_b.endTime}',
          onAddConsumption:
              canAddConsumption ? () => _addConsumption(comanda) : null,
        ),
      ],
    );
  }

  Future<void> _checkIn() async {
    setState(() => _checkInBusy = true);
    final ok = await runArenaBookingCheckIn(context, ref, _b);
    if (!mounted) return;
    if (ok) ref.invalidate(arenaBookingDetailMapProvider(_b.id));
    setState(() => _checkInBusy = false);
  }

  void _receive(ArenaComanda? comanda) {
    if (comanda == null) {
      openArenaBookingReceive(context, ref, _b);
      return;
    }
    context.pushNamed(
      comanda.status.isActive
          ? AppRouteNames.arenaComandaPayment
          : AppRouteNames.arenaComandaDetail,
      pathParameters: {'comandaId': comanda.id},
    );
  }

  void _addConsumption(ArenaComanda? comanda) {
    if (comanda == null) {
      openArenaBookingReceive(context, ref, _b);
      return;
    }
    context.pushNamed(
      AppRouteNames.arenaComandaQuickAdd,
      pathParameters: {'comandaId': comanda.id},
    );
  }
}
