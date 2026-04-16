import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'dart:math' as math;

import '../../../core/auth/auth_providers.dart';
import '../../../core/layout/app_scaffold.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/ui/success_page.dart';
import '../../../core/ui/fade_slide_in.dart';
import '../../athlete/domain/favorites_providers.dart';
import '../domain/arena_providers.dart';
import '../domain/review_reply_providers.dart';
import 'widgets/reply_review_dialog.dart';
import 'arena_dashboard_formatters.dart';
import 'widgets/arena_dashboard_actions_bar.dart';
import 'widgets/arena_dashboard_insights_section.dart';
import 'widgets/arena_dashboard_kpi_grid.dart';
import 'widgets/arena_dashboard_revenue_chart.dart';
import 'widgets/arena_dashboard_section_card.dart';

class ArenaDashboardPage extends ConsumerWidget {
  const ArenaDashboardPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summaryAsync = ref.watch(arenaDashboardSummaryProvider);
    final arenaId = ref.watch(managedArenaIdProvider).valueOrNull;
    final followersInsightsAsync = arenaId == null || arenaId.isEmpty
        ? const AsyncValue<ArenaFollowersInsights>.data(
            ArenaFollowersInsights(
              totalFollowers: 0,
              growthLastWeek: 0,
              qualityBookedPercent: 0,
              activeRecentlyPercent: 0,
            ),
          )
        : ref.watch(arenaFollowersInsightsProvider(arenaId));
    final theme = Theme.of(context);

    return AppScaffold(
      title: 'Visão geral',
      centerTitle: false,
      body: ColoredBox(
        color: theme.colorScheme.surfaceContainerLowest,
        child: SafeArea(
          child: LayoutBuilder(
            builder: (context, constraints) {
              final maxW = constraints.maxWidth > 720 ? 640.0 : double.infinity;
              return Center(
                child: SingleChildScrollView(
                  key: const PageStorageKey<String>('arena-dashboard-scroll'),
                  padding: const EdgeInsets.fromLTRB(28, 20, 28, 40),
                  child: ConstrainedBox(
                    constraints: BoxConstraints(maxWidth: maxW),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        FadeSlideIn(
                          duration: const Duration(milliseconds: 420),
                          offsetY: 14,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const SizedBox(height: 12),
                              Text(
                                'Acompanhe faturamento, ocupação e tendência da semana em um só lugar.',
                                style: theme.textTheme.bodyLarge?.copyWith(
                                  color: AppColors.onSurfaceMuted,
                                  height: 1.5,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 36),
                        summaryAsync.when(
                          data: (summary) => Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Text(
                                'Hoje',
                                style: theme.textTheme.titleMedium?.copyWith(
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: -0.3,
                                ),
                              ),
                              const SizedBox(height: 18),
                              ArenaDashboardKpiGrid(
                                items: [
                                  ArenaDashboardKpiItem(
                                    label: 'Faturamento',
                                    value: formatDashboardCurrency(
                                      summary.revenueToday,
                                    ),
                                    icon: Icons.payments_rounded,
                                  ),
                                  ArenaDashboardKpiItem(
                                    label: 'Ocupação',
                                    value: formatDashboardOccupancyPercent(
                                      summary.occupancyRatePercent,
                                    ),
                                    icon: Icons.stacked_bar_chart_rounded,
                                  ),
                                  ArenaDashboardKpiItem(
                                    label: 'Reservas',
                                    value: '${summary.bookingsToday}',
                                    icon: Icons.event_available_rounded,
                                  ),
                                  ArenaDashboardKpiItem(
                                    label: 'Pico',
                                    value: formatDashboardPeakHour(
                                      summary.peakHour,
                                    ),
                                    icon: Icons.local_fire_department_rounded,
                                  ),
                                ],
                              ),
                              const SizedBox(height: 36),
                              ArenaDashboardSectionCard(
                                title: 'Faturamento — últimos 7 dias',
                                subtitle:
                                    'Soma diária das reservas válidas na amostra carregada.',
                                child: ArenaDashboardRevenueChart(
                                  values: summary.revenueLast7Days,
                                  labels: summary.chartDayLabels,
                                ),
                              ),
                              const SizedBox(height: 36),
                              ArenaDashboardInsightsSection(summary: summary),
                              const SizedBox(height: 36),
                              _FollowersInsightCard(
                                insightsAsync: followersInsightsAsync,
                              ),
                              const SizedBox(height: 36),
                              const _ReviewReputationSection(),
                              const SizedBox(height: 36),
                              const ArenaDashboardActionsBar(),
                            ],
                          ),
                          loading: () => const Padding(
                            padding: EdgeInsets.symmetric(vertical: 56),
                            child: Center(
                              child: SizedBox(
                                width: 32,
                                height: 32,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2.8,
                                ),
                              ),
                            ),
                          ),
                          error: (e, _) => Padding(
                            padding: const EdgeInsets.symmetric(vertical: 32),
                            child: Text(
                              'Não foi possível carregar o painel. Tente de novo.',
                              style: theme.textTheme.bodyLarge?.copyWith(
                                color: theme.colorScheme.error,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}

class _ReviewReputationSection extends ConsumerWidget {
  const _ReviewReputationSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final metricsAsync = ref.watch(arenaReviewReputationMetricsProvider);
    final pendingReviewsAsync = ref.watch(managedArenaPendingReviewsProvider);
    final arenaId = ref.watch(managedArenaIdProvider).valueOrNull ?? '';
    final managerId = ref.watch(authProvider).valueOrNull?.uid ?? '';
    final replyService = ref.watch(reviewReplyServiceProvider);
    final theme = Theme.of(context);
    return ArenaDashboardSectionCard(
      title: 'Reputação e respostas',
      subtitle: 'Gestão ativa de feedback para gerar confiança.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          metricsAsync.when(
            loading: () => const LinearProgressIndicator(minHeight: 2),
            error: (e, _) => Text(
              'Não foi possível carregar métricas de reputação.',
              style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.error),
            ),
            data: (m) => Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '💬 ${m.repliedPercent.toStringAsFixed(0)}% das avaliações respondidas',
                  style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 6),
                Text(
                  'Tempo médio de resposta: ${m.averageReplyHours.toStringAsFixed(1)}h',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
                if (m.negativePendingCount > 0) ...[
                  const SizedBox(height: 8),
                  Text(
                    '⚠️ $m.negativePendingCount avaliações críticas sem resposta',
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: const Color(0xFFC62828),
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Text(
                'Pendentes de resposta',
                style: theme.textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
              ),
              const Spacer(),
              TextButton(
                onPressed: () => context.pushNamed(AppRouteNames.arenaManagerReviews),
                child: const Text('Ver todas'),
              ),
            ],
          ),
          const SizedBox(height: 8),
          pendingReviewsAsync.when(
            loading: () => const Center(child: CircularProgressIndicator(strokeWidth: 2)),
            error: (e, _) => Text(
              'Não foi possível carregar avaliações da arena.',
              style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.error),
            ),
            data: (reviews) {
              if (reviews.isEmpty) {
                return const Text('Nenhuma avaliação pendente de resposta.');
              }
              return Column(
                children: reviews.take(8).map((review) {
                  final isNegative = review.rating <= 2;
                  final hasReply = review.reply != null;
                  final canReply = arenaId.isNotEmpty && managerId.isNotEmpty;
                  return Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: isNegative
                          ? const Color(0xFFFFEBEE)
                          : theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.3),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: isNegative
                            ? const Color(0xFFFFCDD2)
                            : theme.colorScheme.outline.withValues(alpha: 0.15),
                      ),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Text('⭐ ${review.rating}'),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                review.athleteName ?? 'Atleta',
                                style: theme.textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w700),
                              ),
                            ),
                            if (isNegative)
                              const Text('Prioridade alta', style: TextStyle(color: Color(0xFFC62828), fontWeight: FontWeight.w700)),
                          ],
                        ),
                        if ((review.comment ?? '').trim().isNotEmpty) ...[
                          const SizedBox(height: 6),
                          Text(review.comment!),
                        ],
                        if (hasReply) ...[
                          const SizedBox(height: 8),
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.all(10),
                            decoration: BoxDecoration(
                              color: const Color(0xFFF5F5F5),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Text('🏟️ Resposta da arena\n${review.reply!.message}'),
                          ),
                        ],
                        const SizedBox(height: 8),
                        Align(
                          alignment: Alignment.centerRight,
                          child: OutlinedButton(
                            onPressed: !canReply
                                ? null
                                : () async {
                                    final text = await showReplyReviewDialog(
                                      context,
                                      originalComment: review.comment ?? '',
                                      rating: review.rating,
                                      initialValue: review.reply?.message,
                                    );
                                    if (text == null) return;
                                    try {
                                      if (review.reply == null) {
                                        await replyService.replyToReview(
                                          reviewId: review.id,
                                          arenaId: arenaId,
                                          managerUserId: managerId,
                                          message: text,
                                        );
                                      } else {
                                        await replyService.updateReviewReply(
                                          reviewId: review.id,
                                          arenaId: arenaId,
                                          managerUserId: managerId,
                                          message: text,
                                        );
                                      }
                                      if (context.mounted) {
                                        final scrollable = Scrollable.maybeOf(context);
                                        final previousOffset =
                                            scrollable?.position.pixels ?? 0;
                                        await Navigator.of(context).push(
                                          MaterialPageRoute<void>(
                                            builder: (_) => const _ReviewReplySuccessPage(),
                                          ),
                                        );
                                        WidgetsBinding.instance
                                            .addPostFrameCallback((_) {
                                          final position = scrollable?.position;
                                          if (position == null ||
                                              !position.hasPixels) {
                                            return;
                                          }
                                          final target = math.min(
                                            previousOffset,
                                            position.maxScrollExtent,
                                          );
                                          position.jumpTo(target);
                                        });
                                      }
                                    } catch (e) {
                                      if (context.mounted) {
                                        ScaffoldMessenger.of(context).showSnackBar(
                                          SnackBar(content: Text('Erro ao salvar resposta: $e')),
                                        );
                                      }
                                    }
                                  },
                            child: Text(hasReply ? 'Editar resposta' : 'Responder'),
                          ),
                        ),
                      ],
                    ),
                  );
                }).toList(growable: false),
              );
            },
          ),
        ],
      ),
    );
  }
}

class _ReviewReplySuccessPage extends StatelessWidget {
  const _ReviewReplySuccessPage();

  @override
  Widget build(BuildContext context) {
    return SuccessPage(
      title: 'Resposta enviada',
      message:
          'Sua resposta foi publicada com sucesso e agora ajuda novos atletas a confiarem ainda mais na arena.',
      primaryActionLabel: 'Voltar ao painel',
      onPrimaryAction: () => Navigator.of(context).pop(),
    );
  }
}

class _FollowersInsightCard extends StatelessWidget {
  const _FollowersInsightCard({
    required this.insightsAsync,
  });

  final AsyncValue<ArenaFollowersInsights> insightsAsync;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ArenaDashboardSectionCard(
      title: 'Seguidores',
      subtitle: 'Base social para campanhas e torneios.',
      child: insightsAsync.when(
        loading: () => const SizedBox(
          height: 42,
          child: Align(
            alignment: Alignment.centerLeft,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        ),
        error: (e, _) => Text(
          'Nao foi possivel carregar seguidores.',
          style: theme.textTheme.bodyMedium?.copyWith(
            color: theme.colorScheme.error,
          ),
        ),
        data: (insights) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '❤️ ${insights.totalFollowers} seguidores',
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                '+${insights.growthLastWeek} essa semana',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 10),
              Text(
                '🔥 ${insights.activeRecentlyPercent.toStringAsFixed(0)}% dos seguidores jogaram este mes',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: const Color(0xFF2E7D32),
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                'Qualidade: ${insights.qualityBookedPercent.toStringAsFixed(0)}% ja reservaram',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 14),
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: [
                  OutlinedButton(
                    onPressed: () {},
                    child: const Text('Criar promocao'),
                  ),
                  OutlinedButton(
                    onPressed: () {},
                    child: const Text('Criar torneio'),
                  ),
                ],
              ),
            ],
          );
        },
      ),
    );
  }
}
