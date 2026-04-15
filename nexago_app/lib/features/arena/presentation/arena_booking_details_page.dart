import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../arenas/domain/booking_providers.dart';
import '../../athlete/domain/athlete_profile.dart';
import '../../athlete/domain/athlete_profile_providers.dart';
import '../domain/arena_booking_labels.dart';
import '../domain/arena_date_utils.dart';
import '../domain/arena_manager_booking.dart';
import '../domain/arena_schedule_providers.dart';
import '../domain/arena_slot_detail_providers.dart';
import 'widgets/arena_async_state.dart';

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
    final theme = Theme.of(context);
    final id = bookingId.trim();
    if (id.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: const Text('Reserva')),
        body: const ArenaErrorState(message: 'ID da reserva inválido.'),
      );
    }

    final liveAsync = ref.watch(arenaBookingDetailMapProvider(id));
    final arenaAsync = ref.watch(managedArenaDetailProvider);
    final arenaId = ref.watch(managedArenaIdProvider).valueOrNull ?? '';

    if (liveAsync.hasError && initialBooking == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Reserva')),
        body: ArenaErrorState(
            message: 'Erro ao carregar reserva.\n${liveAsync.error}'),
      );
    }

    final live = liveAsync.valueOrNull;
    final merged = _mergeBookingData(initialBooking?.data, live);

    if (merged == null && initialBooking == null) {
      if (liveAsync.isLoading) {
        return Scaffold(
          appBar: AppBar(title: const Text('Reserva')),
          body: const ArenaLoadingState(label: 'Carregando reserva...'),
        );
      }
      return Scaffold(
        appBar: AppBar(title: const Text('Reserva')),
        body: const ArenaEmptyState(
          title: 'Reserva não encontrada',
          message: 'Não foi possível carregar os dados desta reserva.',
          icon: Icons.event_busy_outlined,
        ),
      );
    }

    final booking = initialBooking ??
        (merged != null ? _bookingFromMerged(id, merged) : null);
    if (booking == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Reserva')),
        body: const ArenaLoadingState(label: 'Carregando reserva...'),
      );
    }
    final data = merged ?? booking.data;
    final athleteId = booking.athleteId.trim();
    final nameAsync = ref.watch(athleteDisplayLabelProvider(athleteId));
    final AsyncValue<AthleteProfile?>? profileAsync = athleteId.isEmpty
        ? null
        : ref.watch(athleteProfileByIdProvider(athleteId));

    final arenaName = arenaAsync.valueOrNull?.name.trim().isNotEmpty == true
        ? arenaAsync.valueOrNull!.name.trim()
        : 'Arena';
    final statusLabel = arenaBookingBusinessStatusLabel(data);
    final paymentTypeLabel = arenaBookingPaymentLabel(data);
    final amount = _amountReaisFromData(data);
    final amountStr = amount != null
        ? NumberFormat.currency(
                locale: 'pt_BR', symbol: r'R$', decimalDigits: 2)
            .format(amount)
        : '—';

    final dateParsed = DateTime.tryParse(
        booking.dateKey.length >= 10 ? booking.dateKey.substring(0, 10) : '');
    final dateTitle = dateParsed != null
        ? _capitalize(
            DateFormat("EEEE, d 'de' MMMM", 'pt_BR').format(dateParsed))
        : booking.dateKey;
    final timeRange = '${booking.startTime} – ${booking.endTime}';

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

    return Scaffold(
      backgroundColor: theme.colorScheme.surfaceContainerLowest,
      appBar: AppBar(
        title: const Text('Reserva'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
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
          _HeaderCard(
            athleteName: nameAsync.valueOrNull ?? '…',
            dateLabel: dateTitle,
            timeRange: timeRange,
            statusLabel: statusLabel,
            statusColor: _statusAccentColor(statusLabel),
          ),
          const SizedBox(height: 14),
          _AthleteCard(
            nameAsync: nameAsync,
            profileAsync: profileAsync,
            athleteId: athleteId,
            onViewProfile: athleteId.isEmpty
                ? null
                : () {
                    context.pushNamed(
                      AppRouteNames.athleteProfile,
                      queryParameters: {'userId': athleteId},
                    );
                  },
          ),
          const SizedBox(height: 14),
          _InfoCard(
            rows: [
              _InfoRow(
                  icon: Icons.storefront_outlined,
                  label: 'Arena',
                  value: arenaName),
              _InfoRow(
                icon: Icons.sports_tennis_outlined,
                label: 'Quadra',
                value: booking.courtName,
              ),
              _InfoRow(
                  icon: Icons.calendar_today_outlined,
                  label: 'Data',
                  value: dateTitle),
              _InfoRow(
                  icon: Icons.schedule_outlined,
                  label: 'Horário',
                  value: timeRange),
            ],
          ),
          const SizedBox(height: 14),
          _SectionCard(
            title: 'Pagamento',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Valor',
                  style: theme.textTheme.labelMedium?.copyWith(
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.55),
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  amountStr,
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.2,
                  ),
                ),
                const SizedBox(height: 14),
                Text(
                  'Tipo de pagamento',
                  style: theme.textTheme.labelMedium?.copyWith(
                    color: theme.colorScheme.onSurface.withValues(alpha: 0.55),
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  paymentTypeLabel,
                  style: theme.textTheme.bodyLarge?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          _AthleteHistorySection(
            historyAsync: historyAsync,
            athleteId: athleteId,
            arenaId: historyArenaId,
          ),
          const SizedBox(height: 14),
          _ActionsCard(
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
                ? () => _confirmCancel(context, ref,
                    bookingId: id, arenaId: arenaId)
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
    final courtRaw =
        merged['courtName'] ?? merged['court'] ?? merged['courtId'];
    final courtName = courtRaw is String && courtRaw.trim().isNotEmpty
        ? courtRaw.trim()
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
      courtName: courtName,
      dateKey: dateKey,
      startTime: timeStr(merged['startTime']),
      endTime: timeStr(merged['endTime']),
      data: merged,
    );
  }

  static String _capitalize(String s) {
    if (s.isEmpty) return s;
    return s[0].toUpperCase() + s.substring(1);
  }

  static double? _amountReaisFromData(Map<String, dynamic>? d) {
    if (d == null) return null;
    return (d['amountReais'] as num?)?.toDouble() ??
        (d['priceReais'] as num?)?.toDouble();
  }

  static Color _statusAccentColor(String statusLabel) {
    final s = statusLabel.toLowerCase();
    if (s.contains('cancel')) return const Color(0xFF9E9E9E);
    if (s.contains('ativa')) return const Color(0xFF2E7D32);
    if (s.contains('conclu')) return const Color(0xFF1565C0);
    return AppColors.brand;
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
    required String bookingId,
    required String arenaId,
  }) async {
    final go = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cancelar reserva'),
        content: const Text(
          'Tem certeza que deseja cancelar esta reserva? Essa ação notifica o fluxo da arena.',
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Voltar')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(
              backgroundColor: Theme.of(ctx).colorScheme.error,
              foregroundColor: Theme.of(ctx).colorScheme.onError,
            ),
            child: const Text('Cancelar reserva'),
          ),
        ],
      ),
    );
    if (go != true || !context.mounted) return;

    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(bookingServiceProvider).cancelBookingByArenaManager(
            bookingId: bookingId,
            arenaId: arenaId,
          );
      if (context.mounted) {
        messenger
            .showSnackBar(const SnackBar(content: Text('Reserva cancelada.')));
        context.pop();
      }
    } catch (e) {
      if (context.mounted) {
        messenger.showSnackBar(
          SnackBar(content: Text('Não foi possível cancelar: $e')),
        );
      }
    }
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
        title: const Text('Desbloquear atleta'),
        content: const Text(
          'Tem certeza que deseja desbloquear este atleta para novas reservas nesta arena?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Voltar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Desbloquear'),
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
      title: const Text('Bloquear atleta'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Este atleta não poderá criar novas reservas nesta arena.',
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _controller,
            minLines: 2,
            maxLines: 4,
            decoration: const InputDecoration(
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
          child: const Text('Voltar'),
        ),
        FilledButton(
          onPressed: canConfirm
              ? () => Navigator.pop(context, _controller.text.trim())
              : null,
          child: const Text('Confirmar bloqueio'),
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
      appBar: AppBar(title: const Text('Desbloqueio de atleta')),
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
                  const SizedBox(height: 12),
                  Text(
                    success ? 'Atleta desbloqueado' : 'Falha ao desbloquear',
                    textAlign: TextAlign.center,
                    style: theme.textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.2,
                    ),
                  ),
                  const SizedBox(height: 12),
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
                  const SizedBox(height: 20),
                  FilledButton(
                    onPressed: () => Navigator.of(context).pop(),
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.brand,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                    child: const Text('Voltar para a reserva'),
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

class _HeaderCard extends StatelessWidget {
  const _HeaderCard({
    required this.athleteName,
    required this.dateLabel,
    required this.timeRange,
    required this.statusLabel,
    required this.statusColor,
  });

  final String athleteName;
  final String dateLabel;
  final String timeRange;
  final String statusLabel;
  final Color statusColor;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 16),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(18),
        border:
            Border.all(color: theme.colorScheme.outline.withValues(alpha: 0.1)),
        boxShadow: [
          BoxShadow(
            color: theme.colorScheme.shadow.withValues(alpha: 0.06),
            blurRadius: 20,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            athleteName,
            style: theme.textTheme.headlineSmall?.copyWith(
              fontWeight: FontWeight.w800,
              letterSpacing: -0.4,
            ),
          ),
          const SizedBox(height: 12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 4,
                height: 48,
                decoration: BoxDecoration(
                  color: statusColor,
                  borderRadius: BorderRadius.circular(4),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      dateLabel,
                      style: theme.textTheme.bodyLarge?.copyWith(
                        fontWeight: FontWeight.w600,
                        height: 1.25,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      timeRange,
                      style: theme.textTheme.titleMedium?.copyWith(
                        color: AppColors.brand,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.2,
                      ),
                    ),
                  ],
                ),
              ),
              _StatusPill(label: statusLabel, color: statusColor),
            ],
          ),
        ],
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Text(
        label,
        style: theme.textTheme.labelLarge?.copyWith(
          color: color.withValues(alpha: 0.95),
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}

class _AthleteCard extends StatelessWidget {
  const _AthleteCard({
    required this.nameAsync,
    required this.profileAsync,
    required this.athleteId,
    required this.onViewProfile,
  });

  final AsyncValue<String> nameAsync;
  final AsyncValue<AthleteProfile?>? profileAsync;
  final String athleteId;
  final VoidCallback? onViewProfile;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return _SectionCard(
      title: 'Atleta',
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          _AthleteAvatar(
            profileAsync: profileAsync,
            nameAsync: nameAsync,
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                nameAsync.when(
                  data: (n) => Text(
                    n,
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.2,
                    ),
                  ),
                  loading: () => Text(
                    'Carregando…',
                    style: theme.textTheme.titleMedium?.copyWith(
                      color:
                          theme.colorScheme.onSurface.withValues(alpha: 0.45),
                    ),
                  ),
                  error: (_, __) => const Text('—'),
                ),
                const SizedBox(height: 10),
                OutlinedButton(
                  onPressed: onViewProfile,
                  child: const Text('Ver perfil'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _AthleteAvatar extends StatelessWidget {
  const _AthleteAvatar({
    required this.profileAsync,
    required this.nameAsync,
  });

  final AsyncValue<AthleteProfile?>? profileAsync;
  final AsyncValue<String> nameAsync;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    const size = 72.0;
    final name = nameAsync.valueOrNull ?? '';
    final initial = _initialLetter(name);

    final url = profileAsync?.valueOrNull?.avatarUrl?.trim();

    if (url != null && url.isNotEmpty) {
      return Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(
            color: theme.colorScheme.outline.withValues(alpha: 0.15),
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: CachedNetworkImage(
          imageUrl: url,
          fit: BoxFit.cover,
          placeholder: (_, __) => const Center(
            child: SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
          ),
          errorWidget: (_, __, ___) =>
              _FallbackAvatar(size: size, initial: initial),
        ),
      );
    }

    return _FallbackAvatar(size: size, initial: initial);
  }
}

String _initialLetter(String name) {
  final t = name.trim();
  if (t.isEmpty) return '?';
  final it = t.runes.iterator;
  if (!it.moveNext()) return '?';
  return String.fromCharCode(it.current).toUpperCase();
}

class _FallbackAvatar extends StatelessWidget {
  const _FallbackAvatar({required this.size, required this.initial});

  final double size;
  final String initial;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color:
            theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.85),
        border: Border.all(
          color: theme.colorScheme.outline.withValues(alpha: 0.12),
        ),
      ),
      child: Text(
        initial,
        style: theme.textTheme.headlineSmall
            ?.copyWith(fontWeight: FontWeight.w700),
      ),
    );
  }
}

class _InfoRow {
  const _InfoRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;
}

class _InfoCard extends StatelessWidget {
  const _InfoCard({required this.rows});

  final List<_InfoRow> rows;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return _SectionCard(
      title: 'Informações',
      child: Column(
        children: [
          for (var i = 0; i < rows.length; i++) ...[
            if (i > 0)
              Divider(
                  height: 22,
                  color: theme.colorScheme.outline.withValues(alpha: 0.12)),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(rows[i].icon,
                    size: 22, color: AppColors.brand.withValues(alpha: 0.9)),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        rows[i].label,
                        style: theme.textTheme.labelMedium?.copyWith(
                          color: theme.colorScheme.onSurface
                              .withValues(alpha: 0.55),
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        rows[i].value,
                        style: theme.textTheme.bodyLarge?.copyWith(
                          fontWeight: FontWeight.w600,
                          height: 1.3,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({
    required this.child,
    this.title,
  });

  final Widget child;
  final String? title;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(16),
        border:
            Border.all(color: theme.colorScheme.outline.withValues(alpha: 0.1)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (title != null) ...[
            Text(
              title!,
              style: theme.textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w800,
                letterSpacing: -0.2,
              ),
            ),
            const SizedBox(height: 12),
          ],
          child,
        ],
      ),
    );
  }
}

class _AthleteHistorySection extends StatelessWidget {
  const _AthleteHistorySection({
    required this.historyAsync,
    required this.athleteId,
    required this.arenaId,
  });

  final AsyncValue<List<ArenaManagerBooking>>? historyAsync;
  final String athleteId;
  final String arenaId;

  @override
  Widget build(BuildContext context) {
    if (historyAsync == null) {
      return const _SectionCard(
        title: 'Histórico do atleta',
        child: Text('Dados insuficientes para carregar o histórico.'),
      );
    }

    return historyAsync!.when(
      data: (history) {
        final total = history.length;
        final canceled = history.where(_isCanceledBooking).length;
        final highlights = <String>[
          if (total >= 8) 'Cliente frequente',
          if (canceled >= 3 && (canceled / (total == 0 ? 1 : total)) >= 0.35)
            'Cancela com frequência',
        ];
        final latestFive = history.take(5).toList(growable: false);
        final recentCanceled = latestFive.where(_isCanceledBooking).length;

        return _SectionCard(
          title: 'Histórico do atleta',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: _HistoryStatTile(
                      label: 'Total de reservas',
                      value: '$total',
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _HistoryStatTile(
                      label: 'Cancelamentos',
                      value: '$canceled',
                      danger: canceled > 0,
                    ),
                  ),
                ],
              ),
              if (highlights.isNotEmpty) ...[
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final label in highlights)
                      _HistoryHighlightChip(label: label),
                  ],
                ),
              ],
              if (recentCanceled >= 2) ...[
                const SizedBox(height: 10),
                Container(
                  width: double.infinity,
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                  decoration: BoxDecoration(
                    color: Theme.of(context)
                        .colorScheme
                        .errorContainer
                        .withValues(alpha: 0.45),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      color: Theme.of(context)
                          .colorScheme
                          .error
                          .withValues(alpha: 0.35),
                    ),
                  ),
                  child: Text(
                    '⚠️ $recentCanceled cancelamentos recentes',
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: Theme.of(context).colorScheme.error,
                          fontWeight: FontWeight.w700,
                        ),
                  ),
                ),
              ],
              const SizedBox(height: 12),
              if (latestFive.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 4),
                  child: Text(
                      'Sem reservas anteriores para este atleta nesta arena.'),
                )
              else
                Column(
                  children: [
                    for (var i = 0; i < latestFive.length; i++) ...[
                      if (i > 0)
                        Divider(
                          height: 22,
                          color: Theme.of(context)
                              .colorScheme
                              .outline
                              .withValues(alpha: 0.12),
                        ),
                      _HistoryBookingRow(booking: latestFive[i]),
                    ],
                  ],
                ),
              if (history.length > 5) ...[
                const SizedBox(height: 10),
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton.icon(
                    onPressed: () => _openFullHistoryPage(context),
                    icon: const Icon(Icons.history_rounded),
                    label: const Text('Ver todos'),
                  ),
                ),
              ],
            ],
          ),
        );
      },
      loading: () => const _SectionCard(
        title: 'Histórico do atleta',
        child: ArenaLoadingState(label: 'Carregando histórico...'),
      ),
      error: (e, _) => _SectionCard(
        title: 'Histórico do atleta',
        child: Text('Não foi possível carregar o histórico.\n$e'),
      ),
    );
  }

  void _openFullHistoryPage(BuildContext context) {
    Navigator.of(context, rootNavigator: true).push(
      MaterialPageRoute<void>(
        builder: (_) => _AthleteFullHistoryPage(
          athleteId: athleteId,
          arenaId: arenaId,
        ),
      ),
    );
  }
}

class _AthleteFullHistoryPage extends ConsumerWidget {
  const _AthleteFullHistoryPage({
    required this.athleteId,
    required this.arenaId,
  });

  final String athleteId;
  final String arenaId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final historyAsync = ref.watch(
      athleteArenaHistoryProvider(
        AthleteArenaHistoryArgs(
          athleteId: athleteId,
          arenaId: arenaId,
        ),
      ),
    );
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Histórico completo')),
      backgroundColor: theme.colorScheme.surfaceContainerLowest,
      body: historyAsync.when(
        data: (bookings) {
          if (bookings.isEmpty) {
            return const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: Text('Sem histórico para este atleta nesta arena.'),
              ),
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
            itemCount: bookings.length,
            separatorBuilder: (_, __) => Divider(
              height: 18,
              color: theme.colorScheme.outline.withValues(alpha: 0.12),
            ),
            itemBuilder: (_, i) => _HistoryBookingRow(booking: bookings[i]),
          );
        },
        loading: () => const Center(
          child: ArenaLoadingState(label: 'Carregando histórico...'),
        ),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              'Não foi possível carregar o histórico.\n$e',
              textAlign: TextAlign.center,
            ),
          ),
        ),
      ),
    );
  }
}

class _HistoryStatTile extends StatelessWidget {
  const _HistoryStatTile({
    required this.label,
    required this.value,
    this.danger = false,
  });

  final String label;
  final String value;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final accent = danger ? theme.colorScheme.error : AppColors.brand;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: accent.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: accent.withValues(alpha: 0.22)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: theme.textTheme.labelMedium?.copyWith(
              color: theme.colorScheme.onSurface.withValues(alpha: 0.65),
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 3),
          Text(
            value,
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w800,
              color: accent.withValues(alpha: 0.95),
            ),
          ),
        ],
      ),
    );
  }
}

class _HistoryHighlightChip extends StatelessWidget {
  const _HistoryHighlightChip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isNegative = label.toLowerCase().contains('cancela');
    final color =
        isNegative ? theme.colorScheme.error : const Color(0xFF2E7D32);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.32)),
      ),
      child: Text(
        label,
        style: theme.textTheme.labelLarge?.copyWith(
          color: color.withValues(alpha: 0.95),
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _HistoryBookingRow extends StatelessWidget {
  const _HistoryBookingRow({required this.booking});

  final ArenaManagerBooking booking;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final date = DateTime.tryParse(
      booking.dateKey.length >= 10 ? booking.dateKey.substring(0, 10) : '',
    );
    final dateLabel = date != null
        ? DateFormat('dd/MM/yyyy', 'pt_BR').format(date)
        : booking.dateKey;
    final status = arenaBookingBusinessStatusLabel(booking.data);
    final statusColor = ArenaBookingDetailsPage._statusAccentColor(status);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                dateLabel,
                style: theme.textTheme.bodyLarge?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                '${booking.startTime} – ${booking.endTime}',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurface.withValues(alpha: 0.7),
                ),
              ),
            ],
          ),
        ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            color: statusColor.withValues(alpha: 0.14),
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: statusColor.withValues(alpha: 0.35)),
          ),
          child: Text(
            status,
            style: theme.textTheme.labelMedium?.copyWith(
              color: statusColor.withValues(alpha: 0.95),
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ],
    );
  }
}

bool _isCanceledBooking(ArenaManagerBooking booking) {
  final s = (booking.data['status'] as String?)?.toLowerCase().trim() ?? '';
  return s == 'cancelled' || s == 'canceled';
}

class _ActionsCard extends StatelessWidget {
  const _ActionsCard({
    required this.onContact,
    required this.onBlock,
    required this.onUnblock,
    required this.blockInfo,
    required this.onCancel,
  });

  final VoidCallback? onContact;
  final VoidCallback? onBlock;
  final VoidCallback? onUnblock;
  final ArenaAthleteBlockInfo? blockInfo;
  final VoidCallback? onCancel;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return _SectionCard(
      title: 'Ações',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          FilledButton.tonalIcon(
            onPressed: onContact,
            icon: const Icon(Icons.chat_bubble_outline_rounded),
            label: const Text('Falar com atleta'),
            style: FilledButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14)),
            ),
          ),
          const SizedBox(height: 10),
          if (blockInfo?.isBlocked == true) ...[
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: theme.colorScheme.errorContainer.withValues(alpha: 0.45),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: theme.colorScheme.error.withValues(alpha: 0.35),
                ),
              ),
              child: Row(
                children: [
                  Icon(Icons.block_rounded, color: theme.colorScheme.error),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      blockInfo?.reason?.isNotEmpty == true
                          ? 'Atleta bloqueado: ${blockInfo!.reason!}'
                          : 'Atleta já está bloqueado nesta arena.',
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: theme.colorScheme.error,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: onUnblock,
              icon: const Icon(Icons.lock_open_rounded),
              label: const Text('Desbloquear atleta'),
              style: OutlinedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
            ),
          ] else
            OutlinedButton.icon(
              onPressed: onBlock,
              icon: const Icon(Icons.block_outlined),
              label: const Text('Bloquear atleta'),
              style: OutlinedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14)),
              ),
            ),
          const SizedBox(height: 10),
          OutlinedButton.icon(
            onPressed: onCancel,
            icon: Icon(Icons.cancel_outlined, color: theme.colorScheme.error),
            label: Text(
              'Cancelar reserva',
              style: TextStyle(
                color: onCancel != null
                    ? theme.colorScheme.error
                    : theme.colorScheme.onSurface.withValues(alpha: 0.38),
                fontWeight: FontWeight.w700,
              ),
            ),
            style: OutlinedButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 14),
              side: BorderSide(
                color: onCancel != null
                    ? theme.colorScheme.error.withValues(alpha: 0.55)
                    : theme.colorScheme.outline.withValues(alpha: 0.25),
              ),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14)),
            ),
          ),
        ],
      ),
    );
  }
}
