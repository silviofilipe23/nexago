import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

class BookingDetailsBottomBar extends StatelessWidget {
  const BookingDetailsBottomBar({
    super.key,
    required this.onAddToCalendar,
    this.inviteEnabled = true,
    this.actionsEnabled = true,
  });

  final VoidCallback onAddToCalendar;
  final bool inviteEnabled;
  final bool actionsEnabled;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      decoration: BoxDecoration(
        color: context.themeColors.canvas,
        border: Border(
          top: BorderSide(color: context.themeColors.surfaceRaised),
        ),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              SizedBox(
                width: double.infinity,
                height: 52,
                child: FilledButton(
                  onPressed: inviteEnabled ? () => _showInviteComingSoon(context) : null,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.brand,
                    foregroundColor: AppColors.black,
                    disabledBackgroundColor:
                        AppColors.brand.withValues(alpha: 0.35),
                    disabledForegroundColor:
                        AppColors.black.withValues(alpha: 0.45),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(999),
                    ),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        'Convidar jogadores',
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w900,
                          color: AppColors.black,
                        ),
                      ),
                      const SizedBox(width: 6),
                      const Icon(
                        Icons.arrow_forward_rounded,
                        size: 20,
                        color: AppColors.black,
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 10),
              TextButton(
                onPressed: actionsEnabled ? onAddToCalendar : null,
                child: Text(
                  'Adicionar ao meu calendário',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: actionsEnabled
                        ? AppColors.brand
                        : AppColors.brand.withValues(alpha: 0.4),
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

void _showInviteComingSoon(BuildContext context) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      const SnackBar(content: Text('Convidar jogadores em breve no app.')),
    );
}
