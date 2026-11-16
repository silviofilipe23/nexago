import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_radii.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Um destino da busca do Hub: cada um abre a tela que já tem o campo de busca.
class CompeteHubSearchTarget {
  const CompeteHubSearchTarget({
    required this.icon,
    required this.label,
    required this.hint,
    required this.routeName,
    this.queryParameters = const {},
  });

  final IconData icon;
  final String label;
  final String hint;
  final String routeName;
  final Map<String, String> queryParameters;
}

/// O Hub reúne torneios, atletas, equipes e organizadores; a lupa não pode
/// levar só para torneios.
const List<CompeteHubSearchTarget> competeHubSearchTargets = [
  CompeteHubSearchTarget(
    icon: Icons.emoji_events_outlined,
    label: 'Torneios e ligas',
    hint: 'Por nome do torneio ou da liga',
    routeName: AppRouteNames.tournamentDiscoveryList,
    queryParameters: {'search': '1'},
  ),
  CompeteHubSearchTarget(
    icon: Icons.person_search_outlined,
    label: 'Atletas',
    hint: 'Por nome ou @apelido',
    routeName: AppRouteNames.athleteDiscover,
  ),
  CompeteHubSearchTarget(
    icon: Icons.groups_outlined,
    label: 'Equipes',
    hint: 'Por nome da equipe ou atletas',
    routeName: AppRouteNames.teamDiscover,
  ),
  CompeteHubSearchTarget(
    icon: Icons.storefront_outlined,
    label: 'Organizadores',
    hint: 'Por nome ou cidade',
    routeName: AppRouteNames.organizersDirectory,
  ),
];

/// Pergunta o que buscar e abre a tela certa.
Future<void> showCompeteHubSearchSheet(BuildContext context) async {
  final target = await showModalBottomSheet<CompeteHubSearchTarget>(
    context: context,
    useSafeArea: true,
    backgroundColor: context.themeColors.surfaceSheet,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => const CompeteHubSearchSheet(),
  );
  if (target == null || !context.mounted) return;
  context.pushNamed(
    target.routeName,
    queryParameters: target.queryParameters,
  );
}

/// Conteúdo da folha — exposto para testes de widget.
class CompeteHubSearchSheet extends StatelessWidget {
  const CompeteHubSearchSheet({super.key});

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        AppSpacing.lg,
        AppSpacing.screenH,
        AppSpacing.md,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'O que você procura?',
            style: AppTypography.titleS.copyWith(color: colors.onSurface),
          ),
          const SizedBox(height: AppSpacing.sm),
          for (final target in competeHubSearchTargets)
            ListTile(
              contentPadding: EdgeInsets.zero,
              shape: const RoundedRectangleBorder(
                borderRadius: AppRadii.mdAll,
              ),
              leading: Icon(target.icon, color: colors.onSurface),
              title: Text(
                target.label,
                style: AppTypography.bodyM.copyWith(
                  color: colors.onSurface,
                  fontWeight: FontWeight.w600,
                ),
              ),
              subtitle: Text(
                target.hint,
                style: AppTypography.bodyS.copyWith(
                  color: colors.onSurfaceMuted,
                ),
              ),
              trailing: Icon(
                Icons.chevron_right_rounded,
                color: colors.onSurfaceMuted,
              ),
              onTap: () => Navigator.of(context).pop(target),
            ),
        ],
      ),
    );
  }
}
