import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/layout/nexa_bottom_nav_bar.dart';
import '../../../../core/layout/nexa_bottom_nav_models.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/ui/nexa_icon_square_button.dart';
import '../../data/tournament_inscriptions_repository.dart';
import '../../domain/focus/focus_providers.dart';
import '../../domain/tournament_detail_logic.dart';
import '../../domain/tournament_detail_model.dart';
import '../../domain/tournament_discovery_models.dart';
import '../../domain/tournament_discovery_providers.dart';
import '../../domain/tournament_matches_logic.dart';
import 'focus_section.dart';
import 'sections/focus_agora_section.dart';
import 'sections/focus_chave_section.dart';
import 'sections/focus_grupo_section.dart';
import 'sections/focus_trajetoria_section.dart';

/// Casca do Modo Focus: cabeçalho, corpo e a navegação inferior das seções.
///
/// A nav é INFERIOR, como nos protótipos — não chips no topo. É a mesma
/// `NexaBottomNavBar` do resto do app, então o gesto de trocar de seção dentro
/// do Focus é o mesmo que o atleta já usa fora dele.
///
/// UMA rota com [IndexedStack], não as quatro aninhadas do portal: lá uma seção
/// sem rota irmã ejeta o atleta para o painel sem erro no console. O
/// `IndexedStack` ainda preserva scroll e estado de cada seção na troca.
///
/// A imersão é a própria rota: o app não envolve telas de atleta em
/// `StatefulShellRoute`, então aqui não há bottom-nav do app para esconder. O
/// que a casca faz é tirar o caminho de volta ao hub — a única saída é o ×.
class FocusShellPage extends ConsumerStatefulWidget {
  const FocusShellPage({
    super.key,
    required this.tournamentId,
    this.initialSection = FocusSection.agora,
  });

  final String tournamentId;
  final FocusSection initialSection;

  @override
  ConsumerState<FocusShellPage> createState() => _FocusShellPageState();
}

class _FocusShellPageState extends ConsumerState<FocusShellPage> {
  late FocusSection _section = widget.initialSection;

  /// Sair devolve o atleta à HOME, não ao detalhe do torneio: no dia de jogo a
  /// home é a base da navegação dele.
  void _exit() => context.go(AppRoutes.home);

  TournamentCategoryOffer? _offer(TournamentDetail? tournament, String? id) {
    if (tournament == null || id == null) return null;
    for (final offer in tournament.categoryOffers) {
      if (offer.id == id) return offer;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final topInset = MediaQuery.paddingOf(context).top;
    final tournament =
        ref.watch(tournamentDetailProvider(widget.tournamentId)).valueOrNull;
    final categoryId = ref.watch(focusCategoryIdProvider(widget.tournamentId));
    final teamIdsByCategory = ref
            .watch(
              tournamentUserTeamIdsByCategoryProvider(widget.tournamentId),
            )
            .valueOrNull ??
        const <String, String>{};
    final athleteTeamIds = athleteTeamIdsForHighlight(teamIdsByCategory);

    final offer = _offer(tournament, categoryId);
    final isDouble =
        offer != null && isDoubleEliminationBracketFormat(offer.bracketFormat);
    final sections = visibleFocusSections(isDoubleElimination: isDouble);

    // A seção corrente pode sair da lista quando o formato resolve (ex.: entrou
    // por deep link em `grupo` e a categoria é dupla eliminação). Cai na
    // primeira, em vez de mostrar uma aba que a nav não tem.
    final current = sections.contains(_section) ? _section : sections.first;

    return Scaffold(
      backgroundColor: colors.canvas,
      extendBody: true,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(height: topInset + AppSpacing.xs),
          _Header(
            tournament: tournament,
            isDoubleElimination: isDouble,
            onExit: _exit,
          ),
          Expanded(
            child: tournament == null
                ? const Center(
                    child: CircularProgressIndicator(color: AppColors.brand),
                  )
                : IndexedStack(
                    index: sections.indexOf(current),
                    sizing: StackFit.expand,
                    children: [
                      for (final section in sections)
                        _sectionBody(
                          section,
                          tournament,
                          categoryId,
                          athleteTeamIds,
                        ),
                    ],
                  ),
          ),
        ],
      ),
      bottomNavigationBar: NexaBottomNavBar(
        currentIndex: sections.indexOf(current),
        onTap: (index) => setState(() => _section = sections[index]),
        items: [
          for (final section in sections)
            NexaBottomNavItem(
              label: section.label,
              icon: _iconOf(section),
              selectedIcon: _selectedIconOf(section),
            ),
        ],
        uppercaseLabels: true,
      ),
    );
  }

  IconData _iconOf(FocusSection section) => switch (section) {
        FocusSection.agora => Icons.local_fire_department_outlined,
        FocusSection.trajetoria => Icons.emoji_events_outlined,
        FocusSection.grupo => Icons.table_rows_outlined,
        FocusSection.chave => Icons.account_tree_outlined,
      };

  IconData _selectedIconOf(FocusSection section) => switch (section) {
        FocusSection.agora => Icons.local_fire_department_rounded,
        FocusSection.trajetoria => Icons.emoji_events_rounded,
        FocusSection.grupo => Icons.table_rows_rounded,
        FocusSection.chave => Icons.account_tree_rounded,
      };

  Widget _sectionBody(
    FocusSection section,
    TournamentDetail tournament,
    String? categoryId,
    Set<String> athleteTeamIds,
  ) {
    return switch (section) {
      FocusSection.agora => FocusAgoraSection(
          tournament: tournament,
          categoryId: categoryId,
          athleteTeamIds: athleteTeamIds,
        ),
      FocusSection.trajetoria => FocusTrajetoriaSection(
          tournament: tournament,
          categoryId: categoryId,
          athleteTeamIds: athleteTeamIds,
        ),
      FocusSection.grupo => categoryId == null
          ? const _NoCategory()
          : FocusGrupoSection(
              tournament: tournament,
              categoryId: categoryId,
              athleteTeamIds: athleteTeamIds,
            ),
      FocusSection.chave => categoryId == null
          ? const _NoCategory()
          : FocusChaveSection(
              tournament: tournament,
              categoryId: categoryId,
            ),
    };
  }
}

/// "× | ● FOCUS / Nome do torneio | 11:28".
///
/// O clima que os protótipos mostram ao lado do relógio fica de fora: o projeto
/// não tem fonte de dado meteorológico, e a spec do Focus já havia cortado esse
/// item pelo mesmo motivo.
class _Header extends StatelessWidget {
  const _Header({
    required this.tournament,
    required this.isDoubleElimination,
    required this.onExit,
  });

  final TournamentDetail? tournament;
  final bool isDoubleElimination;
  final VoidCallback onExit;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final now = TimeOfDay.now();
    final clock = '${now.hour.toString().padLeft(2, '0')}:'
        '${now.minute.toString().padLeft(2, '0')}';

    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.xs,
        0,
        AppSpacing.screenH,
        AppSpacing.md,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          NexaIconSquareButton(
            icon: Icons.close_rounded,
            tooltip: 'Sair do Modo Focus',
            onTap: onExit,
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    Container(
                      width: 7,
                      height: 7,
                      decoration: const BoxDecoration(
                        color: AppColors.brand,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 5),
                    Text(
                      isDoubleElimination
                          ? 'FOCUS · DUPLA ELIMINATÓRIA'
                          : 'FOCUS',
                      style: AppTypography.eyebrow
                          .copyWith(color: AppColors.brand),
                    ),
                  ],
                ),
                Text(
                  tournament?.name ?? 'Modo Focus',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.titleM.copyWith(color: colors.onSurface),
                ),
              ],
            ),
          ),
          Text(
            clock,
            style: AppTypography.monoStat.copyWith(
              color: colors.onSurface,
              fontSize: 20,
            ),
          ),
        ],
      ),
    );
  }
}

/// Sem categoria resolvida não dá para desenhar grupo nem chave: as duas
/// derivam de `poolId`/`round` DENTRO de uma categoria.
class _NoCategory extends StatelessWidget {
  const _NoCategory();

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Padding(
      padding: const EdgeInsets.all(AppSpacing.xxl),
      child: Text(
        'Assim que você tiver partida numa categoria, o grupo e a chave dela '
        'aparecem aqui.',
        textAlign: TextAlign.center,
        style: AppTypography.bodyM.copyWith(color: colors.onSurfaceMuted),
      ),
    );
  }
}
