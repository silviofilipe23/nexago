import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/formatting/app_currency_format.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../application/squad_providers.dart';
import '../domain/squad_models.dart';
import '../domain/squad_rules.dart';
import 'squad_page.dart' show SquadLoadingList, SquadNotMember;
import 'widgets/squad_ui.dart';

/// App 03 · Ganhos — disponível, a liberar, semanas e extrato.
class SquadEarningsPage extends ConsumerWidget {
  const SquadEarningsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(mySquadProvider);
    return SquadScaffold(
      title: 'Ganhos',
      body: async.when(
        skipLoadingOnRefresh: true,
        loading: () => const SquadLoadingList(),
        error: (e, _) => SquadMessage(
          title: 'Não foi possível carregar seus ganhos',
          message: e.toString(),
          actionLabel: 'Tentar de novo',
          onAction: () => ref.invalidate(mySquadProvider),
          icon: Icons.wifi_off_rounded,
        ),
        data: (squad) {
          final m = squad.member;
          if (m == null) return SquadNotMember(invite: squad.invite);
          return RefreshIndicator(
            color: AppColors.brand,
            onRefresh: () => ref.refresh(mySquadProvider.future),
            child: _EarningsBody(member: m),
          );
        },
      ),
    );
  }
}

class _EarningsBody extends StatelessWidget {
  const _EarningsBody({required this.member});

  final SquadMember member;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final e = member.earnings;
    final statement = squadStatement(member);
    final now = DateTime.now();
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 6, 20, 40),
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        SquadCard(
          hot: true,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SquadLabel('Disponível'),
              const SizedBox(height: 6),
              Text(
                formatBRLFromCents(e.availableCents),
                key: const Key('squad-available'),
                style: SquadStyle.display(38, color: colors.onSurface),
              ),
              const SizedBox(height: 4),
              Text(
                squadPayoutLine(e),
                style: AppTypography.bodyS.copyWith(
                  fontSize: 12.5,
                  color: SquadStyle.mute(colors),
                ),
              ),
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.only(top: 14),
                decoration: BoxDecoration(
                  border: Border(
                    top: BorderSide(color: SquadStyle.line(colors)),
                  ),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: _Stat(label: 'A liberar', cents: e.pendingCents),
                    ),
                    Expanded(
                      child: _Stat(label: 'Recebido', cents: e.receivedCents),
                    ),
                    Expanded(
                      child: _Stat(
                        label: member.isPilot ? 'No piloto' : 'No ciclo',
                        cents: e.totalCents,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SquadSection('Por semana'),
        SquadWeekBars(weeks: member.weekly),
        const SquadSection('Extrato'),
        if (statement.isEmpty)
          const SquadNote(
            child: Text('Nenhuma movimentação neste ciclo ainda.'),
          )
        else
          for (var i = 0; i < statement.length; i++)
            _StatementRow(item: statement[i], divider: i > 0, now: now),
        const SizedBox(height: 16),
        const SquadNote(
          child: Text(
            'A comissão é liberada quando o pagamento é confirmado. Reembolsos '
            'cancelam a comissão.',
          ),
        ),
      ],
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.cents});

  final String label;
  final int cents;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: AppTypography.bodyS.copyWith(
            fontSize: 11,
            color: SquadStyle.dim(colors),
          ),
        ),
        const SizedBox(height: 2),
        Text(
          formatBRLFromCents(cents),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: SquadStyle.display(
            15,
            color: colors.onSurface,
            weight: FontWeight.w700,
          ),
        ),
      ],
    );
  }
}

/// Barras verticais das semanas; a maior em laranja cheio.
class SquadWeekBars extends StatelessWidget {
  const SquadWeekBars({super.key, required this.weeks, this.height = 100});

  final List<SquadWeek> weeks;
  final double height;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    if (weeks.isEmpty) return const SizedBox.shrink();
    final labels = squadWeekLabels(weeks);
    final max = weeks.fold<int>(0, (m, w) => w.cents > m ? w.cents : m);
    final hl = max == 0 ? -1 : weeks.indexWhere((w) => w.cents == max);
    return Semantics(
      label: 'Ganhos confirmados por semana',
      child: SizedBox(
        height: height + 20,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            for (var i = 0; i < weeks.length; i++) ...[
              if (i > 0) const SizedBox(width: 8),
              Expanded(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    Tooltip(
                      message: formatBRLFromCents(weeks[i].cents),
                      child: Container(
                        height: max == 0
                            ? 4
                            : (weeks[i].cents / max * height).clamp(4, height),
                        decoration: BoxDecoration(
                          color: i == hl
                              ? AppColors.brand
                              : AppColors.brand.withValues(alpha: 0.22),
                          borderRadius: BorderRadius.circular(6),
                        ),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      labels[i],
                      style: SquadStyle.mono(
                        9,
                        color: SquadStyle.dim(colors),
                        weight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _StatementRow extends StatelessWidget {
  const _StatementRow({
    required this.item,
    required this.divider,
    required this.now,
  });

  final SquadStatementItem item;
  final bool divider;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final payout = item.kind == SquadStatementKind.payout;
    final c = item.commission;
    final canceled = c?.status == SquadCommissionStatus.canceled;
    final day = item.at == null ? '' : '${squadRelativeDay(item.at!, now)} · ';
    final status = payout ? 'Carteira NexaGO' : squadCommissionStatusLabel(c!);
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12),
      decoration: BoxDecoration(
        border: divider
            ? Border(top: BorderSide(color: SquadStyle.line(colors)))
            : null,
      ),
      child: Row(
        children: [
          SquadIconTile(
            payout
                ? Icons.account_balance_wallet_outlined
                : Icons.trending_up_rounded,
            accent: payout,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.bodyM.copyWith(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w600,
                    color: colors.onSurface,
                  ),
                ),
                const SizedBox(height: 2),
                Text.rich(
                  TextSpan(
                    text: day,
                    children: [
                      TextSpan(
                        text: status,
                        style: TextStyle(
                          color: payout
                              ? SquadStyle.dim(colors)
                              : SquadStyle.toneColor(
                                  squadCommissionTone(c!),
                                  colors,
                                ),
                        ),
                      ),
                    ],
                  ),
                  style: AppTypography.bodyS.copyWith(
                    fontSize: 11.5,
                    color: SquadStyle.dim(colors),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(
            squadStatementAmount(item),
            style:
                SquadStyle.display(
                  14,
                  color: canceled ? SquadStyle.dim(colors) : colors.onSurface,
                  weight: FontWeight.w700,
                ).copyWith(
                  decoration: canceled ? TextDecoration.lineThrough : null,
                ),
          ),
        ],
      ),
    );
  }
}
