import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../domain/friendly_match_models.dart';

/// Chip compacto de status do jogo/convite.
class FriendlyMatchStatusChip extends StatelessWidget {
  const FriendlyMatchStatusChip({
    super.key,
    required this.status,
    this.clientExpired = false,
  });

  final FriendlyMatchStatus status;

  /// Convite pendente já vencido na visão do client (sweeper ainda não rodou).
  final bool clientExpired;

  @override
  Widget build(BuildContext context) {
    final effective = clientExpired ? FriendlyMatchStatus.expired : status;
    final (color, label) = switch (effective) {
      FriendlyMatchStatus.sent => (const Color(0xFFB98900), effective.label),
      FriendlyMatchStatus.countered => (const Color(0xFFB98900), effective.label),
      FriendlyMatchStatus.confirmed => (const Color(0xFF2E7D32), effective.label),
      FriendlyMatchStatus.completed => (const Color(0xFF1565C0), effective.label),
      FriendlyMatchStatus.reviewed => (const Color(0xFF2E7D32), effective.label),
      FriendlyMatchStatus.declined => (const Color(0xFF9E9E9E), effective.label),
      FriendlyMatchStatus.expired => (const Color(0xFF9E9E9E), effective.label),
      FriendlyMatchStatus.cancelled => (const Color(0xFF9E9E9E), effective.label),
      FriendlyMatchStatus.noShow => (const Color(0xFFC62828), effective.label),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: color,
              fontWeight: FontWeight.w700,
            ),
      ),
    );
  }
}

/// Selo de compatibilidade congelado no envio (ex.: "94% compatível").
class FriendlyMatchScoreBadge extends StatelessWidget {
  const FriendlyMatchScoreBadge({super.key, required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.bolt_rounded, size: 14, color: Color(0xFFB98900)),
          const SizedBox(width: 4),
          Text(
            label,
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: context.themeColors.onSurface,
                ),
          ),
        ],
      ),
    );
  }
}
