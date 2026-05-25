import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/fade_slide_in.dart';
import '../domain/arena_booking_labels.dart';
import '../domain/arena_booking_success_actions.dart';
import '../domain/arena_booking_success_args.dart';
import '../domain/arenas_providers.dart';
import 'widgets/booking_success/booking_success_action_grid.dart';
import 'widgets/booking_success/booking_success_confetti.dart';
import 'widgets/booking_success/booking_success_header.dart';
import 'widgets/booking_success/booking_success_ticket_card.dart';

export '../domain/arena_booking_success_args.dart' show BookingSuccessArgs;

/// Confirmação após `createBookingAtomically` ou PIX pago.
class BookingSuccessPage extends ConsumerWidget {
  const BookingSuccessPage({super.key, this.args});

  final BookingSuccessArgs? args;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = GoRouterState.of(context);
    final q = state.uri.queryParameters;
    final extraFromState = state.extra is BookingSuccessArgs
        ? state.extra! as BookingSuccessArgs
        : null;
    final resolved = _resolveArgs(
      extra: extraFromState ?? args,
      query: q,
      pathArenaId: state.pathParameters['arenaId'],
    );

    if (resolved == null) {
      return _successScaffold(
        body: Center(
          child: TextButton(
            onPressed: () => context.go(AppRoutes.discover),
            child: const Text('Voltar ao início'),
          ),
        ),
      );
    }

    final arenaAsync = resolved.arenaId.isNotEmpty
        ? ref.watch(arenaByIdProvider(resolved.arenaId))
        : null;
    final arena = arenaAsync?.valueOrNull;

    final bookingId = resolved.primaryBookingId ?? '';
    final paymentSubtitle = ArenaBookingSuccessActions.formatPaymentSubtitle(
      paymentApproved: resolved.paymentApproved,
      amountReais: resolved.amountReais,
      bookingId: bookingId.isEmpty ? '—' : bookingId,
    );
    final ticketDate = formatTicketDateCompact(resolved.dateKey);
    final ticketTime = _ticketTimeRange(resolved.startTime, resolved.endTime);
    final locationLabel = '${resolved.arenaName} · ${resolved.courtName}';
    final statusBarHeight = MediaQuery.paddingOf(context).top;
    final confettiFallHeight = statusBarHeight + 300;

    return Scaffold(
      backgroundColor: AppColors.canvas,
      body: Stack(
        children: [
          Positioned(
            top: -80,
            left: 0,
            right: 0,
            child: Container(
              height: 220,
              decoration: BoxDecoration(
                gradient: RadialGradient(
                  center: Alignment.topCenter,
                  radius: 1.2,
                  colors: [
                    AppColors.win.withValues(alpha: 0.12),
                    Colors.transparent,
                  ],
                ),
              ),
            ),
          ),
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            height: confettiFallHeight,
            child: IgnorePointer(
              child: BookingSuccessConfetti(statusBarHeight: statusBarHeight),
            ),
          ),
          SafeArea(
            child: FadeSlideIn(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
                child: Column(
                  children: [
                    BookingSuccessHeader(paymentSubtitle: paymentSubtitle),
                    const SizedBox(height: 24),
                    BookingSuccessTicketCard(
                      dateCompact: ticketDate,
                      timeRange: ticketTime,
                      locationLabel: locationLabel,
                      qrPayload: bookingId,
                    ),
                    const SizedBox(height: 20),
                    BookingSuccessActionGrid(
                      onCalendar: () =>
                          _openCalendar(context, resolved, locationLabel),
                      onShare: () => _shareBooking(context, resolved),
                      onWhatsApp: () =>
                          _openWhatsApp(context, resolved, arena?.whatsapp),
                      onDirections: () => _openMaps(
                        context,
                        arenaName: resolved.arenaName,
                        locationLabel: arena?.locationLabel,
                        addressLine: arena?.addressLine,
                      ),
                    ),
                    const SizedBox(height: 24),
                    SizedBox(
                      width: double.infinity,
                      height: 52,
                      child: FilledButton(
                        onPressed: () => context.go(AppRoutes.myBookings),
                        style: FilledButton.styleFrom(
                          backgroundColor: AppColors.brand,
                          foregroundColor: AppColors.black,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(999),
                          ),
                        ),
                        child: const Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(
                              'Ver minha reserva',
                              style: TextStyle(
                                fontWeight: FontWeight.w900,
                                fontSize: 15,
                              ),
                            ),
                            SizedBox(width: 6),
                            Icon(Icons.arrow_forward_rounded, size: 20),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextButton(
                      onPressed: () => context.go(AppRoutes.discover),
                      child: Text(
                        'Voltar ao início',
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: AppColors.onSurfaceMuted,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  static Widget _successScaffold({required Widget body}) {
    return Scaffold(
      backgroundColor: AppColors.canvas,
      body: body,
    );
  }

  static String _ticketTimeRange(String start, String end) {
    final s = start.length >= 5 ? start.substring(0, 5) : start;
    final e = end.length >= 5 ? end.substring(0, 5) : end;
    if (s.isEmpty && e.isEmpty) return '—';
    return '$s - $e'.trim();
  }

  Future<void> _shareBooking(
    BuildContext context,
    BookingSuccessArgs resolved,
  ) async {
    final id = resolved.primaryBookingId ?? '';
    final text = ArenaBookingSuccessActions.buildBookingShareMessage(
      arenaName: resolved.arenaName,
      courtName: resolved.courtName,
      dateLabel: resolved.dateLabel,
      timeRangeLabel: resolved.timeRangeLabel,
      bookingId: id,
    );
    await Share.share(text);
  }

  Future<void> _openCalendar(
    BuildContext context,
    BookingSuccessArgs resolved,
    String locationLabel,
  ) async {
    final url = ArenaBookingSuccessActions.buildGoogleCalendarEventUrl(
      title: 'Reserva · ${resolved.arenaName}',
      dateKey: resolved.dateKey,
      startTime: resolved.startTime,
      endTime: resolved.endTime,
      details: resolved.primaryBookingId != null
          ? 'Código ${ArenaBookingSuccessActions.formatBookingDisplayCode(resolved.primaryBookingId!)}'
          : null,
      location: locationLabel,
    );
    if (url == null) {
      if (context.mounted) {
        showAppSnackBar(
          context,
          'Não foi possível montar o evento.',
          isError: true,
        );
      }
      return;
    }
    final uri = Uri.parse(url);
    if (!await canLaunchUrl(uri)) {
      if (context.mounted) {
        showAppSnackBar(
          context,
          'Não foi possível abrir o calendário.',
          isError: true,
        );
      }
      return;
    }
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  Future<void> _openWhatsApp(
    BuildContext context,
    BookingSuccessArgs resolved,
    String? whatsapp,
  ) async {
    final id = resolved.primaryBookingId ?? '';
    final message = ArenaBookingSuccessActions.buildBookingShareMessage(
      arenaName: resolved.arenaName,
      courtName: resolved.courtName,
      dateLabel: resolved.dateLabel,
      timeRangeLabel: resolved.timeRangeLabel,
      bookingId: id,
    );
    final url = ArenaBookingSuccessActions.buildWhatsAppUrl(
      phone: whatsapp,
      message: message,
    );
    if (url == null) {
      if (context.mounted) {
        showAppSnackBar(
          context,
          'Esta arena ainda não cadastrou WhatsApp. Use Compartilhar para enviar aos amigos.',
        );
      }
      return;
    }
    final uri = Uri.parse(url);
    if (!await canLaunchUrl(uri)) {
      if (context.mounted) {
        showAppSnackBar(
          context,
          'Não foi possível abrir o WhatsApp.',
          isError: true,
        );
      }
      return;
    }
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  Future<void> _openMaps(
    BuildContext context, {
    required String arenaName,
    String? locationLabel,
    String? addressLine,
  }) async {
    final query = ArenaBookingSuccessActions.mapsQueryFromArena(
      arenaName: arenaName,
      locationLabel: locationLabel,
      addressLine: addressLine,
    );
    final uri = Uri.parse(ArenaBookingSuccessActions.buildMapsSearchUrl(query));
    if (!await canLaunchUrl(uri)) {
      if (context.mounted) {
        showAppSnackBar(
          context,
          'Não foi possível abrir o Google Maps.',
          isError: true,
        );
      }
      return;
    }
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  static BookingSuccessArgs? _resolveArgs({
    required BookingSuccessArgs? extra,
    required Map<String, String> query,
    String? pathArenaId,
  }) {
    if (extra != null && extra.arenaName.isNotEmpty) {
      return _fillFromQuery(extra, query, pathArenaId);
    }

    final arenaId = (query['arenaId'] ?? pathArenaId ?? '').trim();
    final arenaName = query['arenaName'] ?? 'Arena';
    final courtName = query['courtName'] ?? 'Quadra';
    final dateRaw = query['date'] ?? '';
    final start = query['startTime'] ?? '';
    final end = query['endTime'] ?? '';
    final bookingId = query['bookingId']?.trim();
    final amountRaw = query['amountReais'];
    final payment = query['payment'] ?? '';

    if (dateRaw.length < 10) return null;

    final dateKey = dateRaw.length >= 10 ? dateRaw.substring(0, 10) : dateRaw;
    String dateLabel = dateRaw;
    final d = DateTime.tryParse(dateKey);
    if (d != null) {
      dateLabel = DateFormat('d MMM yyyy', 'pt_BR').format(d);
    }
    final timeRangeLabel = (start.isNotEmpty && end.isNotEmpty)
        ? '$start – $end'
        : '';
    final amount = amountRaw != null ? double.tryParse(amountRaw) : null;
    final paymentApproved = payment == 'pix_ok' || payment == 'mp_ok';

    return BookingSuccessArgs(
      arenaId: arenaId,
      arenaName: arenaName,
      courtName: courtName,
      dateKey: dateKey,
      startTime: start.length >= 5 ? start.substring(0, 5) : start,
      endTime: end.length >= 5 ? end.substring(0, 5) : end,
      dateLabel: dateLabel,
      timeRangeLabel: timeRangeLabel,
      bookingIds: bookingId != null && bookingId.isNotEmpty
          ? <String>[bookingId]
          : const [],
      amountReais: amount,
      paymentApproved: paymentApproved,
    );
  }

  static BookingSuccessArgs _fillFromQuery(
    BookingSuccessArgs extra,
    Map<String, String> query,
    String? pathArenaId,
  ) {
    final bookingId = extra.primaryBookingId ?? query['bookingId'];
    final payment = query['payment'] ?? '';
    final paymentApproved =
        extra.paymentApproved || payment == 'pix_ok' || payment == 'mp_ok';
    final amountRaw = query['amountReais'];
    final amount =
        extra.amountReais ??
        (amountRaw != null ? double.tryParse(amountRaw) : null);

    return BookingSuccessArgs(
      arenaId: extra.arenaId.isNotEmpty
          ? extra.arenaId
          : (query['arenaId'] ?? pathArenaId ?? ''),
      arenaName: extra.arenaName,
      courtName: extra.courtName,
      dateKey: extra.dateKey.isNotEmpty
          ? extra.dateKey
          : (query['date']?.length == 10 ? query['date']! : ''),
      startTime: extra.startTime,
      endTime: extra.endTime,
      dateLabel: extra.dateLabel,
      timeRangeLabel: extra.timeRangeLabel,
      bookingIds: extra.bookingIds.isNotEmpty
          ? extra.bookingIds
          : (bookingId != null && bookingId.isNotEmpty
                ? <String>[bookingId]
                : const []),
      amountReais: amount,
      paymentApproved: paymentApproved,
      amountLabel: extra.amountLabel,
      paymentLabel: extra.paymentLabel,
      headline: extra.headline,
    );
  }
}
