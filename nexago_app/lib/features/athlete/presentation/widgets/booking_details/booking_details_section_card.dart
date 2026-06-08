import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Card de seção no estilo dark do protótipo de detalhes da reserva.
class BookingDetailsSectionCard extends StatelessWidget {
  const BookingDetailsSectionCard({
    super.key,
    this.title,
    this.titleTrailing,
    this.padding = const EdgeInsets.all(16),
    required this.child,
  });

  final String? title;
  final Widget? titleTrailing;
  final EdgeInsetsGeometry padding;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Material(
      color: context.themeColors.surfaceCard,
      elevation: 0,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(
          color: context.themeColors.surfaceRaised.withValues(alpha: 0.9),
        ),
      ),
      child: Padding(
        padding: padding,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (title != null) ...[
              Row(
                children: [
                  Expanded(
                    child: Text(
                      title!,
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: context.themeColors.onSurface,
                      ),
                    ),
                  ),
                  if (titleTrailing != null) titleTrailing!,
                ],
              ),
              const SizedBox(height: 12),
            ],
            child,
          ],
        ),
      ),
    );
  }
}
