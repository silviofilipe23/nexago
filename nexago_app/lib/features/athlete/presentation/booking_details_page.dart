import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/ui/nexa_share.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/formatting/app_date_format.dart';
import '../../../core/formatting/app_currency_format.dart';

import '../../../core/auth/auth_providers.dart';
import '../../arena/domain/arena_booking_labels.dart';
import '../../arena_orders/presentation/arena_app_orders_catalog_page.dart';
import '../../arenas/domain/arena_booking_cancellation_policy.dart';
import '../../arenas/domain/arena_booking_success_actions.dart';
import '../../arenas/domain/arenas_providers.dart';
import '../../arenas/domain/booking_providers.dart';
import '../../arenas/presentation/widgets/booking_cancellation_confirm_dialog.dart';
import '../../weather/domain/weather_models.dart' show WeatherRelease;
import '../../weather/presentation/widgets/booking_weather_section.dart';
import '../domain/booking_attendance_providers.dart';
import '../domain/booking_invite_status.dart' show bookingOwnerUidOf;
import 'widgets/booking_details/booking_details_actions_section.dart';
import 'widgets/booking_details/booking_details_app_bar.dart';
import 'widgets/booking_details/booking_details_policy_cards.dart';
import 'widgets/booking_details/booking_details_hero_card.dart';
import 'widgets/booking_details/booking_details_location_section.dart';
import 'widgets/booking_details/booking_details_payment_section.dart';
import 'widgets/booking_details/booking_details_team_section.dart';
import 'widgets/booking_details/booking_details_view_model.dart';
import '../../../core/errors/friendly_error_message.dart';

export 'widgets/booking_details/booking_details_view_model.dart'
    show BookingDetailsStatus, bookingDetailsStatus;

class BookingDetailsPage extends ConsumerStatefulWidget {
  const BookingDetailsPage({
    super.key,
    required this.bookingId,
    required this.arenaId,
    required this.arenaName,
    required this.courtName,
    required this.startAt,
    required this.endAt,
    required this.status,
    required this.confirmedParticipants,
    this.amountReais,
    this.paymentType,
  });

  final String bookingId;
  final String? arenaId;
  final String arenaName;
  final String courtName;
  final DateTime startAt;
  final DateTime endAt;
  final String status;
  final int confirmedParticipants;
  final double? amountReais;
  final String? paymentType;

  @override
  ConsumerState<BookingDetailsPage> createState() => _BookingDetailsPageState();
}

class _BookingDetailsPageState extends ConsumerState<BookingDetailsPage> {
  Timer? _ticker;
  DateTime _now = DateTime.now();
  bool _confirmingAttendance = false;
  bool _checkingIn = false;
  bool _attendancePulse = false;
  bool _locationVerified = false;
  bool _sharing = false;

  @override
  void initState() {
    super.initState();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() => _now = DateTime.now());
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final arenaAsync = widget.arenaId == null
        ? null
        : ref.watch(arenaByIdProvider(widget.arenaId!));
    final arena = arenaAsync?.valueOrNull;

    final bookingSnap = ref
        .watch(arenaBookingDocProvider(widget.bookingId))
        .valueOrNull;
    final bookingData = bookingSnap?.data();

    // A reserva pode ser cancelada com a tela aberta (ex.: chuva): o doc vivo
    // manda no "cancelada"; o resto segue o status que abriu a tela.
    final rawStatus = bookingDetailsLiveStatus(widget.status, bookingData);
    final detailsStatus = bookingDetailsStatus(
      _now,
      widget.startAt,
      widget.endAt,
      rawStatus,
    );
    final hero = buildBookingDetailsHeroModel(
      now: _now,
      bookingId: widget.bookingId,
      arenaName: widget.arenaName,
      courtName: widget.courtName,
      startAt: widget.startAt,
      endAt: widget.endAt,
      rawStatus: rawStatus,
      cancelReason: bookingData?['cancelReason'] is String
          ? bookingData!['cancelReason'] as String
          : null,
    );

    final address = arena?.addressLine?.trim().isNotEmpty == true
        ? arena!.addressLine!.trim()
        : (arena?.locationLabel ?? 'Local a confirmar');

    final amountValue =
        widget.amountReais ?? (bookingData?['amountReais'] as num?)?.toDouble();
    final paymentLabel = amountValue != null
        ? formatBRL(amountValue)
        : 'A confirmar';

    final paymentTypeLabel = arenaBookingPaymentLabel(bookingData);
    final paymentMethod = paymentTypeLabel != '—'
        ? paymentTypeLabel
        : bookingDetailsPaymentTypeLabel(widget.paymentType);

    final ps = (bookingData?['paymentStatus'] as String?)?.toLowerCase().trim();
    final paidOnline = (bookingData?['amountPaidOnlineReais'] as num?)
        ?.toDouble();
    final showSplit = bookingDetailsShowSplitCard(
      paymentStatus: ps,
      paidOnline: paidOnline,
    );
    final splitLabel = formatSplitPerPersonLabel(amountValue);

    final attendance = ref
        .watch(bookingAttendanceProvider(widget.bookingId))
        .valueOrNull;

    // Ocorrência de horário fixo (mensalista): criada pela arena; alterações
    // e cancelamento são acertados direto com a arena.
    final isRecurring = bookingData?['isRecurring'] == true ||
        (bookingData?['recurringBookingId'] as String?)?.trim().isNotEmpty ==
            true;

    // Convidado (entrou pela lista do jogo): cancelar, pagar, confirmar
    // presença, check-in e pedido na quadra são do dono da reserva.
    final viewerUid = ref.watch(authProvider).valueOrNull?.uid;
    final ownerUid =
        bookingData == null ? null : bookingOwnerUidOf(bookingData);
    final isGuest =
        viewerUid != null && ownerUid != null && ownerUid != viewerUid;

    // Liberada por chuva e sem escolha ainda: o cancelamento comum some (o
    // atleta perderia a opção de crédito); a escolha fica no aviso de chuva.
    final weatherChoicePending =
        WeatherRelease.fromBooking(bookingData)?.isPendingChoice ?? false;

    final cancellation = ArenaBookingCancellationPolicy.athleteCancellation(
      bookingStart: widget.startAt,
      now: _now,
      rawStatus: rawStatus,
      isRecurring: isRecurring,
      isGuest: isGuest,
      weatherChoicePending: weatherChoicePending,
    );
    final canCancel = cancellation == AthleteBookingCancellation.allowed;
    final actionsEnabled = bookingDetailsActionsEnabled(detailsStatus);

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      appBar: BookingDetailsAppBar(
        onShare: _shareBooking,
        onCancel: _cancelBooking,
        showCancel: canCancel,
      ),
      // Chuva (A1 liberada / A6 pedido em análise): ações fixas no rodapé.
      // Fora desses casos não ocupa espaço.
      bottomNavigationBar: BookingWeatherBottomBar(
        bookingId: widget.bookingId,
        booking: bookingData,
        arenaName: widget.arenaName,
        now: _now,
        fallbackArenaId: widget.arenaId,
      ),
      // bottomNavigationBar: BookingDetailsBottomBar(
      //   onAddToCalendar: _addToCalendar,
      //   inviteEnabled: actionsEnabled,
      //   actionsEnabled: actionsEnabled,
      // ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
        children: [
          BookingDetailsHeroCard(model: hero),
          BookingWeatherSection(
            bookingId: widget.bookingId,
            booking: bookingData,
            arenaName: widget.arenaName,
            now: _now,
            fallbackArenaId: widget.arenaId,
          ),
          const SizedBox(height: 14),
          BookingDetailsTeamSection(
            bookingId: widget.bookingId,
            arenaName: widget.arenaName,
            startAt: widget.startAt,
            inviteEnabled: actionsEnabled,
            onLeft: () => Navigator.of(context).maybePop(),
          ),
          const SizedBox(height: 14),
          BookingDetailsLocationSection(
            arena: arena,
            address: address,
            onOpenMaps: actionsEnabled ? () => _openMaps(address) : null,
          ),
          if (!isGuest) ...[
            const SizedBox(height: 14),
            BookingDetailsPaymentSection(
              startAt: widget.startAt,
              endAt: widget.endAt,
              amountLabel: paymentLabel,
              paymentMethodLabel: paymentMethod,
              showSplitCard: showSplit,
              splitPerPersonLabel: splitLabel,
            ),
            const SizedBox(height: 14),
            BookingDetailsAttendanceContent(
              attendance: attendance,
              bookingStatus: detailsStatus,
              startAt: widget.startAt,
              confirmedParticipantsFallback: widget.confirmedParticipants,
              confirmingAttendance: _confirmingAttendance,
              checkingIn: _checkingIn,
              attendancePulse: _attendancePulse,
              locationVerified: _locationVerified,
              onConfirmAttendance: _confirmAttendance,
              onLocationVerifiedChanged: (v) =>
                  setState(() => _locationVerified = v),
              onCheckIn: _checkInNow,
            ),
            if (isRecurring || !weatherChoicePending)
              const SizedBox(height: 14),
            if (isRecurring)
              _RecurringBookingNoteCard(arenaName: widget.arenaName)
            else if (!weatherChoicePending)
              // Liberada por chuva: a regra de cancelamento não vale agora.
              BookingDetailsCancellationCard(arenaName: widget.arenaName),
          ],
          const SizedBox(height: 14),
          BookingDetailsActionsSection(
            onDirections: () => _openMaps(address),
            onShare: _shareBooking,
            onCancel: canCancel ? _cancelBooking : null,
            onOrderAtCourt:
                widget.arenaId == null || isGuest ? null : _openOrderAtCourt,
            shareLoading: _sharing,
            canCancel: canCancel,
            actionsEnabled: actionsEnabled,
            showCancel: !isGuest && !weatherChoicePending,
            cancelHint:
                cancellation == AthleteBookingCancellation.deadlinePassed
                ? ArenaBookingCancellationPolicy.blockedCancellationMessage(
                    arenaName: widget.arenaName,
                  )
                : null,
          ),
          const SizedBox(height: 88),
        ],
      ),
    );
  }

  Future<void> _confirmAttendance() async {
    if (_confirmingAttendance) return;
    setState(() {
      _confirmingAttendance = true;
      _attendancePulse = true;
    });
    try {
      await ref.read(confirmAttendanceProvider).confirm(widget.bookingId);
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          const SnackBar(
            content: Text('Presença confirmada com sucesso! +5 XP'),
          ),
        );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(content: Text(
            friendlyErrorMessage(
              e,
              action: 'Não foi possível confirmar presença',
              logReason: 'reserva:confirmar_presenca',
            ),
          )),
        );
    } finally {
      if (mounted) {
        setState(() => _confirmingAttendance = false);
        Future<void>.delayed(const Duration(milliseconds: 250), () {
          if (!mounted) return;
          setState(() => _attendancePulse = false);
        });
      }
    }
  }

  Future<void> _checkInNow() async {
    if (_checkingIn) return;
    setState(() => _checkingIn = true);
    try {
      await ref
          .read(checkInProvider)
          .checkIn(
            bookingId: widget.bookingId,
            locationVerified: _locationVerified,
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          const SnackBar(content: Text('Check-in realizado com sucesso!')),
        );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(content: Text(
            friendlyErrorMessage(
              e,
              action: 'Não foi possível fazer check-in',
              logReason: 'reserva:check_in',
            ),
          )),
        );
    } finally {
      if (mounted) setState(() => _checkingIn = false);
    }
  }

  void _openOrderAtCourt() {
    final arenaId = widget.arenaId;
    if (arenaId == null || arenaId.isEmpty) return;
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ArenaAppOrdersCatalogPage(
          arenaId: arenaId,
          bookingId: widget.bookingId,
          arenaName: widget.arenaName,
        ),
      ),
    );
  }

  Future<void> _openMaps(String address) async {
    final uri = Uri.parse(
      ArenaBookingSuccessActions.buildMapsSearchUrl(address),
    );
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  Future<void> _shareBooking() async {
    if (_sharing) return;
    setState(() => _sharing = true);
    try {
      final dateLabel = DateFormat(
        "d 'de' MMMM",
        'pt_BR',
      ).format(widget.startAt);
      final text = ArenaBookingSuccessActions.buildBookingShareMessage(
        arenaName: widget.arenaName,
        courtName: widget.courtName,
        dateLabel: dateLabel,
        timeRangeLabel:
            '${DateFormat('HH:mm', 'pt_BR').format(widget.startAt)} - ${DateFormat('HH:mm', 'pt_BR').format(widget.endAt)}',
        bookingId: widget.bookingId,
      );
      if (!mounted) return;
      await nexaShareText(context, text);
    } finally {
      if (mounted) setState(() => _sharing = false);
    }
  }

  Future<void> _addToCalendar() async {
    final dateKey = calendarDateKey(widget.startAt);
    final url = ArenaBookingSuccessActions.buildGoogleCalendarEventUrl(
      title: 'Reserva · ${widget.arenaName}',
      dateKey: dateKey,
      startTime: DateFormat('HH:mm').format(widget.startAt),
      endTime: DateFormat('HH:mm').format(widget.endAt),
      details:
          'Código ${ArenaBookingSuccessActions.formatBookingDisplayCode(widget.bookingId)}',
      location: widget.arenaName,
    );
    if (url == null) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Não foi possível montar o evento.')),
      );
      return;
    }
    final uri = Uri.parse(url);
    if (!await canLaunchUrl(uri)) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Não foi possível abrir o calendário.')),
      );
      return;
    }
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  Future<void> _cancelBooking() async {
    final uid = ref.read(authProvider).valueOrNull?.uid;
    if (uid == null || uid.isEmpty) return;
    final confirmed = await confirmBookingCancellation(
      context,
      arenaName: widget.arenaName,
      courtName: widget.courtName,
      startAt: widget.startAt,
    );
    if (!confirmed || !mounted) return;
    try {
      await ref
          .read(bookingServiceProvider)
          .cancelBooking(bookingId: widget.bookingId, athleteId: uid);
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Reserva cancelada.')));
      Navigator.of(context).pop();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(
          friendlyErrorMessage(
            e,
            action: 'Não foi possível cancelar',
            logReason: 'reserva:cancelar',
          ),
        )));
    }
  }
}

/// Substitui o card de política de cancelamento em reservas de horário fixo:
/// a série é gerida pela arena, sem cancelamento pelo app.
class _RecurringBookingNoteCard extends StatelessWidget {
  const _RecurringBookingNoteCard({required this.arenaName});

  final String arenaName;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.event_repeat_rounded, size: 20, color: colors.onSurfaceMuted),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Horário fixo',
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: colors.onSurface,
                      ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Esta reserva faz parte do seu horário fixo semanal. Para '
                  'alterações ou cancelamento, fale direto com $arenaName.',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: colors.onSurfaceMuted,
                        height: 1.4,
                      ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
