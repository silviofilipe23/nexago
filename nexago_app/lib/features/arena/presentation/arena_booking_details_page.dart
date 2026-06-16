import 'package:flutter/material.dart';
import 'package:nexago_app/core/layout/nexa_app_bar.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../arenas/domain/booking_providers.dart';
import '../../athlete/domain/athlete_profile_providers.dart';
import '../domain/arena_booking_canceled_args.dart';
import '../domain/arena_bookings_grouping.dart';
import '../domain/arena_booking_labels.dart';
import '../domain/arena_court_providers.dart';
import '../domain/arena_date_utils.dart';
import '../domain/arena_manager_booking.dart';
import '../domain/arena_schedule_providers.dart';
import '../domain/arena_slot_detail_providers.dart';
import 'widgets/arena_async_state.dart';
import 'widgets/arena_booking_cancel_sheet.dart';
import 'widgets/arena_booking_detail_athletes.dart';
import 'widgets/arena_booking_detail_checkin.dart';
import 'widgets/arena_booking_detail_actions.dart';
import 'widgets/arena_booking_detail_header.dart';
import 'widgets/arena_booking_detail_history.dart';
import 'widgets/arena_booking_detail_payment.dart';
import 'widgets/arena_booking_detail_timeline.dart';

/// Detalhe de uma reserva para o gestor da arena (painel).
class ArenaBookingDetailsPage extends ConsumerWidget {
  const ArenaBookingDetailsPage({
    super.key,
    required this.bookingId,
    this.initialBooking,
  });

  final String bookingId;
  final ArenaManagerBooking? initialBooking;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final id = bookingId.trim();
    if (id.isEmpty) {
      return Scaffold(
        appBar: NexaAppBar(title: Text('Reserva')),
        body: const ArenaErrorState(message: 'ID da reserva inválido.'),
      );
    }

    final liveAsync = ref.watch(arenaBookingDetailMapProvider(id));
    final arenaId = ref.watch(managedArenaIdProvider).valueOrNull ?? '';

    if (liveAsync.hasError && initialBooking == null) {
      return Scaffold(
        appBar: NexaAppBar(title: Text('Reserva')),
        body: ArenaErrorState(
            message: 'Erro ao carregar reserva.\n${liveAsync.error}'),
      );
    }

    final live = liveAsync.valueOrNull;
    final merged = _mergeBookingData(initialBooking?.data, live);

    if (merged == null && initialBooking == null) {
      if (liveAsync.isLoading) {
        return Scaffold(
          appBar: NexaAppBar(title: Text('Reserva')),
          body: const ArenaLoadingState(label: 'Carregando reserva...'),
        );
      }
      return Scaffold(
        appBar: NexaAppBar(title: Text('Reserva')),
        body: const ArenaEmptyState(
          title: 'Reserva não encontrada',
          message: 'Não foi possível carregar os dados desta reserva.',
          icon: Icons.event_busy_outlined,
        ),
      );
    }

    var booking = initialBooking ??
        (merged != null ? _bookingFromMerged(id, merged) : null);
    if (booking == null) {
      return Scaffold(
        appBar: NexaAppBar(title: Text('Reserva')),
        body: const ArenaLoadingState(label: 'Carregando reserva...'),
      );
    }
    final courts = ref.watch(arenaManagedCourtsProvider).valueOrNull;
    final ArenaManagerBooking resolvedBooking = courts != null && courts.isNotEmpty
        ? booking.enrichCourtName({for (final c in courts) c.id: c.name})
        : booking;

    final data = merged ?? resolvedBooking.data;
    final athleteId = resolvedBooking.athleteId.trim();
    final nameAsync = ref.watch(athleteDisplayLabelProvider(athleteId));

    final statusLabel = arenaBookingBusinessStatusLabel(data);
    final amount = _amountReaisFromData(data);
    final amountStr = amount != null
        ? NumberFormat.currency(
                locale: 'pt_BR', symbol: r'R$', decimalDigits: 2)
            .format(amount)
        : '—';

    final participants =
        (data['confirmedParticipants'] as num?)?.toInt() ?? 1;

    final statusLower = (data['status'] as String?)?.toLowerCase().trim() ?? '';
    final canCancel = statusLower != 'cancelled' &&
        statusLower != 'canceled' &&
        statusLower != 'completed';
    final historyArenaId =
        ((data['arenaId'] as String?)?.trim().isNotEmpty == true)
            ? (data['arenaId'] as String).trim()
            : arenaId;
    final historyAsync = athleteId.isNotEmpty && historyArenaId.isNotEmpty
        ? ref.watch(
            athleteArenaHistoryProvider(
              AthleteArenaHistoryArgs(
                athleteId: athleteId,
                arenaId: historyArenaId,
              ),
            ),
          )
        : null;
    final historyArgs = AthleteArenaHistoryArgs(
      athleteId: athleteId,
      arenaId: historyArenaId,
    );
    final blockAsync = athleteId.isNotEmpty && historyArenaId.isNotEmpty
        ? ref.watch(arenaAthleteBlockProvider(historyArgs))
        : const AsyncData(ArenaAthleteBlockInfo(isBlocked: false));

    final timelineEvents =
        ArenaBookingDetailTimeline.fromBooking(resolvedBooking, data);
    final athleteName = nameAsync.valueOrNull ?? 'Atleta';

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      appBar: NexaAppBar(
        backgroundColor: context.themeColors.canvas,
        title: Text('Reserva'),
        leading: IconButton(
          icon: Icon(Icons.arrow_back_rounded),
          onPressed: () {
            if (context.canPop()) {
              context.pop();
            }
          },
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
        children: [
          ArenaBookingDetailHeader(
            booking: resolvedBooking,
            bookingId: id,
            courtName: resolvedBooking.courtName,
            statusLabel: statusLabel,
            athleteName: athleteName,
          ),
          SizedBox(height: 14),
          ArenaBookingDetailAthletes(
            arenaId: historyArenaId,
            primaryAthleteId: athleteId,
            participants: participants,
          ),
          SizedBox(height: 14),
          ArenaBookingDetailPayment(
            bookingData: data,
            amountStr: amountStr,
            startTime: resolvedBooking.startTime,
            endTime: resolvedBooking.endTime,
            amountReais: amount,
          ),
          SizedBox(height: 14),
          ArenaBookingDetailTimeline(events: timelineEvents),
          SizedBox(height: 14),
          ArenaBookingDetailCheckin(
            bookingId: id,
            athleteId: athleteId,
            bookingData: data,
          ),
          SizedBox(height: 14),
          ArenaBookingDetailHistory(
            historyAsync: historyAsync,
            athleteId: athleteId,
            arenaId: historyArenaId,
            currentBookingId: id,
            athleteName: athleteName,
            onSendMessage: athleteId.isEmpty
                ? null
                : () => _contactAthlete(context, ref, athleteId),
          ),
          SizedBox(height: 14),
          ArenaBookingDetailActions(
            onContact: athleteId.isEmpty
                ? null
                : () => _contactAthlete(context, ref, athleteId),
            onBlock: athleteId.isEmpty || historyArenaId.isEmpty
                ? null
                : () => _confirmBlockAthlete(
                      context,
                      ref,
                      arenaId: historyArenaId,
                      athleteId: athleteId,
                    ),
            onUnblock: athleteId.isEmpty || historyArenaId.isEmpty
                ? null
                : () => _confirmUnblockAthlete(
                      context,
                      ref,
                      arenaId: historyArenaId,
                      athleteId: athleteId,
                    ),
            blockInfo: blockAsync.valueOrNull,
            onCancel: canCancel && arenaId.isNotEmpty
                ? () => _confirmCancel(
                      context,
                      ref,
                      booking: resolvedBooking,
                      bookingId: id,
                      arenaId: arenaId,
                      athleteName: athleteName,
                    )
                : null,
          ),
        ],
      ),
    );
  }

  static Map<String, dynamic>? _mergeBookingData(
    Map<String, dynamic>? initial,
    Map<String, dynamic>? live,
  ) {
    if (initial == null && live == null) return null;
    if (live == null) return Map<String, dynamic>.from(initial!);
    if (initial == null) return Map<String, dynamic>.from(live);
    return {...initial, ...live};
  }

  static ArenaManagerBooking? _bookingFromMerged(
      String id, Map<String, dynamic> merged) {
    final aid = merged['athleteId'];
    final athleteId = aid is String && aid.trim().isNotEmpty ? aid.trim() : '';
    final courtId = merged['courtId'] is String
        ? (merged['courtId'] as String).trim()
        : '';
    final labelRaw = merged['courtName'] ?? merged['court'];
    final labelFromDoc =
        labelRaw is String && labelRaw.trim().isNotEmpty ? labelRaw.trim() : '';
    final courtName = labelFromDoc.isNotEmpty &&
            (courtId.isEmpty || labelFromDoc != courtId)
        ? labelFromDoc
        : 'Quadra';
    final dateKey = arenaDateKeyFromDynamic(merged['date']);
    if (dateKey.length < 10) return null;

    String timeStr(dynamic v) {
      if (v == null) return '--:--';
      if (v is String) {
        final t = v.trim();
        return t.length >= 5 ? t.substring(0, 5) : t;
      }
      return '--:--';
    }

    return ArenaManagerBooking(
      id: id,
      athleteId: athleteId,
      courtId: courtId,
      courtName: courtName,
      dateKey: dateKey,
      startTime: timeStr(merged['startTime']),
      endTime: timeStr(merged['endTime']),
      data: merged,
    );
  }

  static double? _amountReaisFromData(Map<String, dynamic>? d) {
    if (d == null) return null;
    return (d['amountReais'] as num?)?.toDouble() ??
        (d['priceReais'] as num?)?.toDouble();
  }

  static Future<void> _contactAthlete(
    BuildContext context,
    WidgetRef ref,
    String athleteId,
  ) async {
    final messenger = ScaffoldMessenger.of(context);
    final profile = ref.read(athleteProfileByIdProvider(athleteId)).valueOrNull;
    final email = await ref.read(athleteUserEmailProvider(athleteId).future);
    final phone = profile?.phoneNumber?.trim();

    Uri? uri;
    if (phone != null && phone.isNotEmpty) {
      final digits = String.fromCharCodes(
        phone.runes.where((r) => r >= 0x30 && r <= 0x39),
      );
      if (digits.length >= 10) {
        var n = digits;
        if (n.startsWith('0')) n = n.substring(1);
        if (!n.startsWith('55') && n.length <= 11) {
          n = '55$n';
        }
        uri = Uri.parse('https://wa.me/$n');
      } else {
        uri = Uri(scheme: 'tel', path: phone);
      }
    }
    uri ??= (email != null && email.isNotEmpty)
        ? Uri(
            scheme: 'mailto',
            path: email,
            queryParameters: {'subject': 'Reserva — Nexago'},
          )
        : null;

    if (uri == null) {
      messenger.showSnackBar(
        const SnackBar(content: Text('Contato do atleta indisponível.')),
      );
      return;
    }

    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok && context.mounted) {
      messenger.showSnackBar(
        const SnackBar(
            content: Text('Não foi possível abrir o app de contato.')),
      );
    }
  }

  static Future<void> _confirmCancel(
    BuildContext context,
    WidgetRef ref, {
    required ArenaManagerBooking booking,
    required String bookingId,
    required String arenaId,
    required String athleteName,
  }) async {
    final reason = await ArenaBookingCancelSheet.show(
      context,
      booking: booking,
      arenaId: arenaId,
      athleteName: athleteName,
    );
    if (reason == null || !context.mounted) return;

    context.pushReplacementNamed(
      AppRouteNames.arenaBookingCanceled,
      extra: ArenaBookingCanceledArgs(
        bookingId: bookingId,
        arenaId: arenaId,
        athleteNames: athleteName,
        slotHighlight: ArenaBookingsGrouping.cancelSlotHighlight(booking),
        slotTimeRange: ArenaBookingsGrouping.cancelSlotTimeRange(booking),
      ),
    );
  }

  static Future<void> _confirmBlockAthlete(
    BuildContext context,
    WidgetRef ref, {
    required String arenaId,
    required String athleteId,
  }) async {
    final reason = await showDialog<String>(
      context: context,
      builder: (ctx) => const _BlockAthleteReasonDialog(),
    );
    if (reason == null || reason.trim().isEmpty || !context.mounted) return;

    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(bookingServiceProvider).blockUser(
            arenaId: arenaId,
            athleteId: athleteId,
            reason: reason.trim(),
          );
      if (context.mounted) {
        messenger.showSnackBar(
          const SnackBar(content: Text('Atleta bloqueado com sucesso.')),
        );
      }
    } catch (e) {
      if (context.mounted) {
        messenger.showSnackBar(
          SnackBar(content: Text('Não foi possível bloquear: $e')),
        );
      }
    }
  }

  static Future<void> _confirmUnblockAthlete(
    BuildContext context,
    WidgetRef ref, {
    required String arenaId,
    required String athleteId,
  }) async {
    final go = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Desbloquear atleta'),
        content: Text(
          'Tem certeza que deseja desbloquear este atleta para novas reservas nesta arena?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text('Voltar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text('Desbloquear'),
          ),
        ],
      ),
    );
    if (go != true || !context.mounted) return;

    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(bookingServiceProvider).unblockUser(
            arenaId: arenaId,
            athleteId: athleteId,
          );
      if (context.mounted) {
        messenger.hideCurrentSnackBar();
        _openUnblockResultPage(
          context,
          success: true,
          message: 'Atleta desbloqueado com sucesso.',
        );
      }
    } catch (e) {
      if (context.mounted) {
        messenger.hideCurrentSnackBar();
        _openUnblockResultPage(
          context,
          success: false,
          message: 'Não foi possível desbloquear: $e',
        );
      }
    }
  }

  static Future<void> _openUnblockResultPage(
    BuildContext context, {
    required bool success,
    required String message,
  }) async {
    await Navigator.of(context, rootNavigator: true).push(
      MaterialPageRoute<void>(
        builder: (_) => _AthleteUnblockResultPage(
          success: success,
          message: message,
        ),
      ),
    );
  }
}

class _BlockAthleteReasonDialog extends StatefulWidget {
  const _BlockAthleteReasonDialog();

  @override
  State<_BlockAthleteReasonDialog> createState() =>
      _BlockAthleteReasonDialogState();
}

class _BlockAthleteReasonDialogState extends State<_BlockAthleteReasonDialog> {
  late final TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final canConfirm = _controller.text.trim().isNotEmpty;
    return AlertDialog(
      title: Text('Bloquear atleta'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Este atleta não poderá criar novas reservas nesta arena.',
          ),
          SizedBox(height: 12),
          TextField(
            controller: _controller,
            minLines: 2,
            maxLines: 4,
            decoration: InputDecoration(
              labelText: 'Motivo do bloqueio',
              hintText: 'Ex.: cancelamentos recorrentes sem aviso.',
              border: OutlineInputBorder(),
            ),
            onChanged: (_) => setState(() {}),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: Text('Voltar'),
        ),
        FilledButton(
          onPressed: canConfirm
              ? () => Navigator.pop(context, _controller.text.trim())
              : null,
          child: Text('Confirmar bloqueio'),
        ),
      ],
    );
  }
}

class _AthleteUnblockResultPage extends StatelessWidget {
  const _AthleteUnblockResultPage({
    required this.success,
    required this.message,
  });

  final bool success;
  final String message;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final accent = success ? const Color(0xFF2E7D32) : theme.colorScheme.error;

    return Scaffold(
      backgroundColor: theme.colorScheme.surfaceContainerLowest,
      appBar: NexaAppBar(title: Text('Desbloqueio de atleta')),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(24, 24, 24, 24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Icon(
                    success
                        ? Icons.check_circle_rounded
                        : Icons.error_outline_rounded,
                    size: 64,
                    color: accent,
                  ),
                  SizedBox(height: 12),
                  Text(
                    success ? 'Atleta desbloqueado' : 'Falha ao desbloquear',
                    textAlign: TextAlign.center,
                    style: theme.textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.2,
                    ),
                  ),
                  SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: accent.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: accent.withValues(alpha: 0.3)),
                    ),
                    child: Text(
                      message,
                      textAlign: TextAlign.center,
                      style: theme.textTheme.bodyLarge?.copyWith(height: 1.35),
                    ),
                  ),
                  SizedBox(height: 20),
                  FilledButton(
                    onPressed: () => Navigator.of(context).pop(),
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.brand,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                    child: Text('Voltar para a reserva'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
