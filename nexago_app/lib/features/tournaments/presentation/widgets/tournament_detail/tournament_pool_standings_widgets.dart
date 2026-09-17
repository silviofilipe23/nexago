import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../domain/tournament_group_standings_logic.dart';

class TournamentGroupStandingsHeader extends StatelessWidget {
  const TournamentGroupStandingsHeader({
    super.key,
    required this.isComplete,
    required this.qualifiersPerGroup,
  });

  final bool isComplete;
  final int qualifiersPerGroup;

  @override
  Widget build(BuildContext context) {
    final phaseLabel =
        isComplete ? 'FASE DE GRUPOS · ENCERRADA' : 'FASE DE GRUPOS · EM ANDAMENTO';

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            phaseLabel,
            style: AppTypography.mono(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              color: AppColors.brand,
              letterSpacing: 0.8,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'Classificam $qualifiersPerGroup por grupo',
            style: AppTypography.soraRegular(
              fontSize: 22,
              fontWeight: FontWeight.w800,
              color: context.themeColors.onSurface,
            ),
          ),
        ],
      ),
    );
  }
}

class TournamentPoolStandingsCard extends StatelessWidget {
  const TournamentPoolStandingsCard({
    super.key,
    required this.group,
    required this.qualifiersPerGroup,
  });

  final TournamentPoolStandingsGroup group;
  final int qualifiersPerGroup;

  String get _groupLetter {
    final label = group.poolLabel.trim();
    final lower = label.toLowerCase();
    if (lower.startsWith('grupo ')) {
      final parts = label.split(' ');
      if (parts.length >= 2) return parts.last;
    }
    return group.poolId.isNotEmpty ? group.poolId : label;
  }

  @override
  Widget build(BuildContext context) {
    final teamLabel = group.teamCount == 1 ? 'DUPLA' : 'DUPLAS';
    final matchLabel = group.matchCount == 1 ? 'JOGO' : 'JOGOS';
    final statusLabel = group.isComplete ? 'FINALIZADO' : 'EM ANDAMENTO';
    final statusColor =
        group.isComplete ? AppColors.win : context.themeColors.onSurfaceMuted;

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: context.themeColors.surfaceRaised,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 36,
                  height: 36,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: AppColors.brand,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    _groupLetter.toUpperCase(),
                    style: AppTypography.soraRegular(
                      fontSize: 16,
                      fontWeight: FontWeight.w900,
                      color: AppColors.black,
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        group.poolLabel,
                        style: AppTypography.soraRegular(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          color: context.themeColors.onSurface,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '${group.teamCount} $teamLabel · ${group.matchCount} $matchLabel',
                        style: AppTypography.mono(
                          fontSize: 10,
                          color: context.themeColors.onSurfaceMuted,
                          letterSpacing: 0.4,
                        ),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: statusColor.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    statusLabel,
                    style: AppTypography.mono(
                      fontSize: 9,
                      fontWeight: FontWeight.w700,
                      color: statusColor,
                      letterSpacing: 0.4,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            // Nove colunas não cabem num celular. Em vez de espremer o nome da
            // dupla até virar reticências, o bloco INTEIRO anda de lado —
            // cabeçalho e linhas no mesmo scroll, senão os rótulos saem do
            // prumo dos números no primeiro arrasto.
            LayoutBuilder(
              builder: (context, constraints) {
                final tableWidth =
                    math.max(_tableMinWidth, constraints.maxWidth);
                final nameWidth =
                    _colNameMin + (tableWidth - _tableMinWidth);

                return SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: SizedBox(
                    width: tableWidth,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        _StandingsTableHeader(nameWidth: nameWidth),
                        const SizedBox(height: 4),
                        for (final row in group.rows)
                          _StandingsTableRow(
                            row: row,
                            nameWidth: nameWidth,
                            highlightQualifiers: true,
                          ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

/// Geometria da tabela. Cabeçalho e linha leem as MESMAS constantes e usam os
/// mesmos recuos — assim as colunas alinham por construção, sem ajuste manual.
/// Na linha o recuo esquerdo é 3 (barra do classificado) + 8, ou 11 sem barra.
const double _rowLeadingInset = 11;
const double _rowTrailingInset = 4;

const double _colRank = 24;

/// Piso do nome da dupla: cabem duas linhas de um par completo tipo
/// "Silvio Dionizio / Marcos Antônio". Sobra de tela vai toda pra cá.
const double _colNameMin = 128;

/// As numéricas são justas de propósito. Num celular de 360dp o corte tem de
/// cair DEPOIS do SP — ele é o dado que a tabela existe pra mostrar, e nascer
/// escondido atrás do scroll anularia a mudança. Só PTS, que é `V × 2` e já
/// está implícito na ordem das linhas, pode ficar do outro lado do arrasto.
/// Medidas no mono de 10px (avanço ~6px/caractere): "10-8" = 24, "-105" = 24.
const double _colWins = 16;
const double _colLosses = 16;
const double _colSets = 26;
const double _colPointsFor = 20;
const double _colPointsAgainst = 20;
const double _colPointsDiff = 26;
const double _colPoints = 20;

/// Largura da tabela com o nome no piso — abaixo disso ela rola na horizontal.
const double _tableMinWidth = _rowLeadingInset +
    _colRank +
    _colNameMin +
    _colWins +
    _colLosses +
    _colSets +
    _colPointsFor +
    _colPointsAgainst +
    _colPointsDiff +
    _colPoints +
    _rowTrailingInset;

class _StandingsTableHeader extends StatelessWidget {
  const _StandingsTableHeader({required this.nameWidth});

  final double nameWidth;

  @override
  Widget build(BuildContext context) {
    final muted = context.themeColors.onSurfaceMuted;
    final style = AppTypography.mono(
      fontSize: 9,
      fontWeight: FontWeight.w600,
      color: muted,
      letterSpacing: 0.5,
    );

    Widget cell(String label, double width, {TextAlign align = TextAlign.center}) {
      return SizedBox(
        width: width,
        child: Text(label, style: style, textAlign: align),
      );
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(
        _rowLeadingInset,
        0,
        _rowTrailingInset,
        0,
      ),
      child: Row(
        children: [
          SizedBox(width: _colRank, child: Text('#', style: style)),
          SizedBox(width: nameWidth, child: Text('DUPLA', style: style)),
          cell('V', _colWins),
          cell('D', _colLosses),
          cell('SETS', _colSets),
          cell('PF', _colPointsFor),
          cell('PT', _colPointsAgainst),
          cell('SP', _colPointsDiff),
          cell('PTS', _colPoints, align: TextAlign.end),
        ],
      ),
    );
  }
}

class _StandingsTableRow extends StatelessWidget {
  const _StandingsTableRow({
    required this.row,
    required this.nameWidth,
    required this.highlightQualifiers,
  });

  final TournamentPoolStandingsRow row;
  final double nameWidth;
  final bool highlightQualifiers;

  /// Mesmo código de cores da tela de grupos do portal do organizador: saldo
  /// positivo em verde, negativo em vermelho, zero sem destaque.
  Color _pointsDiffColor(BuildContext context) {
    if (row.pointsDiff > 0) return AppColors.win;
    if (row.pointsDiff < 0) return AppColors.live;
    return context.themeColors.onSurfaceMuted;
  }

  @override
  Widget build(BuildContext context) {
    final qualifies = highlightQualifiers && row.qualifies;
    final rankColor = qualifies ? AppColors.win : context.themeColors.onSurfaceMuted;
    final statColor = context.themeColors.onSurfaceMuted;
    final ptsColor = context.themeColors.onSurface;

    Widget cell(
      String value,
      double width, {
      required Color color,
      FontWeight fontWeight = FontWeight.w400,
      TextAlign align = TextAlign.center,
    }) {
      return SizedBox(
        width: width,
        child: Text(
          value,
          textAlign: align,
          style: AppTypography.mono(
            fontSize: 10,
            fontWeight: fontWeight,
            color: color,
          ),
        ),
      );
    }

    Color? background;
    if (row.isAthleteTeam) {
      background = AppColors.brand.withValues(alpha: 0.08);
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 2),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(6),
      ),
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (qualifies)
              Container(
                width: 3,
                decoration: BoxDecoration(
                  color: AppColors.win,
                  borderRadius: const BorderRadius.horizontal(
                    left: Radius.circular(6),
                  ),
                ),
              ),
            Expanded(
              child: Padding(
                padding: EdgeInsets.fromLTRB(
                  qualifies ? _rowLeadingInset - 3 : _rowLeadingInset,
                  8,
                  _rowTrailingInset,
                  8,
                ),
                child: Row(
                  children: [
                    SizedBox(
                      width: _colRank,
                      child: Text(
                        '${row.rank}',
                        style: AppTypography.mono(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: rankColor,
                        ),
                      ),
                    ),
                    SizedBox(
                      width: nameWidth,
                      child: Text(
                        row.displayName,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.soraRegular(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w600,
                          color: context.themeColors.onSurface,
                        ),
                      ),
                    ),
                    cell('${row.wins}', _colWins, color: statColor),
                    cell('${row.losses}', _colLosses, color: statColor),
                    cell(row.setsForDisplay, _colSets, color: statColor),
                    cell('${row.gamesWon}', _colPointsFor, color: statColor),
                    cell('${row.gamesLost}', _colPointsAgainst, color: statColor),
                    cell(
                      row.pointsDiffLabel,
                      _colPointsDiff,
                      color: _pointsDiffColor(context),
                      fontWeight: row.pointsDiff == 0
                          ? FontWeight.w400
                          : FontWeight.w700,
                    ),
                    cell(
                      '${row.points}',
                      _colPoints,
                      color: ptsColor,
                      fontWeight: FontWeight.w700,
                      align: TextAlign.end,
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class TournamentGroupStandingsFooter extends StatelessWidget {
  const TournamentGroupStandingsFooter({
    super.key,
    required this.qualifiersPerGroup,
  });

  final int qualifiersPerGroup;

  @override
  Widget build(BuildContext context) {
    final plural = qualifiersPerGroup == 1 ? 'primeira dupla' : 'primeiras duplas';

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: context.themeColors.surfaceCard,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.1),
          ),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 6,
              height: 6,
              margin: const EdgeInsets.only(top: 5),
              decoration: const BoxDecoration(
                color: AppColors.win,
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'As $qualifiersPerGroup $plural de cada grupo avançam para a próxima fase.',
                    style: AppTypography.soraRegular(
                      fontSize: 12,
                      color: context.themeColors.onSurfaceMuted,
                      height: 1.4,
                    ),
                  ),
                  const SizedBox(height: 6),
                  // No portal do organizador as siglas têm tooltip; aqui não há
                  // hover, então a legenda é a única forma de decifrar a tabela.
                  Text(
                    'V vitórias · D derrotas · SETS sets ganhos-perdidos · '
                    'PF pontos feitos · PT pontos tomados · SP saldo de pontos · '
                    'PTS pontos de classificação.',
                    style: AppTypography.soraRegular(
                      fontSize: 11,
                      color: context.themeColors.onSurfaceMuted
                          .withValues(alpha: 0.75),
                      height: 1.4,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
