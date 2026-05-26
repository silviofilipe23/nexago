import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../domain/athlete_inbox_notification.dart';
import '../../../domain/athlete_notifications_logic.dart';

class AthleteNotificationCard extends StatelessWidget {
  const AthleteNotificationCard({
    super.key,
    required this.notification,
    required this.presentation,
    required this.timeLabel,
    required this.onDismiss,
    required this.onPrimaryAction,
    this.onSecondaryAction,
    this.onTap,
  });

  final AthleteInboxNotification notification;
  final AthleteNotificationPresentation presentation;
  final String timeLabel;
  final VoidCallback onDismiss;
  final VoidCallback onPrimaryAction;
  final VoidCallback? onSecondaryAction;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final unread = notification.isUnread;

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: AppColors.surfaceRaised,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          child: Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: AppColors.onSurfaceMuted.withValues(alpha: 0.1),
              ),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (unread)
                  Container(
                    width: 3,
                    decoration: BoxDecoration(
                      color: AppColors.brand,
                      borderRadius: const BorderRadius.horizontal(
                        left: Radius.circular(16),
                      ),
                    ),
                  ),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(14, 14, 12, 12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Container(
                              width: 44,
                              height: 44,
                              decoration: BoxDecoration(
                                color: presentation.iconBackground,
                                shape: BoxShape.circle,
                              ),
                              child: Icon(
                                presentation.icon,
                                color: presentation.iconColor,
                                size: 22,
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Expanded(
                                        child: Text(
                                          notification.title,
                                          style: theme.textTheme.titleSmall
                                              ?.copyWith(
                                            fontWeight: FontWeight.w800,
                                            color: AppColors.onSurface,
                                          ),
                                        ),
                                      ),
                                      Text(
                                        timeLabel,
                                        style: AppTypography.mono(
                                          fontSize: 11,
                                          color: AppColors.onSurfaceMuted,
                                          fontWeight: FontWeight.w500,
                                        ),
                                      ),
                                      IconButton(
                                        onPressed: onDismiss,
                                        icon: const Icon(
                                          Icons.close_rounded,
                                          size: 18,
                                          color: AppColors.onSurfaceMuted,
                                        ),
                                        visualDensity: VisualDensity.compact,
                                        padding: EdgeInsets.zero,
                                        constraints: const BoxConstraints(
                                          minWidth: 28,
                                          minHeight: 28,
                                        ),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 6),
                                  Text(
                                    notification.body,
                                    style: theme.textTheme.bodyMedium?.copyWith(
                                      color: AppColors.onSurfaceMuted,
                                      fontWeight: FontWeight.w500,
                                      height: 1.4,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                        if (presentation.actions.isNotEmpty) ...[
                          const SizedBox(height: 12),
                          Row(
                            children: [
                              for (var i = 0;
                                  i < presentation.actions.length;
                                  i++) ...[
                                if (i > 0) const SizedBox(width: 8),
                                Expanded(
                                  child: _ActionButton(
                                    action: presentation.actions[i],
                                    onPressed: presentation.actions[i].kind ==
                                            AthleteNotificationActionKind
                                                .secondary
                                        ? onSecondaryAction
                                        : onPrimaryAction,
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ],
                      ],
                    ),
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

class _ActionButton extends StatelessWidget {
  const _ActionButton({
    required this.action,
    required this.onPressed,
  });

  final AthleteNotificationAction action;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final isPrimary =
        action.kind == AthleteNotificationActionKind.primary;

    if (isPrimary) {
      return FilledButton(
        onPressed: onPressed,
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.brand,
          foregroundColor: AppColors.black,
          padding: const EdgeInsets.symmetric(vertical: 10),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
          ),
        ),
        child: Text(
          action.label,
          style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13),
        ),
      );
    }

    return OutlinedButton(
      onPressed: onPressed,
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.onSurface,
        side: BorderSide(
          color: AppColors.onSurfaceMuted.withValues(alpha: 0.35),
        ),
        padding: const EdgeInsets.symmetric(vertical: 10),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
      child: Text(
        action.label,
        style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
      ),
    );
  }
}
