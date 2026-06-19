import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Header da aba Competir no shell do atleta (rola com o conteúdo).
class CompeteHubHeader extends StatelessWidget {
  const CompeteHubHeader({super.key, this.trailingActions = const []});

  final List<Widget> trailingActions;

  void _openDiscoveryList(
    BuildContext context, {
    bool searchOpen = false,
    String query = '',
  }) {
    final params = <String, String>{};
    if (searchOpen) params['search'] = '1';
    if (query.isNotEmpty) params['q'] = query;
    context.pushNamed(
      AppRouteNames.tournamentDiscoveryList,
      queryParameters: params,
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Text(
            'Competir',
            style: theme.textTheme.headlineSmall?.copyWith(
              fontWeight: FontWeight.w900,
              color: context.themeColors.onSurface,
              letterSpacing: -0.5,
            ),
          ),
        ),
        CompeteHubAppBarIconButton(
          icon: Icons.search_rounded,
          onTap: () => _openDiscoveryList(context, searchOpen: true),
        ),
        const SizedBox(width: 8),
        CompeteHubAppBarIconButton(
          icon: Icons.tune_rounded,
          onTap: () => _openDiscoveryList(context),
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
  });

  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
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
    );
  }
}
