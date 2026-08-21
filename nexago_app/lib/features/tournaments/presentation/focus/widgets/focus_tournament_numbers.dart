import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/focus/focus_journey_logic.dart';
import 'focus_empty_line.dart';

/// "Seus números no torneio": dois cards lado a lado — o placar de sets e os
/// pontos marcados, com a média por set como linha de apoio.
///
/// O placar de sets carrega a cor do SALDO, na mesma convenção do trilho da
/// campanha: verde quando ganhou mais sets do que perdeu, vermelho quando
/// perdeu mais, neutro no empate.
class FocusTournamentNumbers extends StatelessWidget {
  const FocusTournamentNumbers({super.key, required this.numbers});

  final TournamentNumbers numbers;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    // Sem set encerrado não existe número honesto pra mostrar: `0–0` e `0`
    // desenham uma campanha ruim onde ainda não houve campanha nenhuma.
    if (numbers.sets.isEmpty) {
      return const FocusEmptyLine(text: 'Nenhuma partida encerrada ainda.');
    }

    final setsColor = switch (numbers.setsWon.compareTo(numbers.setsLost)) {
      > 0 => colors.win,
      < 0 => AppColors.live,
      _ => colors.onSurface,
    };

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenH),
      // Os dois cards ficam da mesma altura mesmo com só um deles tendo linha
      // de apoio — sem isto, o card de SETS encolhe e a fileira desalinha.
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: _Card(
                label: 'SETS',
                value: '${numbers.setsWon}–${numbers.setsLost}',
                valueColor: setsColor,
              ),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: _Card(
                label: 'PONTOS',
                value: '${numbers.points}',
                valueColor: colors.onSurface,
                support: '${_decimal(numbers.pointsPerSet)} / set',
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// `25.2` vira `25,2` e `25.0` vira `25`: vírgula porque a UI é em
  /// português, e sem a casa decimal quando ela não diz nada.
  static String _decimal(double value) {
    final tenths = (value * 10).round();
    final whole = tenths ~/ 10;
    final rest = tenths % 10;
    return rest == 0 ? '$whole' : '$whole,$rest';
  }
}

class _Card extends StatelessWidget {
  const _Card({
    required this.label,
    required this.value,
    required this.valueColor,
    this.support,
  });

  final String label;
  final String value;
  final Color valueColor;
  final String? support;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Container(
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: colors.outline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: AppTypography.eyebrow.copyWith(color: colors.onSurfaceMuted),
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            value,
            style: AppTypography.monoStat.copyWith(
              color: valueColor,
              fontSize: 30,
            ),
          ),
          if (support case final text?) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(
              text,
              style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted),
            ),
          ],
        ],
      ),
    );
  }
}
