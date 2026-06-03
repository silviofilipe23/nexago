import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
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

  static const _cardRadius = 16.0;
  static const _iconSize = 44.0;
  static const _iconRadius = 12.0;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final unread = notification.isUnread;
    final actions = presentation.actions;

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(_cardRadius),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(_cardRadius),
          child: Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(_cardRadius),
              border: Border.all(
                color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.14),
              ),
            ),
            child: IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (unread)
                    Container(
                      width: 3,
                      decoration: BoxDecoration(
                        color: AppColors.brand,
                        borderRadius: const BorderRadius.horizontal(
                          left: Radius.circular(_cardRadius),
                        ),
                      ),
                    ),
                  Expanded(
                    child: Padding(
                      padding: EdgeInsets.fromLTRB(
                        unread ? 12 : 14,
                        14,
                        12,
                        12,
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Container(
                                width: _iconSize,
                                height: _iconSize,
                                decoration: BoxDecoration(
                                  color: presentation.iconBackground,
                                  borderRadius:
                                      BorderRadius.circular(_iconRadius),
                                ),
                                child: Icon(
                                  presentation.icon,
                                  color: presentation.iconColor,
                                  size: 22,
                                ),
                              ),
                              SizedBox(width: 12),
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
                                              color: context.themeColors.onSurface,
                                              height: 1.25,
                                            ),
                                          ),
                                        ),
                                        SizedBox(width: 8),
                                        Text(
                                          timeLabel,
                                          style: AppTypography.mono(
                                            fontSize: 11,
                                            color: context.themeColors.onSurfaceMuted,
                                            fontWeight: FontWeight.w500,
                                          ),
                                        ),
                                      ],
                                    ),
                                    if (notification.body.trim().isNotEmpty) ...[
                                      SizedBox(height: 4),
                                      Text(
                                        notification.body,
                                        style:
                                            theme.textTheme.bodySmall?.copyWith(
                                          color: context.themeColors.onSurfaceMuted,
                                          fontWeight: FontWeight.w500,
                                          height: 1.35,
                                        ),
                                      ),
                                    ],
                                  ],
                                ),
                              ),
                            ],
                          ),
                          SizedBox(height: 12),
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.center,
                            children: [
                              if (actions.isNotEmpty) ...[
                                for (var i = 0; i < actions.length; i++) ...[
                                  if (i > 0) SizedBox(width: 8),
                                  if (actions.length == 1)
                                    _ActionButton(
                                      action: actions[i],
                                      onPressed: _actionHandler(
                                        actions[i],
                                        onPrimaryAction,
                                        onSecondaryAction,
                                      ),
                                    )
                                  else
                                    Expanded(
                                      child: _ActionButton(
                                        action: actions[i],
                                        onPressed: _actionHandler(
                                          actions[i],
                                          onPrimaryAction,
                                          onSecondaryAction,
                                        ),
                                      ),
                                    ),
                                ],
                              ],
                              Spacer(),
                              _DismissButton(onPressed: onDismiss),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  VoidCallback? _actionHandler(
    AthleteNotificationAction action,
    VoidCallback onPrimary,
    VoidCallback? onSecondary,
  ) {
    if (action.kind == AthleteNotificationActionKind.secondary) {
      return onSecondary;
    }
    return onPrimary;
  }
}

class _DismissButton extends StatelessWidget {
  const _DismissButton({required this.onPressed});

  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      onPressed: onPressed,
      icon: Icon(
        Icons.close_rounded,
        size: 20,
        color: context.themeColors.onSurfaceMuted,
      ),
      visualDensity: VisualDensity.compact,
      padding: EdgeInsets.zero,
      constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
      tooltip: 'Dispensar',
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
    final isPrimary = action.kind == AthleteNotificationActionKind.primary;

    if (isPrimary) {
      return FilledButton(
        onPressed: onPressed,
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.brand,
          foregroundColor: AppColors.black,
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
          minimumSize: Size.zero,
          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
          ),
        ),
        child: Text(
          action.label,
          style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13),
        ),
      );
    }

    return OutlinedButton(
      onPressed: onPressed,
      style: OutlinedButton.styleFrom(
        foregroundColor: action.isDestructive
            ? AppColors.live
            : context.themeColors.onSurface,
        side: BorderSide(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.35),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        minimumSize: Size.zero,
        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
      child: Text(
        action.label,
        style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
      ),
    );
  }
}
