import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

class BookingDetailsActionsSection extends StatelessWidget {
  const BookingDetailsActionsSection({
    super.key,
    required this.onDirections,
    required this.onShare,
    required this.onCancel,
    this.onOrderAtCourt,
    this.shareLoading = false,
    this.canCancel = true,
    this.actionsEnabled = true,
  });

  final VoidCallback onDirections;
  final VoidCallback onShare;
  final VoidCallback? onCancel;
  /// Peça na quadra — `null` quando a reserva não tem `arenaId` conhecido.
  final VoidCallback? onOrderAtCourt;
  final bool shareLoading;
  final bool canCancel;
  final bool actionsEnabled;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'AÇÕES',
          style: AppTypography.mono(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            color: context.themeColors.onSurfaceMuted,
            letterSpacing: 0.5,
          ),
        ),
        const SizedBox(height: 10),
        if (onOrderAtCourt != null) ...[
          _ActionButton(
            label: 'Peça na quadra',
            icon: Icons.local_bar_outlined,
            onTap: actionsEnabled ? onOrderAtCourt : null,
          ),
          const SizedBox(height: 8),
        ],
        _ActionButton(
          label: 'Como chegar',
          icon: Icons.near_me_outlined,
          onTap: actionsEnabled ? onDirections : null,
        ),
        const SizedBox(height: 8),
        _ActionButton(
          label: shareLoading ? 'Compartilhando...' : 'Compartilhar reserva',
          icon: Icons.ios_share_rounded,
          onTap: actionsEnabled && !shareLoading ? onShare : null,
        ),
        const SizedBox(height: 8),
        _ActionButton(
          label: 'Cancelar reserva',
          icon: Icons.cancel_outlined,
          onTap: canCancel ? onCancel : null,
          danger: true,
        ),
      ],
    );
  }
}

class _ActionButton extends StatelessWidget {
  const _ActionButton({
    required this.label,
    required this.icon,
    required this.onTap,
    this.danger = false,
  });

  final String label;
  final IconData icon;
  final VoidCallback? onTap;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final color = danger ? const Color(0xFFE57373) : AppColors.brand;

    return SizedBox(
      width: double.infinity,
      child: OutlinedButton.icon(
        onPressed: onTap,
        icon: Icon(icon, size: 18, color: color),
        label: Text(
          label,
          style: TextStyle(
            fontWeight: FontWeight.w700,
            color: onTap == null ? color.withValues(alpha: 0.4) : color,
          ),
        ),
        style: OutlinedButton.styleFrom(
          foregroundColor: color,
          side: BorderSide(color: color.withValues(alpha: 0.45)),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
          padding: const EdgeInsets.symmetric(vertical: 14),
        ),
      ),
    );
  }
}
