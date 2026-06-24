import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/feedback/feedback_page.dart';
import '../../arenas/domain/booking_providers.dart';
import '../domain/arena_booking_canceled_args.dart';

/// Tela pós-cancelamento com undo (mock 06).
class ArenaBookingCanceledPage extends ConsumerStatefulWidget {
  const ArenaBookingCanceledPage({
    super.key,
    required this.args,
  });

  final ArenaBookingCanceledArgs args;

  @override
  ConsumerState<ArenaBookingCanceledPage> createState() =>
      _ArenaBookingCanceledPageState();
}

class _ArenaBookingCanceledPageState
    extends ConsumerState<ArenaBookingCanceledPage> {
  static const _undoUiSeconds = 30;
  int _secondsLeft = _undoUiSeconds;
  Timer? _timer;
  bool _restoring = false;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      if (_secondsLeft <= 0) return;
      setState(() => _secondsLeft--);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final canUndo = _secondsLeft > 0 && !_restoring;
    final notificationLine = _notificationLine(widget.args.athleteNames);
    final description =
        '$notificationLine. O slot ${widget.args.slotHighlight} voltou pra agenda.';

    return FeedbackPage.error(
      title: 'Reserva cancelada.',
      description: description,
      extraContent: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _UndoCard(
            secondsLeft: _secondsLeft,
            canUndo: canUndo,
            restoring: _restoring,
            onUndo: _restore,
          ),
          SizedBox(height: 14),
          _SlotReleasedCard(
            slotTimeRange: widget.args.slotTimeRange,
            onCreateBooking: () => showAppSnackBar(
              context,
              'Criar reserva em breve.',
            ),
            onPromoFlash: () => showAppSnackBar(
              context,
              'Promo flash em breve.',
            ),
          ),
        ],
      ),
      secondaryAction: FeedbackAction(
        label: 'Voltar pra lista de reservas',
        isPrimary: false,
        onPressed: () => context.pop(),
      ),
    );
  }

  String _notificationLine(String names) {
    final trimmed = names.trim();
    if (trimmed.isEmpty) return 'Os atletas foram notificados';
    final plural = trimmed.contains('&') ||
        trimmed.toLowerCase().contains(' e ');
    return plural
        ? '$trimmed foram notificados'
        : '$trimmed foi notificado';
  }

  Future<void> _restore() async {
    setState(() => _restoring = true);
    try {
      await ref.read(bookingServiceProvider).restoreBookingByArenaManager(
            bookingId: widget.args.bookingId,
            arenaId: widget.args.arenaId,
          );
      if (!mounted) return;
      showAppSnackBar(context, 'Reserva restaurada.');
      context.pop();
    } catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, '$e', isError: true);
    } finally {
      if (mounted) setState(() => _restoring = false);
    }
  }
}

class _UndoCard extends StatelessWidget {
  const _UndoCard({
    required this.secondsLeft,
    required this.canUndo,
    required this.restoring,
    required this.onUndo,
  });

  final int secondsLeft;
  final bool canUndo;
  final bool restoring;
  final VoidCallback onUndo;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: AppColors.brand.withValues(alpha: canUndo ? 0.45 : 0.2),
        ),
      ),
      child: Row(
        children: [
          _CountdownBadge(
            label: canUndo ? '${secondsLeft}s' : '0s',
            active: canUndo,
          ),
          SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Desfazer cancelamento',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: context.themeColors.onSurface,
                  ),
                ),
                SizedBox(height: 2),
                Text(
                  'Restaura a reserva e re-notifica os atletas',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                    fontWeight: FontWeight.w500,
                    height: 1.3,
                  ),
                ),
              ],
            ),
          ),
          SizedBox(width: 8),
          FilledButton(
            onPressed: canUndo && !restoring ? onUndo : null,
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.brand,
              foregroundColor: AppColors.black,
              disabledBackgroundColor:
                  AppColors.brand.withValues(alpha: 0.35),
              disabledForegroundColor:
                  AppColors.black.withValues(alpha: 0.45),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              minimumSize: const Size(0, 44),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            child: restoring
                ? SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: AppColors.black,
                    ),
                  )
                : Text(
                    'Desfazer',
                    style: TextStyle(fontWeight: FontWeight.w800),
                  ),
          ),
        ],
      ),
    );
  }
}

class _CountdownBadge extends StatelessWidget {
  const _CountdownBadge({
    required this.label,
    required this.active,
  });

  final String label;
  final bool active;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 48,
      height: 48,
      child: DecoratedBox(
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(
            color: active
                ? AppColors.brand
                : context.themeColors.onSurfaceMuted.withValues(alpha: 0.35),
            width: 2,
          ),
        ),
        child: Center(
          child: Text(
            label,
            style: TextStyle(
              fontWeight: FontWeight.w800,
              fontSize: 14,
              color: active ? AppColors.brand : context.themeColors.onSurfaceMuted,
            ),
          ),
        ),
      ),
    );
  }
}

class _SlotReleasedCard extends StatelessWidget {
  const _SlotReleasedCard({
    required this.slotTimeRange,
    required this.onCreateBooking,
    required this.onPromoFlash,
  });

  final String slotTimeRange;
  final VoidCallback onCreateBooking;
  final VoidCallback onPromoFlash;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.22),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'SLOT LIBERADO · ${slotTimeRange.toUpperCase()}',
            style: theme.textTheme.labelSmall?.copyWith(
              color: context.themeColors.onSurfaceMuted,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.6,
              fontSize: 10,
            ),
          ),
          SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: FilledButton(
                  onPressed: onCreateBooking,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.brand,
                    foregroundColor: AppColors.black,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: Text(
                    'Criar reserva',
                    style: TextStyle(fontWeight: FontWeight.w800),
                  ),
                ),
              ),
              SizedBox(width: 10),
              Expanded(
                child: OutlinedButton(
                  onPressed: onPromoFlash,
                  style: OutlinedButton.styleFrom(
                    foregroundColor: context.themeColors.onSurface,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    side: BorderSide(
                      color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.35),
                    ),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: Text(
                    'Promo flash',
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
