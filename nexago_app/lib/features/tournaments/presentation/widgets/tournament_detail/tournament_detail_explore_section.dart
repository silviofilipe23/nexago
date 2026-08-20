import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:nexago_app/core/ui/explore_card.dart';

import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/tournament_detail_logic.dart';
import '../../../domain/tournament_detail_model.dart';

/// Seção "Explorar o torneio" da Visão geral — a navegação do detalhe vive
/// aqui (sem barra de abas): Hoje e Minha inscrição entram só quando têm
/// conteúdo real, como as abas adaptativas do portal; chave e grupos vivem
/// DENTRO da categoria.
class TournamentDetailExploreSection extends StatelessWidget {
  const TournamentDetailExploreSection({
    super.key,
    required this.tournament,
    required this.stats,
    required this.onOpenCategorias,
    required this.onOpenPalpites,
    required this.onOpenHoje,
    required this.onOpenMinhaInscricao,
    this.showHoje = false,
    this.liveNow = false,
    this.showMinhaInscricao = false,
    this.palpitesEnabled = false,
  });

  final TournamentDetail tournament;
  final TournamentDetailStats stats;
  final VoidCallback onOpenCategorias;
  final VoidCallback onOpenPalpites;
  final VoidCallback onOpenHoje;
  final VoidCallback onOpenMinhaInscricao;

  /// "Hoje" só com partida do atleta no dia (ou jogo em quadra agora).
  final bool showHoje;
  final bool liveNow;

  /// "Minha inscrição" só pra quem está inscrito.
  final bool showMinhaInscricao;

  /// Palpites só abrem quando existe confronto definido.
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
          if (showHoje)
            ExploreCard(
              icon: Icons.center_focus_strong_rounded,
              title: 'Você joga hoje',
              subtitle: liveNow
                  ? 'Tem jogo em quadra agora — entrar no Modo Focus'
                  : 'Entrar no Modo Focus',
              onTap: onOpenHoje,
            ),
          ExploreCard(
            icon: Icons.grid_view_rounded,
            title: 'Categorias',
            subtitle: tournamentExploreCategoriesSubtitle(stats),
            onTap: onOpenCategorias,
          ),
          if (showMinhaInscricao)
            ExploreCard(
              icon: Icons.verified_outlined,
              title: 'Minha inscrição',
              subtitle: 'Acompanhe os passos e o status da sua vaga',
              onTap: onOpenMinhaInscricao,
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
