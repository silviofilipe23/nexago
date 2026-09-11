import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_radii.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../domain/athlete_podiums.dart';
import '../../../domain/athlete_public_profile_providers.dart';
import '../../../domain/sport_art_catalog.dart';

/// Aba "Conquistas" do perfil público: os pódios do atleta em torneios.
///
/// São RESULTADOS, não gamificação. As conquistas de XP vivem em
/// `users/{uid}/gamification/**`, que só o dono pode ler — daí esta aba mostrar
/// pódio, que sai de coleções públicas.
class PublicProfileAchievementsTab extends ConsumerWidget {
  const PublicProfileAchievementsTab({super.key, required this.userId});

  final String userId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(athletePodiumsProvider(userId));

    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        AppSpacing.lg,
        AppSpacing.screenH,
        0,
      ),
      child: async.when(
        loading: () => const Padding(
          padding: EdgeInsets.symmetric(vertical: AppSpacing.xxxl),
          child: Center(
            child: CircularProgressIndicator(color: AppColors.brand),
          ),
        ),
        error: (_, __) => const _Aviso(
          texto: 'Não foi possível carregar as conquistas.',
        ),
        data: (podiums) {
          if (podiums.isEmpty) {
            return const _Aviso(
              texto: 'Ainda sem pódios em torneios.',
            );
          }

          final counts = podiumCounts(podiums);

          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _ResumoPodio(counts: counts),
              const SizedBox(height: AppSpacing.xl),
              for (var i = 0; i < podiums.length; i++) ...[
                if (i > 0) const SizedBox(height: AppSpacing.md),
                _PodiumTile(podium: podiums[i]),
              ],
            ],
          );
        },
      ),
    );
  }
}

/// Quantos ouros, pratas e bronzes — a leitura rápida antes da lista.
class _ResumoPodio extends StatelessWidget {
  const _ResumoPodio({required this.counts});

  final Map<int, int> counts;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        for (var place = 1; place <= kPodiumMaxPlace; place++) ...[
          if (place > 1) const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: _ResumoCelula(place: place, total: counts[place] ?? 0),
          ),
        ],
      ],
    );
  }
}

class _ResumoCelula extends StatelessWidget {
  const _ResumoCelula({required this.place, required this.total});

  final int place;
  final int total;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final metal = _PodiumMetal.of(place);
    // Zero fica apagado: a vitrine não deve gritar o que a pessoa não tem.
    final vazio = total == 0;

    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.sm,
        vertical: AppSpacing.md,
      ),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: AppRadii.mdAll,
        border: Border.all(
          color: vazio
              ? colors.onSurfaceMuted.withValues(alpha: 0.12)
              : metal.color.withValues(alpha: 0.45),
        ),
      ),
      child: Column(
        children: [
          Icon(
            Icons.emoji_events_rounded,
            size: 20,
            color: vazio
                ? colors.onSurfaceMuted.withValues(alpha: 0.35)
                : metal.color,
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            '$total',
            style: AppTypography.soraRegular(
              fontSize: 18,
              fontWeight: FontWeight.w800,
              color: vazio ? colors.onSurfaceMuted : colors.onSurface,
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            metal.label,
            style: AppTypography.mono(
              fontSize: 9,
              fontWeight: FontWeight.w600,
              color: colors.onSurfaceMuted,
              letterSpacing: 0.5,
            ),
          ),
        ],
      ),
    );
  }
}

class _PodiumTile extends StatelessWidget {
  const _PodiumTile({required this.podium});

  final AthletePodium podium;

  void _openTournament(BuildContext context) {
    final id = podium.tournamentId.trim();
    if (id.isEmpty) return;
    // Detalhe público do torneio — não o histórico do atleta logado.
    // athleteTournamentDetail só resolve torneios da campanha do viewer.
    context.pushNamed(
      AppRouteNames.tournamentDetail,
      pathParameters: {'tournamentId': id},
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final metal = _PodiumMetal.of(podium.place);
    final art = SportArtCatalog.assetFor(podium.sportCode);

    return Material(
      color: colors.surfaceCard,
      borderRadius: AppRadii.mdAll,
      child: InkWell(
        onTap: () => _openTournament(context),
        borderRadius: AppRadii.mdAll,
        child: Container(
          padding: const EdgeInsets.all(AppSpacing.md),
          decoration: BoxDecoration(
            borderRadius: AppRadii.mdAll,
            border: Border.all(
              color: colors.onSurfaceMuted.withValues(alpha: 0.12),
            ),
          ),
          child: Row(
            children: [
              _MedalhaCircular(place: podium.place, metal: metal),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      podium.tournamentName,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.soraRegular(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: colors.onSurface,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    Text(
                      '${metal.label} · ${podium.year}',
                      style: AppTypography.soraRegular(
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                        color: colors.onSurfaceMuted,
                      ),
                    ),
                  ],
                ),
              ),
              // A arte do esporte marca a modalidade sem precisar de rótulo. Some
              // quando o esporte não tem arte, em vez de virar caixa vazia.
              if (art != null) ...[
                const SizedBox(width: AppSpacing.sm),
                ClipRRect(
                  borderRadius: AppRadii.smAll,
                  child: Image.asset(
                    art,
                    width: 52,
                    height: 40,
                    fit: BoxFit.cover,
                    // Ancorado à DIREITA: o miolo destas artes é preto de
                    // propósito (é onde o texto do card de esporte se apoia), e
                    // um recorte central viraria um retângulo escuro invisível.
                    // O atleta mora no terço direito.
                    alignment: Alignment.centerRight,
                    excludeFromSemantics: true,
                    errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _MedalhaCircular extends StatelessWidget {
  const _MedalhaCircular({required this.place, required this.metal});

  final int place;
  final _PodiumMetal metal;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 38,
      height: 38,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: metal.color.withValues(alpha: 0.16),
        border: Border.all(color: metal.color.withValues(alpha: 0.5)),
      ),
      child: Text(
        '$placeº',
        style: AppTypography.soraRegular(
          fontSize: 13,
          fontWeight: FontWeight.w800,
          color: metal.color,
        ),
      ),
    );
  }
}

/// Ouro, prata e bronze. Mesma metáfora do badge de ranking do topo.
class _PodiumMetal {
  const _PodiumMetal({required this.color, required this.label});

  final Color color;
  final String label;

  static _PodiumMetal of(int place) => switch (place) {
        1 => const _PodiumMetal(color: Color(0xFFE9C46A), label: 'CAMPEÃO'),
        2 => const _PodiumMetal(color: Color(0xFFC6CCD4), label: 'VICE'),
        _ => const _PodiumMetal(color: Color(0xFFCE8E5C), label: '3º LUGAR'),
      };
}

class _Aviso extends StatelessWidget {
  const _Aviso({required this.texto});

  final String texto;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xxxl),
      child: Center(
        child: Text(
          texto,
          textAlign: TextAlign.center,
          style: AppTypography.soraRegular(
            fontSize: 14,
            fontWeight: FontWeight.w500,
            color: context.themeColors.onSurfaceMuted,
          ),
        ),
      ),
    );
  }
}
