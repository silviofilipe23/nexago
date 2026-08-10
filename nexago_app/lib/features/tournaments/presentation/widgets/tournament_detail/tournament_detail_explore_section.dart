import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:nexago_app/core/ui/explore_card.dart';

import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/tournament_detail_logic.dart';
import '../../../domain/tournament_detail_model.dart';

/// Seção "Explorar o torneio" da Visão geral — só as portas de entrada que
/// não têm lugar melhor: Categorias e Palpites (as duas viram a aba
/// correspondente; chave e grupos vivem DENTRO da categoria).
class TournamentDetailExploreSection extends StatelessWidget {
  const TournamentDetailExploreSection({
    super.key,
    required this.tournament,
    required this.stats,
    required this.onOpenCategorias,
    required this.onOpenPalpites,
    this.palpitesEnabled = false,
  });

  final TournamentDetail tournament;
  final TournamentDetailStats stats;
  final VoidCallback onOpenCategorias;
  final VoidCallback onOpenPalpites;

  /// Palpites só abrem quando existe confronto definido (mesma regra da aba).
  final bool palpitesEnabled;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'EXPLORAR O TORNEIO',
            style: AppTypography.mono(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: context.themeColors.onSurfaceMuted,
              letterSpacing: 1.2,
            ),
          ),
          const SizedBox(height: 12),
          ExploreCard(
            icon: Icons.grid_view_rounded,
            title: 'Categorias',
            subtitle: tournamentExploreCategoriesSubtitle(stats),
            onTap: onOpenCategorias,
          ),
          ExploreCard(
            icon: Icons.emoji_events_outlined,
            title: 'Palpites',
            subtitle: palpitesEnabled
                ? 'Dê seus palpites e dispute o ranking da torcida'
                : 'Abrem quando os confrontos forem definidos',
            enabled: palpitesEnabled,
            onTap: onOpenPalpites,
          ),
        ],
      ),
    );
  }
}
