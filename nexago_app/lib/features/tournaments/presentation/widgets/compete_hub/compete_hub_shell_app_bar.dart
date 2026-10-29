import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Header da aba Competir no shell do atleta (rola com o conteúdo).
class CompeteHubHeader extends StatelessWidget {
  const CompeteHubHeader({
    super.key,
    this.leading,
    this.trailingActions = const [],
  });

  /// À esquerda do título. Ex.: o botão da conta do atleta.
  final Widget? leading;

  final List<Widget> trailingActions;

  void _openDiscoveryList(BuildContext context, {bool searchOpen = false}) {
    context.pushNamed(
      AppRouteNames.tournamentDiscoveryList,
      queryParameters: {if (searchOpen) 'search': '1'},
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Row(
      crossAxisAlignment: leading == null
          ? CrossAxisAlignment.start
          : CrossAxisAlignment.center,
      children: [
        if (leading case final leading?) ...[
          leading,
          const SizedBox(width: 10),
        ],
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Hub',
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w900,
                  color: context.themeColors.onSurface,
                  letterSpacing: -0.5,
                ),
              ),
              const SizedBox(height: 3),
              // Subtítulo mono do painel web ("torneios, ranking, equipes…").
              Text(
                'TORNEIOS, RANKING, EQUIPES E ATLETAS',
                style: AppTypography.eyebrow.copyWith(
                  color: context.themeColors.onSurfaceMuted,
                ),
              ),
            ],
          ),
        ),
        CompeteHubAppBarIconButton(
          icon: Icons.search_rounded,
          onTap: () => _openDiscoveryList(context, searchOpen: true),
          tooltip: 'Buscar torneios',
        ),
        ...trailingActions,
      ],
    );
  }
}

class CompeteHubAppBarIconButton extends StatelessWidget {
  const CompeteHubAppBarIconButton({
    super.key,
    required this.icon,
    required this.onTap,
    required this.tooltip,
  });

  final IconData icon;
  final VoidCallback onTap;

  /// Dica no toque longo e nome lido pelo leitor de tela — botão só com
  /// ícone não se explica.
  final String tooltip;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: Material(
        color: context.themeColors.surfaceRaised,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: SizedBox(
            width: 40,
            height: 40,
            child: Icon(icon, color: context.themeColors.onSurface, size: 22),
          ),
        ),
      ),
    );
  }
}
