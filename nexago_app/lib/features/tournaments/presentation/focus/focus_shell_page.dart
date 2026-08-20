import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/ui/nexa_icon_square_button.dart';
import '../../data/tournament_inscriptions_repository.dart';
import '../../domain/focus/focus_providers.dart';
import '../../domain/tournament_detail_model.dart';
import '../../domain/tournament_detail_tabs_logic.dart';
import '../../domain/tournament_discovery_providers.dart';
import '../../domain/tournament_match_status.dart';
import '../../domain/tournament_matches_logic.dart';
import 'focus_section.dart';
import 'sections/focus_agora_section.dart';
import 'sections/focus_chave_section.dart';
import 'sections/focus_grupo_section.dart';
import 'sections/focus_trajetoria_section.dart';

/// Casca do Modo Focus: cabeçalho, navegação das quatro seções e o corpo.
///
/// UMA rota, quatro seções num [IndexedStack] — não as quatro rotas aninhadas
/// do portal. Lá elas existem porque o `router-outlet` exige, e o próprio
/// código de lá documenta a armadilha: seção listada sem rota irmã não casa com
/// filho nenhum, o router recua até o catch-all e ejeta o atleta pro painel sem
/// erro no console. Uma casca dona das seções não tem esse modo de falha.
///
/// O `IndexedStack` (e não um `switch`) preserva o scroll e o estado de cada
/// seção ao trocar de aba — voltar pra Chave depois de ir na Trajetória não
/// redesenha a chave do zero.
///
/// A imersão é a própria rota: o app não envolve telas de atleta em
/// `StatefulShellRoute`, então aqui não há bottom-nav pra esconder. O que a
/// casca faz é tirar o caminho de volta ao hub — a única saída é o ×.
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
  /// home é a base da navegação dele — é de lá que o Focus abre, e é lá que ele
  /// quer voltar pra reservar quadra, ver ranking ou qualquer outra coisa.
  void _exit() => context.go(AppRoutes.home);

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
    final hasLive = ref
            .watch(tournamentMatchCardsProvider(widget.tournamentId))
            .valueOrNull
            ?.any((c) =>
                TournamentMatchStatus.isInProgress(c.match.status)) ??
        false;

    return Scaffold(
      backgroundColor: colors.canvas,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(height: topInset + AppSpacing.xs),
          _Header(
            tournament: tournament,
            categoryId: categoryId,
            hasLive: hasLive,
            onExit: _exit,
          ),
          _SectionBar(
            current: _section,
            onChanged: (section) => setState(() => _section = section),
          ),
          Expanded(
            child: tournament == null
                ? const Center(
                    child: CircularProgressIndicator(color: AppColors.brand),
                  )
                : IndexedStack(
                    index: _section.index,
                    sizing: StackFit.expand,
                    children: [
                      FocusAgoraSection(
                        tournament: tournament,
                        categoryId: categoryId,
                        athleteTeamIds: athleteTeamIds,
                      ),
                      FocusTrajetoriaSection(
                        tournament: tournament,
                        categoryId: categoryId,
                        athleteTeamIds: athleteTeamIds,
                      ),
                      if (categoryId != null)
                        FocusGrupoSection(
                          tournament: tournament,
                          categoryId: categoryId,
                        )
                      else
                        const _NoCategory(),
                      if (categoryId != null)
                        FocusChaveSection(
                          tournament: tournament,
                          categoryId: categoryId,
                        )
                      else
                        const _NoCategory(),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({
    required this.tournament,
    required this.categoryId,
    required this.hasLive,
    required this.onExit,
  });

  final TournamentDetail? tournament;
  final String? categoryId;
  final bool hasLive;
  final VoidCallback onExit;

  /// "Sáb 20 ago · dia 2 de 3 · Arena, Cidade" + o nome da categoria em foco.
  /// Cada pedaço só entra se existir — a linha nunca afirma um dia que não dá
  /// pra calcular.
  String _meta() {
    final t = tournament;
    if (t == null) return '';
    final parts = <String>[tournamentDetailHeroMeta(t, DateTime.now())];
    for (final offer in t.categoryOffers) {
      if (offer.id == categoryId && offer.name.trim().isNotEmpty) {
        parts.add(offer.name.trim());
      }
    }
    return parts.where((p) => p.trim().isNotEmpty).join(' · ');
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final meta = _meta();

    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.xs,
        0,
        AppSpacing.screenH,
        AppSpacing.sm,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
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
              children: [
                Row(
                  children: [
                    // Selo do portal: acende quando há partida em quadra no
                    // torneio, que é o sinal de "isso aqui está vivo agora".
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 7,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: hasLive ? AppColors.live : colors.surfaceRaised,
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        'Focus',
                        style: AppTypography.eyebrow.copyWith(
                          color: hasLive ? Colors.white : colors.onSurfaceMuted,
                        ),
                      ),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: Text(
                        tournament?.name ?? 'Modo Focus',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.titleM
                            .copyWith(color: colors.onSurface),
                      ),
                    ),
                  ],
                ),
                if (meta.isNotEmpty)
                  Text(
                    meta,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.bodyS
                        .copyWith(color: colors.onSurfaceMuted),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionBar extends StatelessWidget {
  const _SectionBar({required this.current, required this.onChanged});

  final FocusSection current;
  final ValueChanged<FocusSection> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenH),
      child: Row(
        children: [
          for (final section in FocusSection.values)
            Padding(
              padding: const EdgeInsets.only(right: AppSpacing.sm),
              child: GestureDetector(
                onTap: () => onChanged(section),
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.lg,
                    vertical: AppSpacing.sm + 2,
                  ),
                  decoration: BoxDecoration(
                    color: section == current
                        ? colors.brand
                        : colors.surfaceRaised,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    section.label,
                    style: AppTypography.bodyM.copyWith(
                      color: section == current
                          ? Colors.white
                          : colors.onSurfaceMuted,
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Sem categoria resolvida não dá pra desenhar grupo nem chave: as duas
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
