import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../domain/athlete_display_name.dart';
import '../../../domain/athlete_profile_options.dart';
import '../../../domain/athlete_profile_providers.dart';
import '../../../domain/athlete_rating.dart';
import '../../../domain/athlete_sports_levels_mapper.dart';
import '../../../domain/how_it_works/how_it_works_rules.dart';
import '../../../onboarding/domain/athlete_onboarding_options.dart';
import '../../widgets/athlete_level_zone_card.dart';
import 'how_it_works_parts.dart';
import 'level_review_sheet.dart';

/// Aba "Nível": o nível declarado por esporte, o acompanhamento do jogo
/// (rating) quando o esporte tem, a escada inteira e como o nível muda.
class HowItWorksLevelTab extends ConsumerStatefulWidget {
  const HowItWorksLevelTab({super.key, this.openedFromLevels = false});

  /// Aberta de Esportes e níveis: "Subir meu nível" volta pra lá em vez de
  /// empilhar a mesma tela.
  final bool openedFromLevels;

  @override
  ConsumerState<HowItWorksLevelTab> createState() => _HowItWorksLevelTabState();
}

class _HowItWorksLevelTabState extends ConsumerState<HowItWorksLevelTab> {
  String? _sportId;

  @override
  Widget build(BuildContext context) {
    final profile = ref.watch(athleteProfileProvider).valueOrNull;
    final enrollments = profile == null
        ? const <AthleteSportEnrollment>[]
        : AthleteSportsLevelsMapper.fromProfile(profile);
    AthleteSportEnrollment? selected;
    for (final e in enrollments) {
      if (e.firestoreSportId == _sportId) selected = e;
    }
    selected ??= enrollments.isEmpty ? null : enrollments.first;
    final levelLabel = AthleteProfileOptions.normalizeLevel(
      selected?.levelLabel,
    );
    final currentRank = AthleteProfileOptions.levelRank(levelLabel);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (enrollments.length > 1) ...[
          _SportChips(
            enrollments: enrollments,
            selectedId: selected?.firestoreSportId,
            onSelect: (id) => setState(() => _sportId = id),
          ),
          const SizedBox(height: 12),
        ],
        _LevelHero(enrollment: selected, levelLabel: levelLabel),
        const SizedBox(height: 20),
        HowItWorksSection(
          title: 'A escala',
          child: HowItWorksCard(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            child: Column(
              children: [
                // As mesmas frases que o atleta leu ao escolher o nível.
                for (final option in AthleteOnboardingOptions.levels)
                  _LevelRow(
                    option: option,
                    current: currentRank != null &&
                        AthleteProfileOptions.levelRank(option.label) ==
                            currentRank,
                    last: option == AthleteOnboardingOptions.levels.last,
                  ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 20),
        const HowItWorksSection(
          title: 'Como seu nível muda',
          child: HowItWorksCard(
            child: Column(
              children: [
                HowItWorksStep(
                  number: 1,
                  title: 'Você escolhe no cadastro',
                  subtitle: 'Até a sua primeira inscrição no esporte, dá pra '
                      'ajustar pra cima ou pra baixo.',
                ),
                HowItWorksStep(
                  number: 2,
                  title: 'Seu jogo é acompanhado',
                  subtitle:
                      'No vôlei, cada partida de torneio conta: quem venceu '
                      'e a força de quem você enfrentou.',
                ),
                HowItWorksStep(
                  number: 3,
                  title: 'Subir é com você',
                  subtitle:
                      'Em Esportes e níveis, quando quiser. O organizador '
                      'também pode te promover nos torneios dele.',
                ),
                HowItWorksStep(
                  number: 4,
                  title: 'Descer, só com a equipe',
                  subtitle: 'Depois da primeira inscrição o nível não desce '
                      'sozinho. Se ficou alto demais, peça uma revisão.',
                  last: true,
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 20),
        const HowItWorksNote(
          'Nível não sobe com XP nem com elo. Ele existe pra manter os jogos '
          'equilibrados.',
        ),
        if (selected != null) ...[
          const SizedBox(height: 20),
          HowItWorksLinkButton(
            label: 'Acho que meu nível está errado',
            onPressed: () => showLevelReviewSheet(
              context,
              sportLabel: selected!.label,
              levelLabel: levelLabel.isEmpty ? 'sem nível' : levelLabel,
              athleteName: profile == null ? '' : athleteDisplayName(profile),
              openedFromLevels: widget.openedFromLevels,
            ),
          ),
        ],
      ],
    );
  }
}

class _SportChips extends StatelessWidget {
  const _SportChips({
    required this.enrollments,
    required this.selectedId,
    required this.onSelect,
  });

  final List<AthleteSportEnrollment> enrollments;
  final String? selectedId;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 6,
      runSpacing: 6,
      children: [
        for (final e in enrollments)
          HowItWorksChoicePill(
            label: e.label,
            icon: e.icon,
            selected: e.firestoreSportId == selectedId,
            onTap: () => onSelect(e.firestoreSportId),
          ),
      ],
    );
  }
}

class _LevelHero extends ConsumerWidget {
  const _LevelHero({required this.enrollment, required this.levelLabel});

  final AthleteSportEnrollment? enrollment;
  final String levelLabel;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    final enrollment = this.enrollment;
    final sportCode = enrollment?.firestoreSportId ?? '';
    final rated = sportCode.isNotEmpty && isRatedSport(sportCode);
    final rating =
        rated ? ref.watch(athleteRatingProvider(sportCode)).valueOrNull : null;

    final String? trackingHint;
    if (enrollment == null) {
      trackingHint = null;
    } else if (!rated) {
      trackingHint =
          'No ${enrollment.label.toLowerCase()}, o nível é o que você '
          'declarou: o acompanhamento por partidas ainda é só no vôlei.';
    } else if (rating == null) {
      trackingHint =
          'Seu jogo começa a ser acompanhado na primeira partida de torneio '
          'neste esporte.';
    } else {
      trackingHint = null;
    }

    return HowItWorksCard(
      tint: AppColors.brand,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Container(
                width: 54,
                height: 54,
                decoration: BoxDecoration(
                  color: AppColors.brand,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Icon(
                  enrollment?.icon ?? Icons.sports_volleyball_rounded,
                  color: AppColors.black,
                  size: 28,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    HowItWorksKicker(
                      enrollment == null
                          ? 'Seu nível'
                          : 'Seu nível · ${enrollment.label}',
                      color: colors.brandText,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      levelLabel.isEmpty ? 'Sem nível definido' : levelLabel,
                      style: AppTypography.soraRegular(
                        fontSize: 22,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.3,
                        color: colors.onSurface,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            'Define as categorias de torneio em que você pode se inscrever e '
            'quem o Bora Jogar sugere pra você.',
            style: theme.textTheme.bodySmall?.copyWith(
              fontSize: 12.5,
              height: 1.45,
              color: colors.onSurfaceMuted,
            ),
          ),
          if (rating != null) AthleteLevelZoneCard(sportCode: sportCode),
          if (trackingHint != null) ...[
            const SizedBox(height: 8),
            Text(
              trackingHint,
              style: theme.textTheme.bodySmall?.copyWith(
                fontSize: 12,
                height: 1.4,
                color: colors.onSurfaceMuted,
                fontStyle: FontStyle.italic,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _LevelRow extends StatelessWidget {
  const _LevelRow({
    required this.option,
    required this.current,
    required this.last,
  });

  final OnboardingLevelOption option;
  final bool current;
  final bool last;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;

    return Container(
      padding: const EdgeInsets.symmetric(vertical: 11),
      decoration: BoxDecoration(
        border: last
            ? null
            : Border(
                bottom: BorderSide(
                  color: colors.onSurfaceMuted.withValues(alpha: 0.12),
                ),
              ),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  option.label,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w700,
                    color: current ? colors.brandText : colors.onSurface,
                  ),
                ),
                Text(
                  option.description,
                  style: theme.textTheme.bodySmall?.copyWith(
                    fontSize: 11.5,
                    color: colors.onSurfaceMuted,
                  ),
                ),
              ],
            ),
          ),
          if (current) ...[
            const SizedBox(width: 12),
            Container(
              height: 24,
              padding: const EdgeInsets.symmetric(horizontal: 8),
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: AppColors.brand,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                'VOCÊ',
                style: AppTypography.mono(
                  fontSize: 10.5,
                  fontWeight: FontWeight.w700,
                  color: AppColors.black,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
