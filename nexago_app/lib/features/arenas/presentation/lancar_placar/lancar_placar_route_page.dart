import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../domain/booking_providers.dart';
import '../../domain/booking_story.dart';
import '../../domain/my_booking_item.dart';
import 'lancar_placar_page.dart';

/// `/reservar/placar/:bookingId` — o push "Como foi o jogo?" e o do placar
/// sugerido abrem aqui: lê a reserva e entra no "Lançar placar".
class LancarPlacarRoutePage extends ConsumerWidget {
  const LancarPlacarRoutePage({super.key, required this.bookingId});

  final String bookingId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final async = ref.watch(arenaBookingDocProvider(bookingId));
    final snap = async.valueOrNull;
    if (async.isLoading && snap == null) {
      return Scaffold(
        backgroundColor: colors.canvas,
        body: const Center(
          child: CircularProgressIndicator(color: AppColors.brand),
        ),
      );
    }
    if (snap == null || !snap.exists) {
      return Scaffold(
        backgroundColor: colors.canvas,
        appBar: AppBar(backgroundColor: colors.canvas),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              'Não achamos esta reserva.',
              textAlign: TextAlign.center,
              style: TextStyle(color: colors.onSurface),
            ),
          ),
        ),
      );
    }
    final booking = MyBookingItem.fromFirestore(snap);
    return LancarPlacarPage(
      args: BookingStoryArgs.fromBooking(booking),
      presetSport: booking.sport,
    );
  }
}
