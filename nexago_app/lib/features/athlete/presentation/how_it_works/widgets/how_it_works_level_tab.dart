import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../domain/athlete_display_name.dart';
import '../../../domain/athlete_profile_options.dart';
import '../../../domain/athlete_profile_providers.dart';
import '../../../domain/athlete_rating.dart';
import '../../../domain/athlete_sports_levels_mapper.dart';
import '../../../domain/how_it_works/how_it_works_rules.dart';
import '../../../domain/rating_ladder.dart';
import '../../../onboarding/domain/athlete_onboarding_options.dart';
import '../../widgets/athlete_level_zone_card.dart';
import 'how_it_works_parts.dart';
import 'level_points_evolution.dart';
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
    final sportCode = selected?.firestoreSportId ?? '';
    // Pontos de nível só existem nos esportes com rating (vôlei).
    final ladder = sportCode.isNotEmpty && isRatedSport(sportCode)
        ? ref.watch(ratingLadderProvider(sportCode)).valueOrNull ??
              kDefaultRatingLadder
        : null;
    // Os passos falam do vôlei mesmo com outro esporte selecionado.
    final volleyLadder =
        ladder ??
        ref.watch(ratingLadderProvider('VOLEI_PRAIA')).valueOrNull ??
        kDefaultRatingLadder;

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
        _LevelHero(
          enrollment: selected,
          levelLabel: levelLabel,
          ladder: ladder,
        ),
        const SizedBox(height: 20),
        if (ladder != null)
          LevelPointsEvolution(sportCode: sportCode, ladder: ladder),
        HowItWorksSection(
          title: ladder == null ? 'A escala' : 'A escala e os pontos',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              HowItWorksCard(
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 4,
                ),
                child: Column(
                  children: [
                    if (ladder != null)
                      _PointsHeader(showDemote: ladder.autoRelegates),
                    // As mesmas frases que o atleta leu ao escolher o nível.
                    for (final option in AthleteOnboardingOptions.levels)
                      _LevelRow(
                        option: option,
                        current: currentRank != null &&
                            AthleteProfileOptions.levelRank(option.label) ==
                                currentRank,
                        points: ladder == null
                            ? null
                            : _ladderLevelFor(ladder, option.label),
                        showDemote: ladder?.autoRelegates ?? false,
                        last: option == AthleteOnboardingOptions.levels.last,
                      ),
                  ],
                ),
              ),
              if (ladder != null) ...[
                const SizedBox(height: 8),
                Text(
                  _pointsRulesText(ladder),
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    fontSize: 11.5,
                    height: 1.45,
                    color: context.themeColors.onSurfaceMuted,
                  ),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 20),
        HowItWorksSection(
          title: 'Como seu nível muda',
          child: HowItWorksCard(
            child: Column(
              children: [
                const HowItWorksStep(
                  number: 1,
                  title: 'Você escolhe no cadastro',
                  subtitle: 'Até a sua primeira inscrição no esporte, dá pra '
                      'ajustar pra cima ou pra baixo.',
                ),
                const HowItWorksStep(
                  number: 2,
                  title: 'Seu jogo vira pontos de nível',
                  subtitle:
                      'No vôlei, cada partida de torneio conta: quem venceu '
                      'e a força de quem você enfrentou.',
                ),
                volleyLadder.autoPromotes
                    ? HowItWorksStep(
                        number: 3,
                        title: 'Passou da marca, você sobe',
                        subtitle:
                            'Com ${volleyLadder.minRatedMatches} partidas '
                            'rateadas e o rating confiável, a subida é '
                            'automática. Dá pra subir '
                            'antes em Esportes e níveis, e o organizador pode '
                            'te promover nos torneios dele.',
                      )
                    : const HowItWorksStep(
                        number: 3,
                        title: 'Subir é com você',
                        subtitle:
                            'Em Esportes e níveis, quando quiser. O '
                            'organizador também pode te promover nos torneios '
                            'dele.',
                      ),
                volleyLadder.autoRelegates
                    ? HowItWorksStep(
                        number: 4,
                        title: 'Abaixo da faixa, você pode descer',
                        subtitle:
                            'No vôlei, depois de '
                            '${volleyLadder.relegationObservationDays} dias '
                            'abaixo da marca e com '
                            '${volleyLadder.relegationObservationMinMatches} '
                            'partidas na janela, desce um degrau. Sem jogar, '
                            'não desce. Fora isso, só a equipe baixa.',
                        last: true,
                      )
                    : const HowItWorksStep(
                        number: 4,
                        title: 'Descer, só com a equipe',
                        subtitle:
                            'Depois da primeira inscrição o nível não desce '
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

String _formatPoints(int points) =>
    NumberFormat.decimalPattern('pt_BR').format(points);

RatingLadderLevel? _ladderLevelFor(RatingLadder ladder, String label) {
  final rank = AthleteProfileOptions.levelRank(label);
  for (final level in ladder.levels) {
    if (level.rank == rank) return level;
  }
  return null;
}

/// O que é a tabela e o que acontece ao chegar na marca — depende das flags
/// da escada (hoje em modo sombra: ninguém sobe sozinho).
String _pointsRulesText(RatingLadder ladder) {
  final arrival = ladder.autoPromotes
      ? 'Passou da marca do seu nível, com ${ladder.minRatedMatches} partidas '
            'rateadas e o rating confiável, você sobe sozinho.'
      : 'Passou da marca do seu nível? Seu jogo já é do nível de cima: suba '
            'em Esportes e níveis.';
  final descent = ladder.autoRelegates
      ? ' Ficou abaixo da marca de descida? São '
            '${ladder.relegationObservationDays} dias de observação: se '
            'terminar com ${ladder.relegationObservationMinMatches} partidas ou '
            'mais e ainda abaixo, desce um degrau. Sem jogar, ninguém desce.'
      : '';
  return 'Você começa com os pontos do nível que declarou. Vitória soma, '
      'derrota tira, e ganhar de quem tem mais pontos vale mais (W.O. não '
      'conta). $arrival$descent';
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
  const _LevelHero({
    required this.enrollment,
    required this.levelLabel,
    required this.ladder,
  });

  final AthleteSportEnrollment? enrollment;
  final String levelLabel;

  /// Escada de pontos do esporte; `null` quando o esporte não tem rating.
  final RatingLadder? ladder;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    final enrollment = this.enrollment;
    final sportCode = enrollment?.firestoreSportId ?? '';
    final ladder = this.ladder;
    final rated = ladder != null;
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
          if (rating != null && ladder != null) ...[
            const SizedBox(height: 14),
            _LevelPoints(
              ladder: ladder,
              ratedMatches: rating.ratedMatches,
              rd: rating.rd,
              progress: levelPointsProgress(
                ladder.levels,
                // O nível da engine é o das bandas da zona; sem ele, o
                // declarado.
                rating.levelCode.isNotEmpty ? rating.levelCode : levelLabel,
                rating.rating,
              ),
            ),
            AthleteLevelZoneCard(sportCode: sportCode),
          ],
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

/// Largura das colunas de pontos — cabe "1.250" em mono 12,5.
const double _pointsColumnWidth = 52;

class _PointsHeader extends StatelessWidget {
  const _PointsHeader({required this.showDemote});

  /// Coluna "desce" só quando a descida automática está ligada.
  final bool showDemote;

  @override
  Widget build(BuildContext context) {
    final style = AppTypography.mono(
      fontSize: 9.5,
      fontWeight: FontWeight.w700,
      letterSpacing: 0.6,
      color: context.themeColors.onSurfaceMuted,
    );
    return Padding(
      padding: const EdgeInsets.only(top: 10, bottom: 2),
      child: Row(
        children: [
          Expanded(child: Text('NÍVEL', style: style)),
          if (showDemote)
            SizedBox(
              width: _pointsColumnWidth,
              child: Text('DESCE', style: style, textAlign: TextAlign.right),
            ),
          SizedBox(
            width: _pointsColumnWidth,
            child: Text('INÍCIO', style: style, textAlign: TextAlign.right),
          ),
          SizedBox(
            width: _pointsColumnWidth,
            child: Text('SOBE', style: style, textAlign: TextAlign.right),
          ),
        ],
      ),
    );
  }
}

class _LevelPoints extends StatelessWidget {
  const _LevelPoints({
    required this.ladder,
    required this.progress,
    required this.ratedMatches,
    required this.rd,
  });

  final RatingLadder ladder;
  final LevelPointsProgress progress;
  final int ratedMatches;
  final double rd;

  /// O que falta depois de passar da marca — os mesmos portões da engine.
  String _arrivalHint() {
    final missing = ladder.minRatedMatches - ratedMatches;
    return switch (promotionGate(ladder, ratedMatches: ratedMatches, rd: rd)) {
      PromotionGate.manual => 'Suba em Esportes e níveis.',
      PromotionGate.needsMatches =>
        'A subida sai quando você completar ${ladder.minRatedMatches} '
            'partidas rateadas (faltam $missing).',
      // Não culpa só o tempo parado: com 10 a 15 partidas o rating costuma
      // ainda estar incerto mesmo jogando.
      PromotionGate.needsReliability =>
        'A subida sai quando seu rating ficar mais confiável: isso vem '
            'jogando mais partidas de torneio (ficar parado atrasa).',
      PromotionGate.ready =>
        'A subida sai na próxima atualização do seu rating.',
    };
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    final next = progress.next;
    final promoteAt = progress.level.promoteAt;
    final muted = theme.textTheme.bodySmall?.copyWith(
      fontSize: 12,
      height: 1.4,
      color: colors.onSurfaceMuted,
    );
    final strong = TextStyle(
      fontWeight: FontWeight.w800,
      color: colors.onSurface,
    );

    final InlineSpan status;
    if (next == null || promoteAt == null) {
      status = const TextSpan(text: 'Você está no topo da escada.');
    } else if (progress.reachedPromotion) {
      status = TextSpan(
        children: [
          TextSpan(text: 'Você passou dos ${_formatPoints(promoteAt)} pts: '),
          TextSpan(text: 'seu jogo já é de ${next.label}', style: strong),
          TextSpan(text: '. ${_arrivalHint()}'),
        ],
      );
    } else {
      status = TextSpan(
        children: [
          const TextSpan(text: 'Faltam '),
          TextSpan(
            text: '${_formatPoints(progress.pointsToPromote!)} pts',
            style: strong,
          ),
          TextSpan(
            text: ' pra ${next.label} (${_formatPoints(promoteAt)})',
          ),
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: HowItWorksKicker(
                'Pontos de nível',
                color: colors.brandText,
              ),
            ),
            Text(
              '${_formatPoints(progress.points)} pts',
              style: AppTypography.mono(
                fontSize: 15,
                fontWeight: FontWeight.w700,
                color: colors.onSurface,
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        ClipRRect(
          borderRadius: BorderRadius.circular(999),
          child: LinearProgressIndicator(
            minHeight: 8,
            value: progress.progress,
            backgroundColor: colors.onSurfaceMuted.withValues(alpha: 0.15),
            color: AppColors.brand,
          ),
        ),
        const SizedBox(height: 8),
        Text.rich(status, style: muted),
      ],
    );
  }
}

class _LevelRow extends StatelessWidget {
  const _LevelRow({
    required this.option,
    required this.current,
    required this.last,
    this.points,
    this.showDemote = false,
  });

  final OnboardingLevelOption option;
  final bool current;
  final bool last;

  /// Degrau da escada de pontos; `null` no esporte sem rating.
  final RatingLadderLevel? points;
  final bool showDemote;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    final points = this.points;
    final pointsStyle = AppTypography.mono(
      fontSize: 12.5,
      fontWeight: FontWeight.w700,
      color: current ? colors.brandText : colors.onSurface,
    );
    String format(int? value) => value == null ? '—' : _formatPoints(value);

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
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        option.label,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          fontSize: 13.5,
                          fontWeight: FontWeight.w700,
                          color: current ? colors.brandText : colors.onSurface,
                        ),
                      ),
                    ),
                    if (current) ...[
                      const SizedBox(width: 8),
                      Container(
                        height: 20,
                        padding: const EdgeInsets.symmetric(horizontal: 6),
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: AppColors.brand,
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          'VOCÊ',
                          style: AppTypography.mono(
                            fontSize: 9.5,
                            fontWeight: FontWeight.w700,
                            color: AppColors.black,
                          ),
                        ),
                      ),
                    ],
                  ],
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
          if (points != null) ...[
            if (showDemote)
              SizedBox(
                width: _pointsColumnWidth,
                child: Text(
                  format(points.demoteAt),
                  style: pointsStyle,
                  textAlign: TextAlign.right,
                ),
              ),
            SizedBox(
              width: _pointsColumnWidth,
              child: Text(
                format(points.initialRating),
                style: pointsStyle,
                textAlign: TextAlign.right,
              ),
            ),
            SizedBox(
              width: _pointsColumnWidth,
              child: Text(
                format(points.promoteAt),
                style: pointsStyle,
                textAlign: TextAlign.right,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
