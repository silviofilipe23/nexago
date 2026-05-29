import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../arena/presentation/widgets/arena_dashboard_tokens.dart';

/// App bar da aba Competir no shell do atleta.
class CompeteHubShellAppBar extends StatelessWidget implements PreferredSizeWidget {
  const CompeteHubShellAppBar({
    super.key,
    this.trailingActions = const [],
  });

  final List<Widget> trailingActions;

  static const double _toolbarHeight = kToolbarHeight;

  @override
  Size get preferredSize => const Size.fromHeight(_toolbarHeight);

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

    return AppBar(
      centerTitle: false,
      titleSpacing: ArenaDashboardTokens.horizontalPadding,
      title: Align(
        alignment: Alignment.centerLeft,
        child: Text(
          'Competir',
          style: theme.textTheme.headlineSmall?.copyWith(
            fontWeight: FontWeight.w900,
            color: AppColors.onSurface,
            letterSpacing: -0.5,
          ),
        ),
      ),
      actions: [
        CompeteHubAppBarIconButton(
          icon: Icons.search_rounded,
          onTap: () => _openDiscoveryList(context, searchOpen: true),
        ),
        const SizedBox(width: 10),
        CompeteHubAppBarIconButton(
          icon: Icons.tune_rounded,
          onTap: () => _openDiscoveryList(context),
        ),
        ...trailingActions,
        const SizedBox(width: 8),
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
      color: AppColors.surfaceRaised,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: SizedBox(
          width: 40,
          height: 40,
          child: Icon(icon, color: AppColors.onSurface, size: 22),
        ),
      ),
    );
  }
}
