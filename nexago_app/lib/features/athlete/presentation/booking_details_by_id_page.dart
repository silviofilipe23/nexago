import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../core/ui/app_status_views.dart';
import '../../arenas/domain/booking_providers.dart';
import '../../arenas/domain/my_booking_item.dart';
import '../domain/agenda/athlete_agenda_logic.dart';
import 'booking_details_page.dart';

/// Detalhe da reserva aberto só pelo id (`/booking/:bookingId/details`), para quem chega
/// sem os dados na mão — o push "Como foi o jogo?" (`arena_review_request`). Lê a reserva
/// e mostra o mesmo [BookingDetailsPage] das outras telas.
class BookingDetailsByIdPage extends ConsumerWidget {
  const BookingDetailsByIdPage({super.key, required this.bookingId});

  final String bookingId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final docAsync = ref.watch(arenaBookingDocProvider(bookingId));
    final doc = docAsync.valueOrNull;
    if (doc != null && doc.exists) {
      final item = MyBookingItem.fromFirestore(doc);
      final start = parseBookingDateTime(item.dateRaw, item.startTime);
      if (start != null) {
        final end = parseBookingDateTime(item.dateRaw, item.endTime);
        return BookingDetailsPage(
          bookingId: item.id,
          arenaId: item.arenaId,
          arenaName: item.arenaName,
          courtName: item.courtName ?? 'Quadra',
          startAt: start,
          endAt: end != null && end.isAfter(start)
              ? end
              : (end ?? start).add(
                  end == null
                      ? const Duration(hours: 1)
                      : const Duration(days: 1),
                ),
          status: item.rawStatus,
          confirmedParticipants: item.confirmedParticipants,
          amountReais: item.amountReais,
          paymentType: item.paymentType,
        );
      }
    }

    final Widget body;
    if (docAsync.isLoading) {
      body = const AppLoadingView(message: 'Carregando a reserva…');
    } else if (docAsync.hasError) {
      body = const AppInlineErrorView(
          message: 'Não foi possível carregar a reserva.');
    } else {
      body = const AppEmptyView(
        icon: Icons.event_busy_outlined,
        title: 'Reserva não encontrada',
        subtitle: 'Ela pode ter sido removida pela arena.',
      );
    }
    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      appBar: AppBar(backgroundColor: context.themeColors.canvas),
      body: body,
    );
  }
}
