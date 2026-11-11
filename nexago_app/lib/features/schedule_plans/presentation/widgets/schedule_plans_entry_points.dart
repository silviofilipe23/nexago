import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../application/schedule_plans_providers.dart';
import '../../domain/schedule_plan_logic.dart';
import '../../domain/schedule_plan_models.dart';
import '../schedule_plans_routes.dart';
import 'schedule_plan_ui.dart';

/// Seção "Planos de horário" no detalhe da arena (atleta). Some quando a
/// arena não tem plano publicado.
class ArenaDetailSchedulePlansSection extends ConsumerWidget {
  const ArenaDetailSchedulePlansSection({super.key, required this.arenaId});

  final String arenaId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final plans =
        ref.watch(arenaActiveSchedulePlansProvider(arenaId)).valueOrNull ??
            const <SchedulePlan>[];
    if (plans.isEmpty) return const SizedBox.shrink();
    final colors = context.themeColors;
    final cheapest =
        plans.map((p) => p.monthlyPriceReais).reduce((a, b) => a < b ? a : b);
    final bestOff = plans
        .map(schedulePlanDiscountPercent)
        .whereType<int>()
        .fold<int>(0, (a, b) => a > b ? a : b);
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 28),
        Text(
          'Planos de horário',
          style: theme.textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w800,
            color: colors.onSurface,
            letterSpacing: -0.3,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          schedulePlansEntryLine(schedulePlansMix(plans)),
          style: theme.textTheme.bodySmall?.copyWith(
            color: colors.onSurfaceMuted,
          ),
        ),
        const SizedBox(height: 12),
        ScheduleCard(
          key: const Key('arena-detail-schedule-plans'),
          padding: const EdgeInsets.all(14),
          onTap: () => context.push(arenaSchedulePlansLocation(arenaId)),
          child: Row(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: AppColors.brand.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(
                  Icons.event_repeat_rounded,
                  color: colors.brandText,
                  size: 22,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      plans.length == 1
                          ? plans.first.name
                          : '${plans.length} planos',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.soraRegular(
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                        color: colors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      [
                        'A partir de ${scheduleMoney(cheapest)}/mês',
                        if (bestOff > 0) 'até −$bestOff% vs avulso',
                      ].join(' · '),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 12,
                        color: colors.onSurfaceMuted,
                      ),
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right_rounded, color: colors.onSurfaceMuted),
            ],
          ),
        ),
      ],
    );
  }
}

/// Entrada "Meu plano de horário" na agenda: aparece com assinatura viva ou
/// vaga oferecida pela lista de espera.
class MySchedulePlansAgendaTile extends ConsumerWidget {
  const MySchedulePlansAgendaTile({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final subs =
        ref.watch(myLiveScheduleSubscriptionsCountProvider).valueOrNull ?? 0;
    final offers = ref.watch(myScheduleOffersCountProvider).valueOrNull ?? 0;
    if (subs == 0 && offers == 0) return const SizedBox.shrink();
    final colors = context.themeColors;
    final hasOffer = offers > 0;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 4),
      child: ScheduleCard(
        key: const Key('agenda-my-schedule-plans'),
        selected: hasOffer,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        onTap: () => context.push(AppRoutes.mySchedulePlans),
        child: Row(
          children: [
            Icon(
              hasOffer ? Icons.celebration_rounded : Icons.event_repeat_rounded,
              size: 22,
              color: colors.brandText,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    hasOffer
                        ? 'Abriu vaga no seu horário'
                        : subs == 1
                            ? 'Meu plano de horário'
                            : 'Meus planos de horário',
                    style: AppTypography.soraRegular(
                      fontSize: 13.5,
                      fontWeight: FontWeight.w700,
                      color: colors.onSurface,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    hasOffer
                        ? 'Toque para aceitar antes que a oferta vença.'
                        : 'Faltar, reposição, trocar e pausar.',
                    style: TextStyle(
                      fontSize: 12,
                      color: colors.onSurfaceMuted,
                    ),
                  ),
                ],
              ),
            ),
            Icon(Icons.chevron_right_rounded, color: colors.onSurfaceMuted),
          ],
        ),
      ),
    );
  }
}
