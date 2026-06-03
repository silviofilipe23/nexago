import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/double_elimination_bracket_layout.dart';
import '../../../domain/tournament_match_card_view_model.dart';
import '../../../domain/tournament_matches_logic.dart';
import 'bracket_connector_painter.dart';
import 'bracket_match_node.dart';

class DoubleEliminationBracketCanvas extends StatelessWidget {
  const DoubleEliminationBracketCanvas({
    super.key,
    required this.layout,
    required this.cardsById,
    required this.athleteTeamIds,
    this.onMatchTap,
  });

  final DoubleEliminationBracketLayout layout;
  final Map<String, TournamentMatchCardViewModel> cardsById;
  final Set<String> athleteTeamIds;
  final ValueChanged<String>? onMatchTap;

  @override
  Widget build(BuildContext context) {
    final nodeByMatchId = {
      for (final node in layout.nodes) node.matchId: node,
    };

    return SizedBox.expand(
      child: InteractiveViewer(
        constrained: false,
        clipBehavior: Clip.none,
        alignment: Alignment.topLeft,
        boundaryMargin: const EdgeInsets.all(80),
        minScale: 0.35,
        maxScale: 2.5,
        child: SizedBox(
          width: layout.canvasSize.width,
          height: layout.canvasSize.height,
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              CustomPaint(
                size: layout.canvasSize,
                painter: BracketConnectorPainter(
                  layout: layout,
                  nodeByMatchId: nodeByMatchId,
                ),
              ),
              for (final column in layout.columns)
                Positioned(
                  left: column.headerPosition.dx,
                  top: column.headerPosition.dy,
                  width: BracketLayoutMetrics.cardWidth,
                  child: Text(
                    column.label.toUpperCase(),
                    style: AppTypography.mono(
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                      color: context.themeColors.onSurfaceMuted,
                      letterSpacing: 0.8,
                    ),
                  ),
                ),
              for (final node in layout.nodes)
                Positioned(
                  left: node.position.dx,
                  top: node.position.dy,
                  child: BracketMatchNode(
                    viewModel: cardsById[node.matchId]!,
                    isAthleteMatch: isAthleteMatchForHighlight(
                      cardsById[node.matchId]!.match,
                      athleteTeamIds,
                    ),
                    isFinal: node.isFinal,
                    athleteTeamIds: athleteTeamIds,
                    onTap: onMatchTap != null
                        ? () => onMatchTap!(node.matchId)
                        : null,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
