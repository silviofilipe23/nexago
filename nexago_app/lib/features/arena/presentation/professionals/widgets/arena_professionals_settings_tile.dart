import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../domain/professionals/arena_professionals_logic.dart';
import '../../../domain/professionals/arena_professionals_providers.dart';
import '../../widgets/arena_settings_group.dart';

/// "Profissionais" nos Ajustes da arena (dono + gestor): resumo ao vivo e o
/// número de pedidos esperando decisão. Some para quem não lê a área `perfil`.
class ArenaProfessionalsSettingsTile extends ConsumerWidget {
  const ArenaProfessionalsSettingsTile({super.key, this.showDivider = true});

  final bool showDivider;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scope = ref.watch(arenaProfessionalsScopeProvider).valueOrNull;
    if (scope == null) return const SizedBox.shrink();
    final linksAsync = ref.watch(arenaProfessionalLinksProvider(scope.arenaId));
    final links = linksAsync.valueOrNull;
    final now = ref.watch(arenaProfessionalsClockProvider)();
    final pending =
        links == null ? 0 : pendingArenaProfessorRequests(links).length;
    return ArenaSettingsTile(
      icon: Icons.sports_rounded,
      title: 'Profissionais',
      subtitle: links == null
          ? (linksAsync.hasError
              ? 'Professores vinculados à arena'
              : 'Carregando professores...')
          : arenaProfessionalsEntrySubtitle(links, now),
      onTap: () => context.pushNamed(AppRouteNames.arenaProfessionals),
      trailingBadge: pending > 0 ? _PendingBadge(count: pending) : null,
      showDivider: showDivider,
    );
  }
}

class _PendingBadge extends StatelessWidget {
  const _PendingBadge({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: AppColors.brand.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.45)),
      ),
      child: Text(
        '$count',
        style: const TextStyle(
          color: AppColors.brand,
          fontSize: 11,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}
