import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../../../core/theme/app_radii.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../../athlete/presentation/widgets/athlete_profile_avatar.dart';
import '../../../domain/tournament_match_card_view_model.dart';
import '../../../domain/tournament_podium_logic.dart';
import 'tournament_detail_category_chips.dart';
import 'tournament_detail_tab_slivers.dart';

/// Cores dos degraus. São do pódio, não do tema: ouro/prata/bronze não mudam
/// com o modo claro/escuro nem com a marca.
const _medalColors = <int, Color>{
  1: Color(0xFFE3B341),
  2: Color(0xFFB8C0CC),
  3: Color(0xFFCE8946),
};

/// Altura do bloco de cada degrau — é ela que desenha a escada do pódio.
const _stepHeights = <int, double>{1: 232, 2: 186, 3: 170};

/// Ordem na tela: o 2º à esquerda, o campeão no centro, o 3º à direita.
const _stepOrder = <int>[2, 1, 3];

/// Pódio do torneio, uma categoria por vez: 2º · 1º · 3º, com os atletas de
/// cada equipe.
///
/// Só é alcançável depois que o torneio termina (ver
/// [tournamentPodiumAvailable]), então aqui não há gate nenhum — a tela
/// renderiza o que recebe.
class TournamentDetailPodiumTab extends StatelessWidget {
  const TournamentDetailPodiumTab({
    super.key,
    required this.podiums,
    required this.selectedCategoryId,
    required this.onSelectCategory,
    this.teamCountByCategoryId = const {},
  });

  final List<TournamentCategoryPodium> podiums;
  final String selectedCategoryId;
  final ValueChanged<String> onSelectCategory;

  /// Duplas inscritas por categoria, para o selo do cabeçalho. Categoria fora
  /// do mapa fica sem selo — melhor omitir do que exibir zero.
  final Map<String, int> teamCountByCategoryId;

  TournamentCategoryPodium? get _selected {
    for (final p in podiums) {
      if (p.categoryId == selectedCategoryId) return p;
    }
    return podiums.isNotEmpty ? podiums.first : null;
  }

  List<Widget> buildSlivers() {
    final selected = _selected;
    if (selected == null) {
      return tournamentDetailTabSliversFromChildren(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenH,
          AppSpacing.xxl,
          AppSpacing.screenH,
          AppSpacing.xxxl,
        ),
        children: const [_PodiumEmptyState()],
      );
    }

    return [
      SliverToBoxAdapter(
        child: TournamentDetailCategoryChips.fromOptions(
          options: [
            for (final p in podiums) (id: p.categoryId, name: p.categoryName),
          ],
          selectedId: selected.categoryId,
          onSelected: onSelectCategory,
        ),
      ),
      ...tournamentDetailTabSliversFromChildren(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenH,
          AppSpacing.sm,
          AppSpacing.screenH,
          AppSpacing.xxxl,
        ),
        children: [
          _CategoryHeader(
            name: selected.categoryName,
            teamCount: teamCountByCategoryId[selected.categoryId],
          ),
          const SizedBox(height: AppSpacing.xl),
          if (selected.isDecided)
            _PodiumSteps(podium: selected)
          else
            const _UndecidedNotice(),
        ],
      ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    return CustomScrollView(slivers: buildSlivers());
  }
}

class _CategoryHeader extends StatelessWidget {
  const _CategoryHeader({required this.name, this.teamCount});

  final String name;
  final int? teamCount;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final count = teamCount;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                name,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.titleL.copyWith(color: colors.onSurface),
              ),
              const SizedBox(height: 2),
              Text(
                'Pódio da categoria',
                style: AppTypography.bodyS.copyWith(
                  color: colors.onSurfaceMuted,
                ),
              ),
            ],
          ),
        ),
        if (count != null) ...[
          const SizedBox(width: AppSpacing.md),
          Container(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.md,
              vertical: AppSpacing.sm,
            ),
            decoration: BoxDecoration(
              color: colors.surfaceRaised,
              borderRadius: AppRadii.pillAll,
              border: Border.all(color: colors.outline.withValues(alpha: 0.5)),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  Icons.people_alt_outlined,
                  size: 14,
                  color: colors.onSurfaceMuted,
                ),
                const SizedBox(width: 6),
                Text(
                  '$count duplas',
                  style: AppTypography.mono(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

/// A escada: três blocos de alturas diferentes alinhados pela BASE, com a
/// coroa flutuando sobre o campeão.
class _PodiumSteps extends StatelessWidget {
  const _PodiumSteps({required this.podium});

  final TournamentCategoryPodium podium;

  TournamentPodiumPlace? _placeFor(int place) {
    for (final p in podium.places) {
      if (p.place == place) return p;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final steps = [
      for (final place in _stepOrder)
        if (_placeFor(place) != null) _placeFor(place)!,
    ];

    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        for (final step in steps) ...[
          if (step != steps.first) const SizedBox(width: AppSpacing.sm),
          Expanded(
            // O campeão ocupa mais largura: a escada tem que ser visível na
            // largura também, não só na altura.
            flex: step.place == 1 ? 11 : 9,
            child: _PodiumStep(place: step),
          ),
        ],
      ],
    );
  }
}

class _PodiumStep extends StatelessWidget {
  const _PodiumStep({required this.place});

  final TournamentPodiumPlace place;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final medal = _medalColors[place.place] ?? colors.onSurfaceMuted;
    final isChampion = place.place == 1;
    final height = _stepHeights[place.place] ?? 170;

    final card = Container(
      height: height,
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.sm,
        vertical: AppSpacing.lg,
      ),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            medal.withValues(alpha: isChampion ? 0.26 : 0.16),
            medal.withValues(alpha: 0.04),
          ],
        ),
        borderRadius: AppRadii.lgAll,
        border: Border.all(
          color: medal.withValues(alpha: isChampion ? 0.55 : 0.3),
        ),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            '${place.place}º',
            style: AppTypography.titleL.copyWith(
              color: colors.onSurface,
              fontWeight: FontWeight.w900,
            ),
          ),
          _PlayersRow(
            players: place.players,
            teamName: place.teamName,
            avatarSize: isChampion ? 52 : 44,
          ),
        ],
      ),
    );

    if (!isChampion) return card;

    // A coroa fica FORA do card, encostada no topo: dentro ela roubaria a
    // altura do degrau e desalinharia a escada.
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          Icons.workspace_premium_rounded,
          size: 30,
          color: _medalColors[1],
        ),
        const SizedBox(height: AppSpacing.xs),
        card,
      ],
    );
  }
}

/// Os atletas da equipe, lado a lado, com o primeiro nome sob cada avatar.
///
/// Sem elenco resolvido (partida que não trouxe a equipe), cai no rótulo da
/// dupla: melhor o nome da dupla do que um buraco.
class _PlayersRow extends StatelessWidget {
  const _PlayersRow({
    required this.players,
    required this.teamName,
    required this.avatarSize,
  });

  final List<TournamentMatchCardPlayerViewModel> players;
  final String teamName;
  final double avatarSize;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    if (players.isEmpty) {
      return Text(
        teamName,
        maxLines: 2,
        textAlign: TextAlign.center,
        overflow: TextOverflow.ellipsis,
        style: AppTypography.soraRegular(
          fontSize: 13,
          fontWeight: FontWeight.w700,
          color: colors.onSurface,
        ),
      );
    }

    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final player in players) ...[
          if (player != players.first) const SizedBox(width: 6),
          Flexible(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                AthleteProfileAvatar(
                  size: avatarSize,
                  initials: player.initials,
                  imageUrl: player.avatarUrl,
                ),
                const SizedBox(height: AppSpacing.sm),
                Text(
                  player.name.isNotEmpty ? player.name : player.initials,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.soraRegular(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

class _UndecidedNotice extends StatelessWidget {
  const _UndecidedNotice();

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Container(
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: AppRadii.lgAll,
        border: Border.all(color: colors.outline.withValues(alpha: 0.5)),
      ),
      child: Row(
        children: [
          Icon(
            Icons.remove_circle_outline_rounded,
            size: 16,
            color: colors.onSurfaceMuted,
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              'Pódio não definido — a final desta categoria não foi concluída.',
              style: AppTypography.bodyS.copyWith(
                color: colors.onSurfaceMuted,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _PodiumEmptyState extends StatelessWidget {
  const _PodiumEmptyState();

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Column(
      children: [
        Icon(
          Icons.emoji_events_outlined,
          size: 40,
          color: colors.onSurfaceMuted,
        ),
        const SizedBox(height: AppSpacing.md),
        Text(
          'Nenhum pódio para mostrar',
          textAlign: TextAlign.center,
          style: AppTypography.titleS.copyWith(color: colors.onSurface),
        ),
        const SizedBox(height: AppSpacing.xs),
        Text(
          'Este torneio não tem categorias com resultado registrado.',
          textAlign: TextAlign.center,
          style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted),
        ),
      ],
    );
  }
}
