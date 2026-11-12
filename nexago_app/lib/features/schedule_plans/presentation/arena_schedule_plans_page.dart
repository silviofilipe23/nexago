import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/layout/nexa_app_bar.dart';
import '../../../core/router/navigation_helpers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/nexa_async_view.dart';
import '../../../core/ui/nexa_bottom_action_bar.dart';
import '../../../core/ui/nexa_skeleton.dart';
import '../../arenas/domain/arenas_providers.dart' show arenaByIdProvider;
import '../application/schedule_plans_providers.dart';
import '../domain/schedule_plan_logic.dart';
import '../domain/schedule_plan_models.dart';
import 'schedule_plans_routes.dart';
import 'widgets/schedule_plan_ui.dart';

/// A1 · Planos de horário da arena: os planos publicados, com preço,
/// desconto contra o avulso e vagas. "Escolher meu horário" abre o A2 do
/// plano marcado.
class ArenaSchedulePlansPage extends ConsumerStatefulWidget {
  const ArenaSchedulePlansPage({super.key, required this.arenaId});

  final String arenaId;

  @override
  ConsumerState<ArenaSchedulePlansPage> createState() =>
      _ArenaSchedulePlansPageState();
}

class _ArenaSchedulePlansPageState
    extends ConsumerState<ArenaSchedulePlansPage> {
  String? _selectedId;

  SchedulePlan? _selected(List<SchedulePlan> plans) {
    if (plans.isEmpty) return null;
    for (final p in plans) {
      if (p.id == _selectedId) return p;
    }
    return plans.first;
  }

  void _choose(SchedulePlan plan) {
    context.push(
      schedulePlanSignupLocation(arenaId: widget.arenaId, planId: plan.id),
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final plansAsync =
        ref.watch(arenaActiveSchedulePlansProvider(widget.arenaId));
    final arenaName =
        ref.watch(arenaByIdProvider(widget.arenaId)).valueOrNull?.name.trim();
    final plans = plansAsync.valueOrNull ?? const <SchedulePlan>[];
    final selected = _selected(plans);
    return Scaffold(
      backgroundColor: colors.canvas,
      appBar: NexaAppBar(
        centerTitle: true,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          tooltip: 'Voltar',
          onPressed: () => popOrGo(
            context,
            AppRoutes.arenaDetail.replaceAll(':arenaId', widget.arenaId),
          ),
        ),
        title: Text(
          arenaName == null || arenaName.isEmpty
              ? 'Planos'
              : '$arenaName · Planos',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
      ),
      bottomNavigationBar: selected == null
          ? null
          : NexaBottomActionBar(
              action: SchedulePrimaryButton(
                key: const Key('schedule-plans-choose'),
                label: selected.isFlexible
                    ? 'Assinar este plano'
                    : 'Escolher meu horário',
                onPressed: () => _choose(selected),
              ),
            ),
      body: NexaAsyncView<List<SchedulePlan>>(
        value: plansAsync,
        onRetry: () =>
            ref.invalidate(arenaActiveSchedulePlansProvider(widget.arenaId)),
        errorMessage: 'Não foi possível carregar os planos. Tente novamente.',
        skeleton: const _PlansSkeleton(),
        emptyWhen: (list) => list.isEmpty,
        empty: const _EmptyPlans(),
        data: (list) => ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
          children: [
            _Intro(
              mix: schedulePlansMix(list),
              arenaDefinesCourt: ref
                      .watch(arenaByIdProvider(widget.arenaId))
                      .valueOrNull
                      ?.bookingAllocation
                      .isCapacity ??
                  false,
            ),
            const SizedBox(height: 12),
            for (final plan in list) ...[
              SchedulePlanCard(
                plan: plan,
                selected: plan.id == selected?.id,
                onTap: () => setState(() => _selectedId = plan.id),
              ),
              const SizedBox(height: 12),
            ],
          ],
        ),
      ),
    );
  }
}

class _Intro extends StatelessWidget {
  const _Intro({required this.mix, this.arenaDefinesCourt = false});

  final SchedulePlansMix mix;

  /// A arena define a quadra a cada jogo (reservas por capacidade).
  final bool arenaDefinesCourt;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final intro = schedulePlansIntro(mix, arenaDefinesCourt: arenaDefinesCourt);
    return Padding(
      padding: const EdgeInsets.fromLTRB(2, 4, 2, 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            intro.title,
            style: AppTypography.soraRegular(
              fontSize: 24,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.5,
              height: 1.15,
              color: colors.onSurface,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            intro.body,
            key: const Key('schedule-plans-intro'),
            style: TextStyle(
              fontSize: 13,
              height: 1.45,
              color: colors.onSurfaceMuted,
            ),
          ),
        ],
      ),
    );
  }
}

/// Cartão do plano (A1): nome, frequência · duração · janela, desconto,
/// preço por mês e vagas.
class SchedulePlanCard extends StatelessWidget {
  const SchedulePlanCard({
    super.key,
    required this.plan,
    this.selected = false,
    this.onTap,
  });

  final SchedulePlan plan;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final off = schedulePlanDiscountPercent(plan);
    final savings = off == null ? null : schedulePlanMonthlySavingsReais(plan);
    final pixPrice = plan.billingMethods.contains(SchedulePaymentMethod.pixAuto)
        ? schedulePixPriceReais(plan.monthlyPriceReais, plan.pixDiscountPercent)
        : null;
    final (spots, tone) = scheduleSpotsLabel(scheduleSpotsLeft(plan));
    final spotsColor = switch (tone) {
      ScheduleSpotsTone.few => colors.pending,
      ScheduleSpotsTone.full => colors.pending,
      ScheduleSpotsTone.normal => colors.onSurfaceMuted,
    };
    return ScheduleCard(
      key: ValueKey('schedule-plan-card-${plan.id}'),
      selected: selected,
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      plan.name,
                      style: AppTypography.soraRegular(
                        fontSize: 15.5,
                        fontWeight: FontWeight.w700,
                        color: colors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      schedulePlanSubtitle(plan),
                      style: TextStyle(
                        fontSize: 12,
                        height: 1.35,
                        color: colors.onSurfaceMuted,
                      ),
                    ),
                  ],
                ),
              ),
              if (off != null) ...[
                const SizedBox(width: 10),
                ScheduleDiscountBadge(percent: off),
              ],
            ],
          ),
          const SizedBox(height: 12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text(
                scheduleMoney(plan.monthlyPriceReais),
                style: AppTypography.mono(
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                  color: colors.onSurface,
                ),
              ),
              const SizedBox(width: 6),
              Text(
                '/mês',
                style: TextStyle(fontSize: 12, color: colors.onSurfaceMuted),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  spots,
                  key: ValueKey('schedule-plan-spots-${plan.id}'),
                  textAlign: TextAlign.right,
                  style: TextStyle(
                    fontSize: 11.5,
                    fontWeight: tone == ScheduleSpotsTone.normal
                        ? FontWeight.w500
                        : FontWeight.w600,
                    color: spotsColor,
                  ),
                ),
              ),
            ],
          ),
          if (savings != null) ...[
            const SizedBox(height: 4),
            Text(
              'Economia de ${scheduleMoney(savings)} por mês vs avulso',
              key: ValueKey('schedule-plan-savings-${plan.id}'),
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: colors.win,
              ),
            ),
          ],
          if (pixPrice != null) ...[
            const SizedBox(height: 4),
            Text(
              '${scheduleMoney(pixPrice)}/mês no Pix '
              '(−${plan.pixDiscountPercent}%)',
              key: ValueKey('schedule-plan-pix-${plan.id}'),
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: colors.win,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _EmptyPlans extends StatelessWidget {
  const _EmptyPlans();

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.event_repeat_rounded, size: 40, color: colors.brandText),
            const SizedBox(height: 12),
            Text(
              'Nenhum plano de horário',
              style: AppTypography.soraRegular(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: colors.onSurface,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Esta arena ainda não vende planos de horário.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 13,
                height: 1.45,
                color: colors.onSurfaceMuted,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PlansSkeleton extends StatelessWidget {
  const _PlansSkeleton();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.fromLTRB(20, 12, 20, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          NexaSkeleton(width: 200, height: 26),
          SizedBox(height: 10),
          NexaSkeleton(width: 260, height: 13),
          SizedBox(height: 18),
          Expanded(
            child: NexaListSkeleton.cards(
              count: 4,
              cardHeight: 112,
              padding: EdgeInsets.zero,
            ),
          ),
        ],
      ),
    );
  }
}
