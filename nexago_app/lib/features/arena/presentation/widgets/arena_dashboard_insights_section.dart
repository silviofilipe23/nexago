import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../data/arena_dashboard_insights.dart';
import '../../domain/arena_access_providers.dart';
import '../../domain/arena_dashboard_summary.dart';
import '../../domain/arena_schedule_providers.dart';
import '../../domain/arena_staff_role.dart';
import 'arena_promotions_sheet.dart';

/// Leituras automáticas do dia (regras fixas de `ArenaDashboardInsights`).
///
/// Sem selo de "IA" nem hora de atualização: as linhas são regras simples e
/// os dados já chegam em tempo real. A linha de ocupação baixa oferece a
/// ação de criar promoção para quem escreve `promocoes`.
class ArenaDashboardInsightsSection extends ConsumerWidget {
  const ArenaDashboardInsightsSection({
    super.key,
    required this.summary,
    required this.includeMoney,
    this.showTitle = true,
    this.maxLines,
  });

  final ArenaDashboardSummary summary;

  /// Mesmo `seesMoney` (`arenaCanReadProvider(ArenaArea.financeiro)`) que já
  /// gateia o KPI de Faturamento e o gráfico de receita no Painel — a linha
  /// "Melhor dia" declara uma soma em R$ e não pode escapar desse gate.
  final bool includeMoney;

  final bool showTitle;

  /// Limita quantas linhas aparecem (a aba Agora mostra só a primeira).
  final int? maxLines;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final all = ArenaDashboardInsights.lines(
      summary,
      includeMoney: includeMoney,
    );
    final lines = maxLines == null ? all : all.take(maxLines!).toList();
    if (lines.isEmpty) return const SizedBox.shrink();

    final canPromote = ref.watch(arenaCanWriteProvider(ArenaArea.promocoes));
    final arenaId = ref.watch(managedArenaIdProvider).valueOrNull ?? '';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (showTitle) ...[
          Text(
            'Leituras do dia',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.3,
                  color: context.themeColors.onSurface,
                ),
          ),
          const SizedBox(height: 12),
        ],
        for (var i = 0; i < lines.length; i++) ...[
          if (i > 0) const SizedBox(height: 10),
          _InsightCard(
            line: lines[i],
            onPromote: canPromote &&
                    arenaId.isNotEmpty &&
                    lines[i].kind == ArenaDashboardInsightKind.lowOccupancy
                ? () => ArenaPromotionsSheet.show(context, arenaId: arenaId)
                : null,
          ),
        ],
      ],
    );
  }
}

class _InsightCard extends StatelessWidget {
  const _InsightCard({required this.line, this.onPromote});

  final ArenaDashboardInsightLine line;
  final VoidCallback? onPromote;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final theme = Theme.of(context);
    final (accent, icon) = switch (line.tone) {
      ArenaDashboardInsightTone.warning => (
          colors.pending,
          Icons.trending_down_rounded,
        ),
      ArenaDashboardInsightTone.success => (
          colors.win,
          Icons.trending_up_rounded,
        ),
      ArenaDashboardInsightTone.highlight => (
          colors.brandText,
          Icons.emoji_events_outlined,
        ),
    };

    return Container(
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 10),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: accent.withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: accent, size: 18),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  line.message,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    height: 1.35,
                    fontWeight: FontWeight.w500,
                    color: colors.onSurface,
                  ),
                ),
                if (onPromote != null)
                  TextButton(
                    onPressed: onPromote,
                    style: TextButton.styleFrom(
                      foregroundColor: colors.brandText,
                      padding: EdgeInsets.zero,
                      minimumSize: const Size(0, 36),
                      tapTargetSize: MaterialTapTargetSize.padded,
                    ),
                    child: const Text('Criar promoção ›'),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
