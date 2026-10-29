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
    required this.onShareTap,
    this.filtersActive = false,
  });

  final bool searchOpen;
  final TextEditingController searchController;
  final VoidCallback onSearchToggle;
  final VoidCallback onFilterTap;
  final VoidCallback onInfoTap;

  /// "Compartilhar ranking": a lista na tela, com os filtros dela.
  final VoidCallback onShareTap;

  /// Com os filtros todos dentro da folha, o ícone é o único aviso de que a
  /// lista está recortada. Marcador é o próprio ícone (cheio × contorno), não
  /// um badge sobreposto: `NexaAppBar` só converte ação pro app bar nativo do
  /// iOS 26 quando ela é um botão de ícone puro — um `Stack` derrubaria o
  /// Liquid Glass da tela inteira, calado.
  final bool filtersActive;

  @override
  Size get preferredSize =>
      Size.fromHeight(kToolbarHeight + (searchOpen ? 52 : 0));

  /// Quatro botões de 40 dividem a linha com o título: com o vão antigo (10)
  /// e o recuo de 20 depois da seta, "Ranking" virava "Ranki…" até 393 de
  /// largura. Vão de 4 e recuo de 8 (o das outras telas com voltar) deixam o
  /// título inteiro a partir de 360.
  static const _gap = SizedBox(width: 4);

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    // Aberto como primeira tela (sem seta), o título segue o recuo do conteúdo.
    final hasBack = ModalRoute.of(context)?.impliesAppBarDismissal ?? false;

    return NexaAppBar(
      centerTitle: false,
      titleSpacing: hasBack ? 8 : ArenaDashboardTokens.horizontalPadding,
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
            tooltip: 'Como funciona o ranking',
          ),
          _gap,
        ],
        CompeteHubAppBarIconButton(
          icon: searchOpen ? Icons.close_rounded : Icons.search_rounded,
          onTap: onSearchToggle,
          tooltip: searchOpen ? 'Fechar busca' : 'Buscar no ranking',
        ),
        _gap,
        CompeteHubAppBarIconButton(
          icon: filtersActive ? Icons.filter_alt_rounded : Icons.tune_rounded,
          onTap: onFilterTap,
          tooltip: 'Filtros',
        ),
        if (!searchOpen) ...[
          _gap,
          CompeteHubAppBarIconButton(
            icon: Icons.ios_share_rounded,
            onTap: onShareTap,
            tooltip: 'Compartilhar',
          ),
        ],
        SizedBox(width: 8),
      ],
      bottom: searchOpen ? null : null,
    );
  }
}
