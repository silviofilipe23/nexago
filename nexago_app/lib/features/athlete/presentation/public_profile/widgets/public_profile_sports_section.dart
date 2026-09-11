import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_radii.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../domain/athlete_public_profile_models.dart';
import '../../../domain/sport_art_catalog.dart';

/// Ícone do esporte pelo rótulo. Não há mapa centralizado de ícone por esporte
/// no projeto; este é local e cai num genérico quando não reconhece.
IconData _sportIcon(String label) {
  final l = label.toLowerCase();
  if (l.contains('futebol')) return Icons.sports_soccer_rounded;
  if (l.contains('quadra')) return Icons.sports_volleyball_outlined;
  if (l.contains('vôlei') || l.contains('volei')) {
    return Icons.sports_volleyball_rounded;
  }
  if (l.contains('tênis') || l.contains('tenis')) {
    return Icons.sports_tennis_rounded;
  }
  return Icons.sports_outlined;
}

/// Seção "Esportes" do perfil público: abas de esporte e o detalhe do que
/// estiver selecionado.
///
/// A aba escolhida é estado local — trocar de esporte não recarrega nada, só
/// troca qual entrada da lista o card mostra.
class PublicProfileSportsSection extends StatefulWidget {
  const PublicProfileSportsSection({
    super.key,
    required this.sports,
    this.onCompete,
    this.onOpenSport,
    this.onOpenStats,
  });

  final List<AthletePublicSportEntry> sports;

  /// Ação "COMPETIR" do cabeçalho. Sem callback o atalho não aparece.
  final VoidCallback? onCompete;

  /// Toque no card do esporte selecionado.
  final ValueChanged<AthletePublicSportEntry>? onOpenSport;

  /// Botão de estatísticas do card.
  final ValueChanged<AthletePublicSportEntry>? onOpenStats;

  @override
  State<PublicProfileSportsSection> createState() =>
      _PublicProfileSportsSectionState();
}

class _PublicProfileSportsSectionState
    extends State<PublicProfileSportsSection> {
  int _selected = 0;

  @override
  void didUpdateWidget(PublicProfileSportsSection oldWidget) {
    super.didUpdateWidget(oldWidget);
    // A lista pode encolher entre builds (perfil recarregado, esporte
    // removido). Sem isso o índice sobreviveria apontando para fora.
    if (_selected >= widget.sports.length) _selected = 0;
  }

  @override
  Widget build(BuildContext context) {
    final sports = widget.sports;
    if (sports.isEmpty) return const SizedBox.shrink();

    final index = _selected.clamp(0, sports.length - 1);
    final current = sports[index];
    final colors = context.themeColors;

    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        AppSpacing.xl,
        AppSpacing.screenH,
        0,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Text(
                'Esportes',
                style: AppTypography.soraRegular(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: colors.onSurface,
                ),
              ),
              const Spacer(),
              if (widget.onCompete != null)
                _CompeteAction(onTap: widget.onCompete!),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          _SportTabs(
            sports: sports,
            selected: index,
            onSelect: (i) => setState(() => _selected = i),
          ),
          const SizedBox(height: AppSpacing.md),
          _SportDetailCard(
            entry: current,
            onTap: widget.onOpenSport == null
                ? null
                : () => widget.onOpenSport!(current),
            onStats: widget.onOpenStats == null
                ? null
                : () => widget.onOpenStats!(current),
          ),
        ],
      ),
    );
  }
}

class _CompeteAction extends StatelessWidget {
  const _CompeteAction({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: AppRadii.smAll,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'COMPETIR',
              style: AppTypography.mono(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: AppColors.brand,
                letterSpacing: 0.6,
              ),
            ),
            const SizedBox(width: 2),
            const Icon(
              Icons.chevron_right_rounded,
              size: 18,
              color: AppColors.brand,
            ),
          ],
        ),
      ),
    );
  }
}

/// Faixa horizontal de esportes. Rola quando não cabem — com três ou mais
/// esportes de nome longo a linha estoura num telefone estreito.
class _SportTabs extends StatelessWidget {
  const _SportTabs({
    required this.sports,
    required this.selected,
    required this.onSelect,
  });

  final List<AthletePublicSportEntry> sports;
  final int selected;
  final ValueChanged<int> onSelect;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (var i = 0; i < sports.length; i++) ...[
            if (i > 0) const SizedBox(width: AppSpacing.sm),
            _SportTab(
              entry: sports[i],
              active: i == selected,
              onTap: () => onSelect(i),
            ),
          ],
        ],
      ),
    );
  }
}

class _SportTab extends StatelessWidget {
  const _SportTab({
    required this.entry,
    required this.active,
    required this.onTap,
  });

  final AthletePublicSportEntry entry;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final fg = active ? AppColors.black : colors.onSurface;

    return Material(
      color: active ? AppColors.brand : colors.surfaceCard,
      borderRadius: AppRadii.pillAll,
      child: InkWell(
        onTap: onTap,
        borderRadius: AppRadii.pillAll,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            borderRadius: AppRadii.pillAll,
            border: Border.all(
              color: active
                  ? Colors.transparent
                  : colors.onSurfaceMuted.withValues(alpha: 0.18),
            ),
          ),
          child: Text(
            entry.label,
            style: AppTypography.soraRegular(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: fg,
            ),
          ),
        ),
      ),
    );
  }
}

class _SportDetailCard extends StatelessWidget {
  const _SportDetailCard({required this.entry, this.onTap, this.onStats});

  final AthletePublicSportEntry entry;
  final VoidCallback? onTap;
  final VoidCallback? onStats;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    final art = SportArtCatalog.assetFor(entry.firestoreCode);

    final conteudo = InkWell(
      onTap: onTap,
      borderRadius: AppRadii.lgAll,
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.lg),
        decoration: BoxDecoration(
          borderRadius: AppRadii.lgAll,
          border: Border.all(
            color: colors.onSurfaceMuted.withValues(alpha: 0.12),
          ),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: AppColors.brand.withValues(alpha: 0.14),
                  ),
                  child: Icon(
                    _sportIcon(entry.label),
                    size: 20,
                    color: AppColors.brand,
                  ),
                ),
                const SizedBox(width: AppSpacing.md),
                // Texto e selo num Expanded só: com `Spacer` separado ele
                // disputava a sobra com o texto e truncava o nome à toa.
                Expanded(
                  child: Row(
                    children: [
                      Flexible(
                        child: Text(
                          entry.label,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AppTypography.soraRegular(
                            fontSize: 15,
                            fontWeight: FontWeight.w800,
                            color: colors.onSurface,
                          ),
                        ),
                      ),
                      if (entry.isPrimary) ...[
                        const SizedBox(width: AppSpacing.sm),
                        const _PrimaryBadge(),
                      ],
                    ],
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                if (onStats != null) _StatsButton(onTap: onStats!),
              ],
            ),
            const SizedBox(height: AppSpacing.lg),
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Expanded(
                  child: _Metric(
                    label: 'NÍVEL',
                    value: entry.levelLabel,
                    segments: entry.levelSegments,
                  ),
                ),
                const SizedBox(width: AppSpacing.lg),
                Expanded(
                  child: _Metric(
                    label: 'RANKING',
                    // Posição no ranking DAQUELE esporte. Ainda não existe
                    // por esporte — só o rank geral —, então mostra travessão
                    // em vez de inventar número.
                    value: entry.rankingPosition == null
                        ? '—'
                        : '#${entry.rankingPosition}',
                  ),
                ),
                if (onTap != null)
                  Icon(
                    Icons.chevron_right_rounded,
                    size: 22,
                    color: colors.onSurfaceMuted,
                  ),
              ],
            ),
          ],
        ),
      ),
    );

    // Esporte sem arte (Futevôlei, Corrida, Outros) cai no card sólido.
    if (art == null) {
      return Material(
        color: colors.surfaceCard,
        borderRadius: AppRadii.lgAll,
        child: conteudo,
      );
    }

    return Material(
      color: colors.surfaceCard,
      borderRadius: AppRadii.lgAll,
      clipBehavior: Clip.antiAlias,
      // `Ink.image`, não `Image` dentro do `InkWell`: como filha do InkWell a
      // foto pinta por cima do splash e o toque fica sem retorno visual.
      child: Ink.image(
        image: ResizeImage(AssetImage(art), width: 1024, allowUpscaling: false),
        fit: BoxFit.cover,
        // Escurece a arte inteira. O terço esquerdo das seis artes já é preto
        // (medi p95 entre 5 e 15), então isto existe para o assunto à direita
        // não competir com a seta e o botão de estatísticas.
        colorFilter: const ColorFilter.mode(
          Color(0xFF8C8C8C),
          BlendMode.multiply,
        ),
        child: conteudo,
      ),
    );
  }
}

class _PrimaryBadge extends StatelessWidget {
  const _PrimaryBadge();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: AppColors.brand,
        borderRadius: AppRadii.pillAll,
      ),
      child: Text(
        'PRINCIPAL',
        style: AppTypography.mono(
          fontSize: 9,
          fontWeight: FontWeight.w700,
          color: AppColors.black,
          letterSpacing: 0.5,
        ),
      ),
    );
  }
}

class _StatsButton extends StatelessWidget {
  const _StatsButton({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Material(
      color: colors.surfaceRaised,
      borderRadius: AppRadii.mdAll,
      child: InkWell(
        onTap: onTap,
        borderRadius: AppRadii.mdAll,
        child: SizedBox(
          width: 38,
          height: 38,
          child: Icon(
            Icons.bar_chart_rounded,
            size: 20,
            color: colors.onSurface,
          ),
        ),
      ),
    );
  }
}

class _Metric extends StatelessWidget {
  const _Metric({required this.label, required this.value, this.segments});

  final String label;
  final String value;

  /// Quando presente, desenha a barra segmentada de progresso sob o valor.
  final int? segments;

  static const _totalSegments = 7;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final filled = segments;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          label,
          style: AppTypography.mono(
            fontSize: 10,
            fontWeight: FontWeight.w600,
            color: colors.onSurfaceMuted,
            letterSpacing: 0.6,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          value,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: AppTypography.soraRegular(
            fontSize: 17,
            fontWeight: FontWeight.w800,
            color: colors.onSurface,
          ),
        ),
        if (filled != null) ...[
          const SizedBox(height: 8),
          Row(
            children: [
              for (var i = 0; i < _totalSegments; i++) ...[
                if (i > 0) const SizedBox(width: 3),
                Expanded(
                  child: SizedBox(
                    height: 4,
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        borderRadius: AppRadii.pillAll,
                        color: i < filled
                            ? AppColors.brand
                            : colors.onSurfaceMuted.withValues(alpha: 0.22),
                      ),
                    ),
                  ),
                ),
              ],
            ],
          ),
        ],
      ],
    );
  }
}
