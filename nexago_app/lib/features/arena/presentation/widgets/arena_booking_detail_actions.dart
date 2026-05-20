import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/arena_slot_detail_providers.dart';
import 'arena_dashboard_tokens.dart';

/// Ações do gestor na reserva (contato, bloqueio, cancelamento).
class ArenaBookingDetailActions extends StatelessWidget {
  const ArenaBookingDetailActions({
    super.key,
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

  static const _itemGap = 10.0;
  static const _destructive = Color(0xFFE57373);

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isBlocked = blockInfo?.isBlocked == true;

    return DecoratedBox(
      decoration: ArenaDashboardTokens.cardDecoration(),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Ações',
              style: theme.textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w800,
                color: AppColors.onSurface,
              ),
            ),
            const SizedBox(height: 14),
            _ActionRowTile(
              label: 'Falar com atleta',
              icon: Icons.chat_bubble_outline_rounded,
              iconColor: AppColors.win,
              onTap: onContact,
            ),
            const SizedBox(height: _itemGap),
            if (isBlocked) ...[
              _BlockedBanner(blockInfo: blockInfo!),
              const SizedBox(height: _itemGap),
              _ActionRowTile(
                label: 'Desbloquear atleta',
                icon: Icons.lock_open_rounded,
                iconColor: AppColors.win,
                onTap: onUnblock,
              ),
            ] else
              _ActionRowTile(
                label: 'Bloquear atleta',
                icon: Icons.block_rounded,
                iconColor: AppColors.pending,
                onTap: onBlock,
              ),
            const SizedBox(height: _itemGap),
            _CancelReservationButton(onTap: onCancel),
          ],
        ),
      ),
    );
  }
}

class _ActionRowTile extends StatelessWidget {
  const _ActionRowTile({
    required this.label,
    required this.icon,
    required this.iconColor,
    this.onTap,
  });

  final String label;
  final IconData icon;
  final Color iconColor;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final enabled = onTap != null;

    return Material(
      color: AppColors.surfaceRaised,
      borderRadius: BorderRadius.circular(14),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Opacity(
          opacity: enabled ? 1 : 0.45,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: AppColors.surfaceSheet,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(icon, color: iconColor, size: 22),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    label,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: AppColors.onSurface,
                    ),
                  ),
                ),
                Icon(
                  Icons.chevron_right_rounded,
                  size: 22,
                  color: AppColors.onSurfaceMuted.withValues(alpha: 0.85),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _BlockedBanner extends StatelessWidget {
  const _BlockedBanner({required this.blockInfo});

  final ArenaAthleteBlockInfo blockInfo;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final message = blockInfo.reason?.isNotEmpty == true
        ? 'Atleta bloqueado: ${blockInfo.reason!}'
        : 'Atleta já está bloqueado nesta arena.';

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: ArenaBookingDetailActions._destructive.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: ArenaBookingDetailActions._destructive.withValues(alpha: 0.35),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(
            Icons.block_rounded,
            size: 20,
            color: ArenaBookingDetailActions._destructive,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: theme.textTheme.bodySmall?.copyWith(
                color: ArenaBookingDetailActions._destructive,
                fontWeight: FontWeight.w600,
                height: 1.35,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CancelReservationButton extends StatelessWidget {
  const _CancelReservationButton({this.onTap});

  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final enabled = onTap != null;
    final color = enabled
        ? ArenaBookingDetailActions._destructive
        : AppColors.onSurfaceMuted.withValues(alpha: 0.45);

    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Opacity(
          opacity: enabled ? 1 : 0.5,
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: color.withValues(alpha: enabled ? 0.65 : 0.3),
              ),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.cancel_rounded, size: 20, color: color),
                const SizedBox(width: 8),
                Text(
                  'Cancelar reserva',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: color,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
