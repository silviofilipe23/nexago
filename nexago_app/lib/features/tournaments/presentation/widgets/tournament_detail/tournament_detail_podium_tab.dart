import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../../../core/formatting/app_currency_format.dart';
import '../../../../../core/theme/app_radii.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../domain/tournament_podium_logic.dart';
import 'tournament_detail_tab_slivers.dart';

/// Cores dos degraus. São do pódio, não do tema: ouro/prata/bronze não mudam
/// com o modo claro/escuro nem com a marca.
const _medalColors = <int, Color>{
  1: Color(0xFFE3B341),
  2: Color(0xFFB8C0CC),
  3: Color(0xFFCE8946),
};

const _medalEmojis = <int, String>{1: '🥇', 2: '🥈', 3: '🥉'};

const _placeLabels = <int, String>{
  1: 'Campeão',
  2: 'Vice',
  3: '3º lugar',
};

/// Pódio do torneio: um bloco por categoria, do campeão ao terceiro lugar.
///
/// Só é alcançável depois que o torneio termina (ver
/// [tournamentPodiumAvailable]), então aqui não há gate nenhum — a tela
/// renderiza o que recebe.
class TournamentDetailPodiumTab extends StatelessWidget {
  const TournamentDetailPodiumTab({super.key, required this.podiums});

  final List<TournamentCategoryPodium> podiums;

  List<Widget> buildSlivers() {
    if (podiums.isEmpty) {
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

    return tournamentDetailTabSliversFromChildren(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        AppSpacing.sm,
        AppSpacing.screenH,
        AppSpacing.xxxl,
      ),
      children: [
        for (final podium in podiums) _CategoryPodiumCard(podium: podium),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return CustomScrollView(slivers: buildSlivers());
  }
}

class _CategoryPodiumCard extends StatelessWidget {
  const _CategoryPodiumCard({required this.podium});

  final TournamentCategoryPodium podium;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.md),
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.lg,
        AppSpacing.lg,
        AppSpacing.lg,
        AppSpacing.md,
      ),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: AppRadii.lgAll,
        border: Border.all(color: colors.outline.withValues(alpha: 0.5)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            podium.categoryName.toUpperCase(),
            style: AppTypography.mono(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: colors.onSurfaceMuted,
              letterSpacing: 1.1,
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          if (!podium.isDecided)
            const _UndecidedRow()
          else
            for (final place in podium.places) ...[
              _PodiumPlaceRow(place: place),
              if (place != podium.places.last)
                const SizedBox(height: AppSpacing.sm),
            ],
          const SizedBox(height: AppSpacing.xs),
        ],
      ),
    );
  }
}

class _PodiumPlaceRow extends StatelessWidget {
  const _PodiumPlaceRow({required this.place});

  final TournamentPodiumPlace place;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final medal = _medalColors[place.place] ?? colors.onSurfaceMuted;
    final isChampion = place.place == 1;

    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md,
        vertical: AppSpacing.md,
      ),
      decoration: BoxDecoration(
        color: medal.withValues(alpha: isChampion ? 0.12 : 0.07),
        borderRadius: AppRadii.mdAll,
        border: Border.all(color: medal.withValues(alpha: 0.35)),
      ),
      child: Row(
        children: [
          Text(
            _medalEmojis[place.place] ?? '',
            style: TextStyle(fontSize: isChampion ? 24 : 20),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  (_placeLabels[place.place] ?? '').toUpperCase(),
                  style: AppTypography.mono(
                    fontSize: 9,
                    fontWeight: FontWeight.w700,
                    color: colors.onSurfaceMuted,
                    letterSpacing: 0.6,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  place.teamName,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.soraRegular(
                    fontSize: isChampion ? 16 : 14,
                    fontWeight: isChampion ? FontWeight.w800 : FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
              ],
            ),
          ),
          if (place.prizeValue > 0) ...[
            const SizedBox(width: AppSpacing.sm),
            Container(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.md,
                vertical: 5,
              ),
              decoration: BoxDecoration(
                color: colors.win.withValues(alpha: 0.14),
                borderRadius: AppRadii.pillAll,
              ),
              child: Text(
                _prizeLabel(place.prizeValue),
                style: AppTypography.mono(
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                  color: colors.win,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _UndecidedRow extends StatelessWidget {
  const _UndecidedRow();

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Row(
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
            style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted),
          ),
        ),
      ],
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

/// Prêmio redondo sai sem centavos (`R$ 500`), quebrado sai completo.
String _prizeLabel(double value) {
  return value == value.roundToDouble()
      ? formatBRLWhole(value)
      : formatBRL(value);
}
