import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/auth/auth_providers.dart';
import '../../arena/domain/arena_booking_labels.dart';
import '../../arenas/domain/arena_booking_success_actions.dart';
import '../../arenas/domain/arenas_providers.dart';
import '../../arenas/domain/booking_providers.dart';
import '../domain/booking_attendance_providers.dart';
import 'widgets/booking_details/booking_details_actions_section.dart';
import 'widgets/booking_details/booking_details_app_bar.dart';
import 'widgets/booking_details/booking_details_bottom_bar.dart';
import 'widgets/booking_details/booking_details_policy_cards.dart';
import 'widgets/booking_details/booking_details_hero_card.dart';
import 'widgets/booking_details/booking_details_location_section.dart';
import 'widgets/booking_details/booking_details_payment_section.dart';
import 'widgets/booking_details/booking_details_team_section.dart';
import 'widgets/booking_details/booking_details_view_model.dart';

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

    final detailsStatus = bookingDetailsStatus(
      _now,
      widget.startAt,
      widget.endAt,
      widget.status,
    );
    final hero = buildBookingDetailsHeroModel(
      now: _now,
      bookingId: widget.bookingId,
      arenaName: widget.arenaName,
      courtName: widget.courtName,
      startAt: widget.startAt,
      endAt: widget.endAt,
      rawStatus: widget.status,
    );

    final address = arena?.addressLine?.trim().isNotEmpty == true
        ? arena!.addressLine!.trim()
        : (arena?.locationLabel ?? 'Local a confirmar');

    final bookingSnap = ref
        .watch(arenaBookingDocProvider(widget.bookingId))
        .valueOrNull;
    final bookingData = bookingSnap?.data();

    final currency = NumberFormat.currency(
      locale: 'pt_BR',
      symbol: r'R$',
      decimalDigits: 2,
    );
    final amountValue =
        widget.amountReais ?? (bookingData?['amountReais'] as num?)?.toDouble();
    final paymentLabel = amountValue != null
        ? currency.format(amountValue)
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

    final canCancel = bookingDetailsCanCancel(detailsStatus);
    final actionsEnabled = bookingDetailsActionsEnabled(detailsStatus);

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      appBar: BookingDetailsAppBar(
        onShare: _shareBooking,
        onCancel: _cancelBooking,
        showCancel: canCancel,
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
          const SizedBox(height: 14),
          BookingDetailsTeamSection(
            bookingId: widget.bookingId,
            inviteEnabled: actionsEnabled,
          ),
          const SizedBox(height: 14),
          BookingDetailsLocationSection(
            arena: arena,
            address: address,
            onOpenMaps: actionsEnabled ? () => _openMaps(address) : null,
          ),
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
          const SizedBox(height: 14),
          BookingDetailsCancellationCard(arenaName: widget.arenaName),
          const SizedBox(height: 14),
          BookingDetailsActionsSection(
            onDirections: () => _openMaps(address),
            onShare: _shareBooking,
            onCancel: canCancel ? _cancelBooking : null,
            shareLoading: _sharing,
            canCancel: canCancel,
            actionsEnabled: actionsEnabled,
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
          SnackBar(content: Text('Não foi possível confirmar presença: $e')),
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
          SnackBar(content: Text('Não foi possível fazer check-in: $e')),
        );
    } finally {
      if (mounted) setState(() => _checkingIn = false);
    }
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
      await Share.share(text);
    } finally {
      if (mounted) setState(() => _sharing = false);
    }
  }

  Future<void> _addToCalendar() async {
    final y = widget.startAt.year.toString().padLeft(4, '0');
    final m = widget.startAt.month.toString().padLeft(2, '0');
    final d = widget.startAt.day.toString().padLeft(2, '0');
    final dateKey = '$y-$m-$d';
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
      ).showSnackBar(SnackBar(content: Text('Não foi possível cancelar: $e')));
    }
  }
}
