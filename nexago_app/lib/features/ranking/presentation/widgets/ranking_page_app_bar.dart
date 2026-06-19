import 'package:flutter/material.dart';
import 'package:nexago_app/core/layout/nexa_app_bar.dart';

import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../arena/presentation/widgets/arena_dashboard_tokens.dart';
import '../../../tournaments/presentation/widgets/compete_hub/compete_hub_shell_app_bar.dart';

class RankingPageAppBar extends StatelessWidget implements PreferredSizeWidget {
  const RankingPageAppBar({
    super.key,
    required this.searchOpen,
    required this.searchController,
    required this.onSearchToggle,
    required this.onFilterTap,
    required this.onInfoTap,
  });

  final bool searchOpen;
  final TextEditingController searchController;
  final VoidCallback onSearchToggle;
  final VoidCallback onFilterTap;
  final VoidCallback onInfoTap;

  @override
  Size get preferredSize =>
      Size.fromHeight(kToolbarHeight + (searchOpen ? 52 : 0));

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return NexaAppBar(
      centerTitle: false,
      titleSpacing: ArenaDashboardTokens.horizontalPadding,
      title: searchOpen
          ? TextField(
              controller: searchController,
              autofocus: true,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: context.themeColors.onSurface,
              ),
              decoration: InputDecoration(
                hintText: 'Buscar no ranking…',
                hintStyle: TextStyle(color: context.themeColors.onSurfaceMuted),
                border: InputBorder.none,
                isDense: true,
              ),
            )
          : Align(
              alignment: Alignment.centerLeft,
              child: Text(
                'Ranking',
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w900,
                  color: context.themeColors.onSurface,
                  letterSpacing: -0.5,
                ),
              ),
            ),
      actions: [
        if (!searchOpen) ...[
          CompeteHubAppBarIconButton(
            icon: Icons.help_outline_rounded,
            onTap: onInfoTap,
          ),
          SizedBox(width: 10),
        ],
        CompeteHubAppBarIconButton(
          icon: searchOpen ? Icons.close_rounded : Icons.search_rounded,
          onTap: onSearchToggle,
        ),
        SizedBox(width: 10),
        CompeteHubAppBarIconButton(
          icon: Icons.tune_rounded,
          onTap: onFilterTap,
        ),
        SizedBox(width: 8),
      ],
      bottom: searchOpen ? null : null,
    );
  }
}
