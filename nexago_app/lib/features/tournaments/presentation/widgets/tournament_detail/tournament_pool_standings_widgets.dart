import 'dart:math' as math;
import 'dart:ui';

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
    this.showFooter = true,
    this.padding = const EdgeInsets.fromLTRB(20, 8, 20, 0),
  });

  final TournamentPoolStandingsGroup group;
  final int qualifiersPerGroup;

  /// Legenda (regra + siglas) no rodapé interno do card. Na aba com vários
  /// grupos, só o último card liga — evita repetir a mesma linha N vezes.
  final bool showFooter;

  /// Recuo externo. No carrossel do Focus o PageView já controla a margem.
  final EdgeInsetsGeometry padding;

  static const _radius = 14.0;

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
      padding: padding,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(_radius),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.06),
              borderRadius: BorderRadius.circular(_radius),
              border: Border.all(
                color: Colors.white.withValues(alpha: 0.12),
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
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
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
                // Nove colunas não cabem num celular. Em vez de esticar o nome até
                // esconder o overflow, a tabela mantém a largura mínima e o bloco
                // INTEIRO anda de lado — cabeçalho e linhas no mesmo scroll.
                LayoutBuilder(
                  builder: (context, constraints) {
                    // Em celular, trava no piso da tabela para o scroll horizontal
                    // aparecer (PTS fica atrás do arrasto). Em tablet, preenche.
                    final tableWidth = constraints.maxWidth < _tableMinWidth + 80
                        ? _tableMinWidth
                        : math.max(_tableMinWidth, constraints.maxWidth);
                    final nameWidth =
                        _colNameMin + (tableWidth - _tableMinWidth);

                    return SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      physics: const BouncingScrollPhysics(
                        parent: AlwaysScrollableScrollPhysics(),
                      ),
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
                if (showFooter) ...[
                  const SizedBox(height: 12),
                  Divider(
                    height: 1,
                    thickness: 1,
                    color: Colors.white.withValues(alpha: 0.10),
                  ),
                  const SizedBox(height: 10),
                  _StandingsCardFooter(qualifiersPerGroup: qualifiersPerGroup),
                ],
              ],
            ),
          ),
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

/// Espaço entre colunas (cabeçalho e linhas usam o mesmo).
const double _colGap = 10;

const double _colRank = 28;

/// Piso do nome da dupla. Cabe "Nome Completo / Nome Completo" na maioria dos
/// celulares; o que passar disso rola na horizontal com o resto da tabela.
const double _colNameMin = 240;

/// As numéricas são justas de propósito. Num celular de 360dp o corte tem de
/// cair DEPOIS do SP — ele é o dado que a tabela existe pra mostrar, e nascer
/// escondido atrás do scroll anularia a mudança. Só PTS, que é `V × 2` e já
/// está implícito na ordem das linhas, pode ficar do outro lado do arrasto.
/// Medidas no mono de 12px (avanço ~7px/caractere): "10-8" ≈ 28, "-105" ≈ 28.
const double _colWins = 22;
const double _colLosses = 22;
const double _colSets = 36;
const double _colPointsFor = 28;
const double _colPointsAgainst = 28;
const double _colPointsDiff = 36;
const double _colPoints = 28;

/// 9 colunas → 8 gaps entre elas.
const int _colGapCount = 8;

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
    (_colGap * _colGapCount) +
    _rowTrailingInset;

class _StandingsTableHeader extends StatelessWidget {
  const _StandingsTableHeader({required this.nameWidth});

  final double nameWidth;

  @override
  Widget build(BuildContext context) {
    final muted = context.themeColors.onSurfaceMuted;
    final style = AppTypography.mono(
      fontSize: 10,
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
          const SizedBox(width: _colGap),
          SizedBox(width: nameWidth, child: Text('DUPLA', style: style)),
          const SizedBox(width: _colGap),
          cell('V', _colWins),
          const SizedBox(width: _colGap),
          cell('D', _colLosses),
          const SizedBox(width: _colGap),
          cell('SETS', _colSets),
          const SizedBox(width: _colGap),
          cell('PF', _colPointsFor),
          const SizedBox(width: _colGap),
          cell('PT', _colPointsAgainst),
          const SizedBox(width: _colGap),
          cell('SP', _colPointsDiff),
          const SizedBox(width: _colGap),
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
            fontSize: 12,
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
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: rankColor,
                        ),
                      ),
                    ),
                    const SizedBox(width: _colGap),
                    SizedBox(
                      width: nameWidth,
                      child: Text(
                        row.displayName,
                        maxLines: 2,
                        softWrap: true,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.soraRegular(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: context.themeColors.onSurface,
                          height: 1.2,
                        ),
                      ),
                    ),
                    const SizedBox(width: _colGap),
                    cell('${row.wins}', _colWins, color: statColor),
                    const SizedBox(width: _colGap),
                    cell('${row.losses}', _colLosses, color: statColor),
                    const SizedBox(width: _colGap),
                    cell(row.setsForDisplay, _colSets, color: statColor),
                    const SizedBox(width: _colGap),
                    cell('${row.gamesWon}', _colPointsFor, color: statColor),
                    const SizedBox(width: _colGap),
                    cell('${row.gamesLost}', _colPointsAgainst, color: statColor),
                    const SizedBox(width: _colGap),
                    cell(
                      row.pointsDiffLabel,
                      _colPointsDiff,
                      color: _pointsDiffColor(context),
                      fontWeight: row.pointsDiff == 0
                          ? FontWeight.w400
                          : FontWeight.w700,
                    ),
                    const SizedBox(width: _colGap),
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

class _StandingsCardFooter extends StatelessWidget {
  const _StandingsCardFooter({required this.qualifiersPerGroup});

  final int qualifiersPerGroup;

  @override
  Widget build(BuildContext context) {
    final rule = qualifiersPerGroup == 1
        ? 'Top 1 de cada grupo avança.'
        : 'Top $qualifiersPerGroup de cada grupo avançam.';

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 5,
          height: 5,
          margin: const EdgeInsets.only(top: 4),
          decoration: const BoxDecoration(
            color: AppColors.win,
            shape: BoxShape.circle,
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          // No portal do organizador as siglas têm tooltip; aqui a legenda é a
          // única forma de decifrar a tabela.
          child: Text(
            '$rule  V vitórias · D derrotas · SETS · '
            'PF feitos · PT tomados · SP saldo · PTS',
            style: AppTypography.soraRegular(
              fontSize: 11,
              color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.8),
              height: 1.35,
            ),
          ),
        ),
      ],
    );
  }
}
