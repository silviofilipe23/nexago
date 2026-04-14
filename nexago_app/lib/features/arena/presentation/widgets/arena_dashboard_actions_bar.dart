import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/ui/app_snackbar.dart';

class ArenaDashboardActionsBar extends StatelessWidget {
  const ArenaDashboardActionsBar({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SizedBox(
          height: 52,
          child: FilledButton(
            onPressed: () => context.go(AppRoutes.arenaSchedule),
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.brand,
              foregroundColor: Colors.white,
              elevation: 0,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
              ),
            ),
            child: const Text(
              'Ver agenda',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                letterSpacing: -0.2,
              ),
            ),
          ),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            // Expanded(
            //   child: OutlinedButton(
            //     onPressed: () {
            //       showAppSnackBar(
            //         context,
            //         'Promoções em breve — você será avisado quando estiver disponível.',
            //       );
            //     },
            //     style: OutlinedButton.styleFrom(
            //       foregroundColor: theme.colorScheme.onSurface,
            //       side: BorderSide(
            //         color: theme.colorScheme.outline.withValues(alpha: 0.25),
            //       ),
            //       padding: const EdgeInsets.symmetric(vertical: 14),
            //       shape: RoundedRectangleBorder(
            //         borderRadius: BorderRadius.circular(14),
            //       ),
            //     ),
            //     child: Text(
            //       'Criar promoção',
            //       style: theme.textTheme.labelLarge?.copyWith(
            //         fontWeight: FontWeight.w700,
            //       ),
            //     ),
            //   ),
            // ),
            // const SizedBox(width: 12),
            // Expanded(
            //   child: OutlinedButton(
            //     onPressed: () => context.go(AppRoutes.arenaCourts),
            //     style: OutlinedButton.styleFrom(
            //       foregroundColor: theme.colorScheme.onSurface,
            //       side: BorderSide(
            //         color: theme.colorScheme.outline.withValues(alpha: 0.25),
            //       ),
            //       padding: const EdgeInsets.symmetric(vertical: 14),
            //       shape: RoundedRectangleBorder(
            //         borderRadius: BorderRadius.circular(14),
            //       ),
            //     ),
            //     child: Text(
            //       'Abrir horários',
            //       style: theme.textTheme.labelLarge?.copyWith(
            //         fontWeight: FontWeight.w700,
            //       ),
            //     ),
            //   ),
            // ),
          ],
        ),
      ],
    );
  }
}
