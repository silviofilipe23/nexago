import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../schedule_plans/presentation/widgets/schedule_plan_ui.dart';
import '../../application/class_agreements_providers.dart';
import '../class_agreements_pages.dart' show openClassAgreement;

/// Caminho da contratação de plano de aulas de uma arena.
String classPlanSignupLocation(String arenaId) =>
    AppRoutes.classPlanSignup.replaceAll(':arenaId', Uri.encodeComponent(arenaId));

/// Perfil da arena: "Planos de aula" só quando a arena abriu plano para
/// contratar pelo app (`arenas/{id}.classSignupOpen`).
class ArenaDetailClassPlansSection extends ConsumerWidget {
  const ArenaDetailClassPlansSection({super.key, required this.arenaId});

  final String arenaId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final open = ref.watch(arenaClassSignupOpenProvider(arenaId)).valueOrNull == true;
    if (!open) return const SizedBox.shrink();
    final colors = context.themeColors;
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 28),
        Text(
          'Planos de aula',
          style: theme.textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w800,
            color: colors.onSurface,
            letterSpacing: -0.3,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          'Escolha o plano, o professor e os dias e assine pelo app.',
          style: theme.textTheme.bodySmall?.copyWith(color: colors.onSurfaceMuted),
        ),
        const SizedBox(height: 12),
        ScheduleCard(
          key: const Key('arena-detail-class-plans'),
          padding: const EdgeInsets.all(14),
          onTap: () => context.push(classPlanSignupLocation(arenaId)),
          child: Row(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: AppColors.brand.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(Icons.school_outlined, color: colors.brandText, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Contratar plano de aulas',
                      style: AppTypography.soraRegular(
                        fontSize: 14.5,
                        fontWeight: FontWeight.w700,
                        color: colors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Turmas com vaga e contrato na hora',
                      style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted),
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

/// Modo Professor › Arenas: contrato enviado pela arena esperando assinatura.
class ProfessorPendingAgreementsCard extends ConsumerWidget {
  const ProfessorPendingAgreementsCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pending = ref.watch(pendingProfessorAgreementsProvider).valueOrNull ?? const [];
    if (pending.isEmpty) return const SizedBox.shrink();
    final colors = context.themeColors;
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(
        children: [
          for (final a in pending)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: ScheduleCard(
                key: Key('professor-agreement-pending-${a.agreementId}'),
                selected: true,
                onTap: () => openClassAgreement(context, a.agreementId),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(Icons.draw_rounded, color: colors.brandText),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            a.arenaName,
                            style: AppTypography.soraRegular(
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                              color: colors.onSurface,
                            ),
                          ),
                        ),
                        const ScheduleKicker('Assinar', color: AppColors.brand),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Enviou seu contrato de professor. Leia e assine pelo app.',
                      style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted),
                    ),
                    if (a.essentials.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Text(
                        a.essentials.map((r) => r.value).take(2).join(' · '),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.bodyS.copyWith(color: colors.onSurface),
                      ),
                    ],
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Modo Professor › Arenas: atalho para os contratos assinados com as arenas.
class ProfessorAgreementsLinkCard extends StatelessWidget {
  const ProfessorAgreementsLinkCard({super.key});

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return ScheduleCard(
      key: const Key('professor-agreements-link'),
      padding: const EdgeInsets.all(14),
      onTap: () => context.pushNamed(AppRouteNames.classAgreements),
      child: Row(
        children: [
          Icon(Icons.description_outlined, color: colors.brandText),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              'Contratos com as arenas',
              style: AppTypography.soraRegular(
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: colors.onSurface,
              ),
            ),
          ),
          Icon(Icons.chevron_right_rounded, color: colors.onSurfaceMuted),
        ],
      ),
    );
  }
}
