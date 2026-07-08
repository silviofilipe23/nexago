import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../domain/friendly_match_logic.dart';
import '../../domain/friendly_match_models.dart';
import 'friendly_match_status_chip.dart';

/// Card de lista do Bora Jogar: o outro atleta, objetivo, horário, local.
class FriendlyMatchCard extends StatelessWidget {
  const FriendlyMatchCard({
    super.key,
    required this.match,
    required this.currentUid,
    required this.onTap,
  });

  final FriendlyMatch match;
  final String currentUid;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final theme = Theme.of(context);
    final otherName = match.otherName(currentUid);
    final otherPhoto = match.otherPhotoUrl(currentUid);
    final now = DateTime.now();
    final needsMyAction =
        nextActionFor(currentUid, match, now) == FriendlyMatchNextAction.respond;
    final when = DateFormat("EEE, d 'de' MMM • HH:mm", 'pt_BR')
        .format(match.scheduledAt.toLocal());

    return Material(
      color: colors.surfaceCard,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              CircleAvatar(
                radius: 24,
                backgroundColor: AppColors.brand.withValues(alpha: 0.12),
                backgroundImage:
                    otherPhoto != null ? NetworkImage(otherPhoto) : null,
                child: otherPhoto == null
                    ? Text(
                        otherName.isNotEmpty ? otherName[0].toUpperCase() : '?',
                        style: theme.textTheme.titleMedium?.copyWith(
                          color: AppColors.brand,
                          fontWeight: FontWeight.w800,
                        ),
                      )
                    : null,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            otherName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: theme.textTheme.titleSmall?.copyWith(
                              fontWeight: FontWeight.w700,
                              color: colors.onSurface,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        FriendlyMatchStatusChip(
                          status: match.status,
                          clientExpired: isClientExpired(match, now),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${match.objective.label} • $when',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: colors.onSurfaceMuted,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      match.location.displayLabel,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: colors.onSurfaceMuted,
                      ),
                    ),
                  ],
                ),
              ),
              if (needsMyAction) ...[
                const SizedBox(width: 8),
                Container(
                  width: 10,
                  height: 10,
                  decoration: const BoxDecoration(
                    color: AppColors.brand,
                    shape: BoxShape.circle,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
