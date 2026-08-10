import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/ui/nexa_icon_square_button.dart';
import 'widgets/tournament_detail/tournament_detail_my_registration_tab.dart';

/// "Minha inscrição" do torneio — trilha de passos + inscrições confirmadas
/// (aberto pelo card correspondente da Visão geral).
class TournamentMyRegistrationPage extends StatelessWidget {
  const TournamentMyRegistrationPage({super.key, required this.tournamentId});

  final String tournamentId;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final topInset = MediaQuery.paddingOf(context).top;

    return Scaffold(
      backgroundColor: colors.canvas,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(height: topInset + AppSpacing.xs),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xs),
            child: Row(
              children: [
                NexaIconSquareButton(
                  icon: Icons.arrow_back_rounded,
                  onTap: () => context.pop(),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.screenH,
              AppSpacing.sm,
              AppSpacing.screenH,
              AppSpacing.xs,
            ),
            child: Text(
              'Minha inscrição',
              style: AppTypography.titleL.copyWith(color: colors.onSurface),
            ),
          ),
          Expanded(
            child: TournamentDetailMyRegistrationTab(
              tournamentId: tournamentId,
            ),
          ),
        ],
      ),
    );
  }
}
