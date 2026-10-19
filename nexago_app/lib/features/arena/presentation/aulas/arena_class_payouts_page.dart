import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../core/formatting/app_currency_format.dart';
import '../../../../core/router/routes.dart';
import '../../domain/aulas/arena_class_billing_logic.dart';
import '../../domain/aulas/arena_class_enrollment_providers.dart';
import '../../domain/aulas/arena_class_logic.dart';
import '../../domain/aulas/arena_class_payout_logic.dart';
import '../../domain/aulas/arena_class_payout_providers.dart';
import '../widgets/arena_async_state.dart';
import 'widgets/arena_class_atoms.dart';
import 'widgets/arena_class_form_atoms.dart';
import 'widgets/arena_class_payout_atoms.dart';

/// Repasse dos professores no mês (tela 15, lista): prévia do servidor
/// (`previewArenaClassPayouts`) + fechamentos gravados (`arenaClassPayouts`).
/// O detalhe de cada professor fecha o mês e registra o pagamento, que é
/// feito por fora. Só quem lê o financeiro chega aqui (guard da rota).
class ArenaClassPayoutsPage extends ConsumerStatefulWidget {
  const ArenaClassPayoutsPage({super.key, this.month});

  /// `YYYY-MM` da URL; inválido ou futuro cai no mês padrão.
  final String? month;

  @override
  ConsumerState<ArenaClassPayoutsPage> createState() =>
      _ArenaClassPayoutsPageState();
}

class _ArenaClassPayoutsPageState extends ConsumerState<ArenaClassPayoutsPage> {
  late String _month;

  @override
  void initState() {
    super.initState();
    final today = ref.read(arenaClassTodayKeyProvider);
    final raw = widget.month;
    _month = arenaClassIsMonthKey(raw) &&
            raw!.compareTo(arenaClassMonthOf(today)) <= 0
        ? raw
        : arenaClassDefaultPayoutMonth(today);
  }

  @override
  Widget build(BuildContext context) {
    final todayKey = ref.watch(arenaClassTodayKeyProvider);
    final currentMonth = arenaClassMonthOf(todayKey);
    final viewAsync = ref.watch(arenaClassPayoutMonthViewProvider(_month));

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: SafeArea(
        bottom: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ArenaClassHeader(
              eyebrow: 'AULAS',
              title: 'Repasse dos professores',
              subtitle: 'FECHAMENTO MENSAL',
              onBack: () => context.pop(),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 6),
              child: ArenaClassMonthNav(
                month: _month,
                currentMonth: currentMonth,
                onChanged: (m) => setState(() => _month = m),
              ),
            ),
            Expanded(
              child: viewAsync.when(
                data: (view) => _Body(
                  view: view,
                  month: _month,
                  isCurrent: _month.compareTo(currentMonth) >= 0,
                ),
                loading: () =>
                    const ArenaLoadingState(label: 'Calculando o repasse...'),
                error: (e, _) => ArenaErrorState(
                  message: '$e',
                  onRetry: () =>
                      ref.invalidate(arenaClassPayoutPreviewProvider(_month)),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Body extends ConsumerWidget {
  const _Body({
    required this.view,
    required this.month,
    required this.isCurrent,
  });

  final ArenaClassPayoutMonthView view;
  final String month;
  final bool isCurrent;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final totals = view.totals;
    final short = arenaClassMonthShortLabel(month);
    final preview = view.preview;
    final nextMonth =
        arenaClassMonthName('${arenaClassShiftMonth(month, 1)}-01');

    return RefreshIndicator(
      color: AppColors.brand,
      onRefresh: () =>
          ref.refresh(arenaClassPayoutPreviewProvider(month).future),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: EdgeInsets.fromLTRB(
          16,
          8,
          16,
          MediaQuery.paddingOf(context).bottom + 32,
        ),
        children: [
          ArenaClassPanel(
            highlight: true,
            padding: const EdgeInsets.fromLTRB(18, 16, 18, 14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                ArenaClassKicker('Repasse · $short',
                    color: AppColors.brandHover),
                const SizedBox(height: 6),
                FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: Text(
                    formatBRL(totals.totalReais),
                    style: AppTypography.soraRegular(
                      fontSize: 34,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -1.2,
                      color: colors.onSurface,
                    ),
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '${totals.teachers} professor'
                  '${totals.teachers == 1 ? '' : 'es'}',
                  style:
                      TextStyle(fontSize: 11.5, color: colors.onSurfaceMuted),
                ),
                const SizedBox(height: 12),
                ArenaClassPayoutStatRow(
                  stats: [
                    ArenaClassPayoutStat(
                      label: 'Pago',
                      value: formatBRL(totals.paidReais),
                      color: AppColors.win,
                      sub: '${totals.paidCount} de ${totals.teachers}',
                    ),
                    ArenaClassPayoutStat(
                      label: 'A pagar',
                      value: formatBRL(totals.toPayReais),
                      sub: isCurrent
                          ? 'fechamento em '
                              '${arenaClassShortDate(arenaClassMonthLastDay(month))}'
                          : 'mês encerrado',
                    ),
                    ArenaClassPayoutStat(
                      label: 'Receita de aulas',
                      value: formatBRL(preview.revenueReais),
                      color: AppColors.win,
                      sub: preview.feesReais > 0
                          ? 'sem ${formatBRL(preview.feesReais)} de taxa'
                          : 'mensalidades pagas',
                    ),
                  ],
                ),
              ],
            ),
          ),
          if (isCurrent) ...[
            const SizedBox(height: 12),
            ArenaClassInfoBanner(
              'Mês em andamento — valores parciais. O fechamento abre em 1º '
              'de $nextMonth.',
            ),
          ],
          const SizedBox(height: 16),
          ArenaClassKicker('Professores · ${arenaClassMonthLongLabel(month)}'),
          const SizedBox(height: 10),
          if (view.rows.isEmpty)
            ArenaEmptyState(
              title: 'Nenhum professor no mês',
              message: 'Nenhum professor com aula ou receita em '
                  '${arenaClassMonthLongLabel(month)}.',
              icon: Icons.receipt_long_outlined,
            ),
          for (final r in view.rows)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: _PayoutRowCard(
                row: r,
                onTap: () => context.pushNamed(
                  AppRouteNames.arenaClassTeacherPayout,
                  pathParameters: {'teacherId': r.teacherId},
                  queryParameters: {'month': month},
                ),
              ),
            ),
          const SizedBox(height: 8),
          Text(
            'Receita = mensalidades e pacotes pagos no mês, rateados pelos '
            'horários de cada aluno entre os professores. Aulas e presenças '
            'contam só com a chamada fechada.'
            '${preview.unassignedReais > 0 ? ' ${formatBRL(preview.unassignedReais)} de receita sem horário na matrícula não entram em repasse.' : ''}',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 11.5,
              height: 1.45,
              color: colors.onSurfaceMuted,
            ),
          ),
        ],
      ),
    );
  }
}

class _PayoutRowCard extends StatelessWidget {
  const _PayoutRowCard({required this.row, required this.onTap});

  final ArenaClassPayoutRow row;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final r = row;
    final f = r.figures;
    final stateColor = arenaClassPayoutStateColor(context, r.state);
    final warn = r.stale
        ? 'Mudou desde o fechamento — recalcule'
        : f.pendingSessions > 0 && r.closed == null
            ? '${f.pendingSessions} aula${f.pendingSessions == 1 ? '' : 's'} '
                'sem chamada fechada'
            : null;
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(18),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: ArenaClassPanel(
          padding: const EdgeInsets.all(13),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  ArenaClassAvatar(
                    initials: arenaClassInitials(r.teacherName),
                    color: arenaClassTeacherColor(r.teacherColor),
                  ),
                  const SizedBox(width: 11),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          r.teacherName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AppTypography.soraRegular(
                            fontSize: 13.5,
                            fontWeight: FontWeight.w600,
                            color: colors.onSurface,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          f.model == null
                              ? 'Modelo não definido'
                              : '${arenaClassPayoutModelLabel(f.model)} · '
                                  '${arenaClassPayoutBaseLabel(f)}',
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 11,
                            color: colors.onSurfaceMuted,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        formatBRL(r.valueReais),
                        style: AppTypography.mono(
                          fontSize: 13.5,
                          fontWeight: FontWeight.w700,
                          color: AppColors.brand,
                        ),
                      ),
                      const SizedBox(height: 4),
                      ArenaClassTag(
                        label: arenaClassPayoutStateText(r.state, r.closed),
                        color: stateColor,
                      ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                '${f.classesGiven} aula${f.classesGiven == 1 ? '' : 's'} · '
                '${f.students} aluno${f.students == 1 ? '' : 's'}',
                style: AppTypography.mono(
                  fontSize: 10,
                  color: colors.onSurfaceMuted,
                ),
              ),
              if (warn != null) ...[
                const SizedBox(height: 4),
                Text(
                  warn,
                  style: AppTypography.mono(
                    fontSize: 10,
                    color: AppColors.pending,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
