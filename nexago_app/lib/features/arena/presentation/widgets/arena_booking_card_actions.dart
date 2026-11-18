import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/errors/friendly_error_message.dart';
import '../../../../core/formatting/app_currency_format.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../../arenas/domain/booking_providers.dart';
import '../../domain/arena_access_providers.dart';
import '../../domain/arena_booking_labels.dart';
import '../../domain/arena_manager_booking.dart';
import '../../domain/arena_staff_role.dart';
import '../../domain/comandas/arena_comanda.dart';
import '../../domain/comandas/arena_comanda_providers.dart';
import 'arena_athlete_contact.dart';

/// Ações rápidas do card na linha de hoje: Check-in, Receber o restante e
/// Conversar. Cada uma respeita a permissão de hoje: check-in escreve na
/// agenda, receber abre comanda (área comandas), conversar só lê.
class ArenaBookingCardActions extends ConsumerStatefulWidget {
  const ArenaBookingCardActions({
    super.key,
    required this.booking,
    required this.dueReais,
  });

  final ArenaManagerBooking booking;
  final double? dueReais;

  @override
  ConsumerState<ArenaBookingCardActions> createState() =>
      _ArenaBookingCardActionsState();
}

class _ArenaBookingCardActionsState
    extends ConsumerState<ArenaBookingCardActions> {
  bool _busy = false;

  ArenaManagerBooking get _b => widget.booking;

  @override
  Widget build(BuildContext context) {
    final athleteId = _b.athleteId.trim();
    final canCheckIn = ref.watch(arenaCanWriteProvider(ArenaArea.agenda)) &&
        athleteId.isNotEmpty &&
        arenaBookingShowsCheckInAction(_b.data);
    final due = widget.dueReais;
    final canReceive =
        ref.watch(arenaCanWriteProvider(ArenaArea.comandas)) && due != null;
    final canTalk = athleteId.isNotEmpty;
    if (!canCheckIn && !canReceive && !canTalk) return const SizedBox.shrink();

    final colors = context.themeColors;
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Row(
        children: [
          if (canCheckIn)
            Expanded(
              child: FilledButton.icon(
                key: Key('arena-booking-checkin-${_b.id}'),
                onPressed: _busy ? null : _checkIn,
                icon: _busy
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.how_to_reg_rounded, size: 18),
                label: const Text('Check-in'),
                style: _style(
                  background: AppColors.brand,
                  foreground: AppColors.black,
                ),
              ),
            ),
          if (canReceive) ...[
            if (canCheckIn) const SizedBox(width: 8),
            Expanded(
              child: FilledButton(
                key: Key('arena-booking-receive-${_b.id}'),
                onPressed: () => _receive(context),
                style: _style(
                  background: colors.surfaceRaised,
                  foreground: colors.onSurface,
                ),
                // O valor já está no card ("falta R$ …"); o botão fica curto
                // para caber ao lado do Check-in.
                child: Semantics(
                  label: 'Receber ${formatBRL(due)}',
                  excludeSemantics: true,
                  child: const Text('Receber', maxLines: 1),
                ),
              ),
            ),
          ],
          if (canTalk) ...[
            if (canCheckIn || canReceive) const SizedBox(width: 8),
            IconButton.filledTonal(
              key: Key('arena-booking-talk-${_b.id}'),
              tooltip: 'Conversar com o atleta',
              onPressed: () => contactArenaAthlete(context, ref, athleteId),
              style: IconButton.styleFrom(
                backgroundColor: colors.surfaceRaised,
                foregroundColor: colors.onSurface,
                minimumSize: const Size(44, 44),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              icon: const Icon(Icons.chat_bubble_outline_rounded, size: 18),
            ),
          ],
        ],
      ),
    );
  }

  ButtonStyle _style({required Color background, required Color foreground}) =>
      FilledButton.styleFrom(
        backgroundColor: background,
        foregroundColor: foreground,
        minimumSize: const Size(0, 44),
        padding: const EdgeInsets.symmetric(horizontal: 10),
        // textStyle sem família perde a Sora (cai na fonte do sistema).
        textStyle: const TextStyle(
          fontFamily: AppTypography.fontFamily,
          fontSize: 13,
          fontWeight: FontWeight.w700,
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      );

  Future<void> _checkIn() async {
    setState(() => _busy = true);
    await runArenaBookingCheckIn(context, ref, _b);
    if (mounted) setState(() => _busy = false);
  }

  void _receive(BuildContext context) =>
      openArenaBookingReceive(context, ref, _b);
}

/// Faz o check-in da reserva pelo balcão (mesmo `checkIn` do detalhe) e
/// avisa o resultado. Devolve se deu certo.
Future<bool> runArenaBookingCheckIn(
  BuildContext context,
  WidgetRef ref,
  ArenaManagerBooking booking,
) async {
  try {
    await ref.read(bookingServiceProvider).checkIn(
          bookingId: booking.id,
          athleteId: booking.athleteId,
          locationVerified: true,
        );
    if (context.mounted) showAppSnackBar(context, 'Check-in registrado.');
    return true;
  } catch (e) {
    if (context.mounted) {
      showAppSnackBar(
        context,
        friendlyErrorMessage(
          e,
          action: 'Não foi possível fazer o check-in',
          logReason: 'arena_bookings:check_in',
        ),
        isError: true,
      );
    }
    return false;
  }
}

/// Abre a comanda individual já ligada à reserva: a locação entra como item
/// e o restante é cobrado no fechamento, como no balcão.
void openArenaBookingReceive(
  BuildContext context,
  WidgetRef ref,
  ArenaManagerBooking booking,
) {
  ref.read(arenaComandaDraftProvider.notifier)
    ..reset()
    ..setType(ArenaComandaType.individual)
    ..selectBooking(booking);
  context.pushNamed(AppRouteNames.arenaComandaNewCustomer);
}
