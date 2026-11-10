import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/errors/friendly_error_message.dart';
import '../../../../../core/ui/app_snackbar.dart';
import '../../../../arenas/domain/arena_booking_labels.dart';
import '../../../../arenas/domain/arena_booking_waitlist_entry.dart';
import '../../../../arenas/domain/waitlist_providers.dart';

/// "Minha lista de espera" — entradas ativas (`waiting`/`notified`) de
/// `arenaBookingWaitlist`. Seção simples no topo da Agenda; some
/// quando não há entrada ativa.
class AgendaWaitlistSection extends ConsumerWidget {
  const AgendaWaitlistSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final entries = ref.watch(myWaitlistStreamProvider).valueOrNull ?? const [];
    final now = DateTime.now();
    // Horário que já começou some na hora; o servidor encerra a entrada em até 5 min.
    final active =
        entries.where((e) => e.isActive && !e.slotStarted(now)).toList();
    if (active.isEmpty) return const SizedBox.shrink();

    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                Icons.hourglass_top_rounded,
                size: 18,
                color: context.themeColors.brandText,
              ),
              SizedBox(width: 8),
              Text(
                'Minha lista de espera',
                style: theme.textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: context.themeColors.onSurface,
                ),
              ),
            ],
          ),
          SizedBox(height: 10),
          for (final entry in active) ...[
            _WaitlistEntryCard(entry: entry),
            SizedBox(height: 8),
          ],
        ],
      ),
    );
  }
}

class _WaitlistEntryCard extends ConsumerStatefulWidget {
  const _WaitlistEntryCard({required this.entry});

  final ArenaBookingWaitlistEntry entry;

  @override
  ConsumerState<_WaitlistEntryCard> createState() => _WaitlistEntryCardState();
}

class _WaitlistEntryCardState extends ConsumerState<_WaitlistEntryCard> {
  Timer? _ticker;
  bool _leaving = false;

  @override
  void initState() {
    super.initState();
    if (widget.entry.isNotified) {
      // Atualiza a contagem regressiva de 15 min enquanto notificado.
      _ticker = Timer.periodic(const Duration(seconds: 30), (_) {
        if (mounted) setState(() {});
      });
    }
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final entry = widget.entry;
    final notified = entry.isNotified;
    final accent = notified ? AppColors.win : AppColors.brand;
    // Ícone e texto: o tom do tema, legível no claro. A borda e o fundo do
    // ícone seguem no cru, translúcidos.
    final ink =
        notified ? context.themeColors.win : context.themeColors.brandText;
    final dateLabel = formatBookingDateHeader(entry.dateKey);
    final remaining = entry.remainingNotifyWindow;

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: accent.withValues(alpha: notified ? 0.5 : 0.25)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: accent.withValues(alpha: 0.16),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(
              notified ? Icons.notifications_active_rounded : Icons.hourglass_top_rounded,
              color: ink,
              size: 20,
            ),
          ),
          SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  entry.arenaName ?? 'Arena',
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: context.themeColors.onSurface,
                  ),
                ),
                SizedBox(height: 2),
                Text(
                  [
                    if (entry.courtName != null) entry.courtName,
                    dateLabel,
                    '${entry.startTime}–${entry.endTime}',
                  ].whereType<String>().join(' · '),
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                  ),
                ),
                SizedBox(height: 6),
                Text(
                  notified
                      ? (remaining != null && remaining > Duration.zero
                          ? 'Vaga liberada! Reserve em até ${_formatRemaining(remaining)}.'
                          : 'Vaga liberada! Reserve agora antes que expire.')
                      : 'Aguardando vaga — avisamos por notificação.',
                  style: theme.textTheme.labelSmall?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: ink,
                  ),
                ),
                TextButton(
                  key: ValueKey('waitlist-leave-${entry.id}'),
                  onPressed: _leaving ? null : _confirmLeave,
                  style: TextButton.styleFrom(
                    foregroundColor: context.themeColors.onSurfaceMuted,
                    padding: EdgeInsets.zero,
                    minimumSize: const Size(0, 40),
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    alignment: Alignment.centerLeft,
                  ),
                  child: Text(
                    _leaving ? 'Saindo…' : 'Sair da lista',
                    style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                  ),
                ),
              ],
            ),
          ),
          if (notified) ...[
            SizedBox(width: 8),
            FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.win,
                foregroundColor: AppColors.black,
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                minimumSize: Size.zero,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              onPressed: () => _openSlot(context),
              child: Text('Reservar'),
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _confirmLeave() async {
    final entry = widget.entry;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Sair da lista de espera?'),
        content: Text(
          'Você deixa de ser avisado se uma vaga abrir em '
          '${entry.arenaName ?? 'Arena'} às ${entry.startTime}. '
          'Para voltar, entre na lista de novo pelo horário.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Continuar na lista'),
          ),
          TextButton(
            key: const ValueKey('waitlist-leave-confirm'),
            style: TextButton.styleFrom(foregroundColor: context.themeColors.live),
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Sair da lista'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _leaving = true);
    try {
      await ref.read(waitlistRepositoryProvider).leave(entry.id);
      if (mounted) showAppSnackBar(context, 'Você saiu da lista de espera.');
    } catch (e) {
      if (!mounted) return;
      showAppSnackBar(
        context,
        friendlyErrorMessage(
          e,
          action: 'Não foi possível sair da lista',
          logReason: 'reserva:sair_lista_espera',
        ),
        isError: true,
      );
    } finally {
      if (mounted) setState(() => _leaving = false);
    }
  }

  void _openSlot(BuildContext context) {
    final entry = widget.entry;
    context.pushNamed(
      AppRouteNames.arenaSlots,
      pathParameters: {'arenaId': entry.arenaId},
      queryParameters: {
        'date': entry.dateKey,
        'courtId': entry.courtId,
        'startTime': entry.startTime,
      },
    );
  }

  static String _formatRemaining(Duration d) {
    final minutes = d.inMinutes;
    if (minutes < 1) return 'menos de 1 min';
    return '$minutes min';
  }
}
