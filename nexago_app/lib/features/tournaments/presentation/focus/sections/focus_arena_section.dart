import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_typography.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../domain/focus/focus_arena_logic.dart';
import '../../../domain/tournament_detail_model.dart';
import '../../../domain/tournament_detail_tabs_logic.dart';
import '../../../domain/tournament_discovery_providers.dart';
import '../../../domain/tournament_match.dart';
import '../../../domain/tournament_match_card_view_model.dart';
import '../../widgets/tournament_match_card.dart';
import '../focus_bottom_clearance.dart';
import '../focus_section_header.dart';

/// Seção "Arena": o que está acontecendo no torneio INTEIRO, não só na
/// categoria do atleta.
///
/// É a única seção do Focus que não se recorta por categoria — e por isso a
/// única que continua útil para quem já foi eliminado ou ainda não entrou em
/// quadra. O atleta vem aqui para acompanhar a categoria do parceiro, o jogo do
/// amigo, ou só para saber quanto falta para a arena chegar nele.
class FocusArenaSection extends ConsumerStatefulWidget {
  const FocusArenaSection({
    super.key,
    required this.tournament,
    required this.athleteTeamIds,
  });

  final TournamentDetail tournament;
  final Set<String> athleteTeamIds;

  @override
  ConsumerState<FocusArenaSection> createState() => _FocusArenaSectionState();
}

class _FocusArenaSectionState extends ConsumerState<FocusArenaSection> {
  /// Nulo enquanto o atleta não escolher: aí vale [focusArenaInitialSegment],
  /// que depende do dado. Guardar a escolha é o que impede o segmento de pular
  /// sozinho para "Ao vivo" no instante em que a mesa inicia um jogo enquanto o
  /// atleta lê a fila.
  FocusArenaSegment? _chosen;

  void _openMatch(String matchId) {
    final id = matchId.trim();
    if (id.isEmpty) return;
    context.pushNamed(
      AppRouteNames.athleteMatchDetail,
      pathParameters: {'matchId': id},
      queryParameters: {AppRoutes.matchDetailFromTournamentQuery: '1'},
    );
  }

  /// Nome da categoria pela oferta do torneio. Categoria fora das ofertas
  /// (torneio legado) devolve vazio, e o rótulo de contexto some sozinho.
  String _categoryNameOf(String categoryId) {
    final id = categoryId.trim();
    if (id.isEmpty) return '';
    for (final offer in widget.tournament.categoryOffers) {
      if (offer.id.trim() == id) return offer.name;
    }
    return '';
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final cardsAsync =
        ref.watch(tournamentMatchCardsProvider(widget.tournament.id));

    return cardsAsync.when(
      loading: () => const Center(
        child: Padding(
          padding: EdgeInsets.only(top: 60),
          child: CircularProgressIndicator(color: AppColors.brand),
        ),
      ),
      error: (_, _) => Padding(
        padding: const EdgeInsets.all(AppSpacing.xxl),
        child: Text(
          'Não foi possível carregar o que está acontecendo na arena.',
          textAlign: TextAlign.center,
          style: AppTypography.bodyM.copyWith(color: colors.onSurfaceMuted),
        ),
      ),
      data: _body,
    );
  }

  Widget _body(List<TournamentMatchCardViewModel> cards) {
    final colors = context.themeColors;
    final byId = {for (final c in cards) c.match.id: c};
    final all = [for (final c in cards) c.match];
    final now = DateTime.now();

    final live = liveTournamentMatches(all);
    final upcoming = upcomingTournamentMatches(
      all,
      now,
      tournamentRunningToday: tournamentIsEventToday(widget.tournament, now),
    );

    final segment = _chosen ??
        focusArenaInitialSegment(
          liveCount: live.length,
          upcomingCount: upcoming.length,
        );
    final listed =
        segment == FocusArenaSegment.live ? live : upcoming;

    return ListView(
      padding: EdgeInsets.only(
        top: AppSpacing.md,
        bottom: focusBottomClearance(context),
      ),
      children: [
        _Hero(
          headline: focusArenaHeadline(live.length),
          liveCount: live.length,
          upcomingCount: upcoming.length,
          segment: segment,
          onSelect: (value) => setState(() => _chosen = value),
        ),
        if (live.isEmpty && upcoming.isEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.screenH,
              AppSpacing.xl,
              AppSpacing.screenH,
              0,
            ),
            child: Text(
              'Nada em quadra e nada na fila por enquanto. Assim que a mesa '
              'liberar os jogos, eles aparecem aqui.',
              style: AppTypography.bodyM.copyWith(color: colors.onSurfaceMuted),
            ),
          )
        else ...[
          FocusSectionHeader(
            label: segment == FocusArenaSegment.live
                ? 'AO VIVO AGORA'
                : 'A SEGUIR',
            live: segment == FocusArenaSegment.live,
          ),
          if (listed.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.screenH,
                vertical: AppSpacing.sm,
              ),
              child: Text(
                segment == FocusArenaSegment.live
                    ? 'Nenhuma partida em quadra neste momento.'
                    : 'Nenhuma partida na fila para hoje.',
                style:
                    AppTypography.bodyM.copyWith(color: colors.onSurfaceMuted),
              ),
            )
          else
            for (final match in listed)
              if (byId[match.id] != null)
                Padding(
                  padding: const EdgeInsets.fromLTRB(
                    AppSpacing.screenH,
                    0,
                    AppSpacing.screenH,
                    AppSpacing.lg,
                  ),
                  child: TournamentMatchCard(
                    viewModel: byId[match.id]!,
                    athleteTeamIds: widget.athleteTeamIds,
                    contextLabel: _contextLabelOf(match),
                    onTap: () => _openMatch(match.id),
                  ),
                ),
        ],
      ],
    );
  }

  String _contextLabelOf(TournamentMatch match) {
    return focusArenaContextLabel(
      match: match,
      categoryName: _categoryNameOf(match.categoryId),
    );
  }
}

/// "AO VIVO NA ARENA / 4 partidas em quadra agora." e os dois chips.
class _Hero extends StatelessWidget {
  const _Hero({
    required this.headline,
    required this.liveCount,
    required this.upcomingCount,
    required this.segment,
    required this.onSelect,
  });

  final String headline;
  final int liveCount;
  final int upcomingCount;
  final FocusArenaSegment segment;
  final ValueChanged<FocusArenaSegment> onSelect;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenH),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'AO VIVO NA ARENA',
            style: AppTypography.eyebrow.copyWith(color: AppColors.live),
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            headline,
            style: AppTypography.displayL.copyWith(color: colors.onSurface),
          ),
          const SizedBox(height: AppSpacing.lg),
          // `Wrap`, não `Row`: os rótulos carregam contagem, e um torneio
          // grande ("12 EM QUADRA" + "24 A SEGUIR") estoura a linha num
          // aparelho estreito. Aqui o segundo chip desce em vez de truncar —
          // truncar um rótulo que é só número e duas palavras seria pior.
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            children: [
              _SegmentChip(
                label: focusArenaSegmentLabel(
                  FocusArenaSegment.live,
                  liveCount,
                ),
                selected: segment == FocusArenaSegment.live,
                live: true,
                onTap: () => onSelect(FocusArenaSegment.live),
              ),
              _SegmentChip(
                label: focusArenaSegmentLabel(
                  FocusArenaSegment.upcoming,
                  upcomingCount,
                ),
                selected: segment == FocusArenaSegment.upcoming,
                live: false,
                onTap: () => onSelect(FocusArenaSegment.upcoming),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _SegmentChip extends StatelessWidget {
  const _SegmentChip({
    required this.label,
    required this.selected,
    required this.live,
    required this.onTap,
  });

  final String label;
  final bool selected;

  /// O chip do ao vivo acende em vermelho e ganha o ponto; o da fila é neutro.
  final bool live;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final accent = live ? AppColors.live : colors.onSurface;

    return Semantics(
      button: true,
      selected: selected,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Container(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.lg,
            vertical: AppSpacing.sm + 2,
          ),
          decoration: BoxDecoration(
            color: selected ? accent : Colors.transparent,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(
              color: selected ? accent : colors.outline,
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (live && selected) ...[
                Container(
                  width: 7,
                  height: 7,
                  decoration: BoxDecoration(
                    color: colors.canvas,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: AppSpacing.sm - 2),
              ],
              Text(
                label,
                style: AppTypography.mono(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1.1,
                  color: selected ? colors.canvas : colors.onSurfaceMuted,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
