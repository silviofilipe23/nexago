import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_radii.dart';
import '../../../../../core/theme/app_spacing.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/double_elimination_bracket_layout.dart';
import '../../../domain/tournament_match_card_view_model.dart';
import '../../../domain/tournament_matches_logic.dart';
import 'bracket_connector_painter.dart';
import 'bracket_match_node.dart';

/// Canvas da chave com navegação por fase: chips das colunas (16avos →
/// Oitavas → Quartas → … e, na dupla eliminação, as rodadas da losers e a
/// grand final) pulam a câmera direto pra fase, mantendo o arrasto livre.
class DoubleEliminationBracketCanvas extends StatefulWidget {
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
  State<DoubleEliminationBracketCanvas> createState() =>
      _DoubleEliminationBracketCanvasState();
}

class _DoubleEliminationBracketCanvasState
    extends State<DoubleEliminationBracketCanvas>
    with SingleTickerProviderStateMixin {
  final _transformation = TransformationController();
  late final AnimationController _animator = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 320),
  );
  Animation<Matrix4>? _cameraTween;
  int? _activeColumn;

  @override
  void dispose() {
    _animator.dispose();
    _transformation.dispose();
    super.dispose();
  }

  /// Anima a câmera até a coluna da fase, preservando o zoom atual.
  void _jumpToColumn(int index) {
    final column = widget.layout.columns[index];
    final scale = _transformation.value.getMaxScaleOnAxis();
    final target = Matrix4.identity()
      ..scaleByDouble(scale, scale, 1, 1)
      ..translateByDouble(
        -(column.headerPosition.dx - AppSpacing.lg),
        -(column.headerPosition.dy - AppSpacing.lg),
        0,
        1,
      );

    _cameraTween = Matrix4Tween(
      begin: _transformation.value,
      end: target,
    ).animate(
      CurvedAnimation(parent: _animator, curve: Curves.easeOutCubic),
    )..addListener(_applyCamera);
    _animator.forward(from: 0);
    setState(() => _activeColumn = index);
  }

  void _applyCamera() {
    final tween = _cameraTween;
    if (tween != null) _transformation.value = tween.value;
  }

  @override
  Widget build(BuildContext context) {
    final layout = widget.layout;
    final nodeByMatchId = {for (final node in layout.nodes) node.matchId: node};
    final colors = context.themeColors;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (layout.columns.length > 1)
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.screenH,
              AppSpacing.xs,
              AppSpacing.screenH,
              AppSpacing.sm + 2,
            ),
            child: Row(
              children: [
                for (var i = 0; i < layout.columns.length; i++) ...[
                  if (i > 0) const SizedBox(width: AppSpacing.sm - 2),
                  Material(
                    color: _activeColumn == i
                        ? AppColors.brand
                        : colors.surfaceRaised,
                    borderRadius: AppRadii.pillAll,
                    clipBehavior: Clip.antiAlias,
                    child: InkWell(
                      onTap: () => _jumpToColumn(i),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: AppSpacing.md,
                          vertical: AppSpacing.sm - 1,
                        ),
                        child: Text(
                          layout.columns[i].label.toUpperCase(),
                          style: AppTypography.eyebrow.copyWith(
                            color: _activeColumn == i
                                ? AppColors.black
                                : colors.onSurfaceMuted,
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        Expanded(
          child: InteractiveViewer(
            transformationController: _transformation,
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
                          color: colors.onSurfaceMuted,
                          letterSpacing: 0.8,
                        ),
                      ),
                    ),
                  for (final node in layout.nodes)
                    Positioned(
                      left: node.position.dx,
                      top: node.position.dy,
                      child: BracketMatchNode(
                        viewModel: widget.cardsById[node.matchId]!,
                        isAthleteMatch: isAthleteMatchForHighlight(
                          widget.cardsById[node.matchId]!.match,
                          widget.athleteTeamIds,
                        ),
                        isFinal: node.isFinal,
                        athleteTeamIds: widget.athleteTeamIds,
                        onTap: widget.onMatchTap != null
                            ? () => widget.onMatchTap!(node.matchId)
                            : null,
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}
