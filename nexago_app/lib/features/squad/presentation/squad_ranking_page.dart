import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../application/squad_providers.dart';
import '../domain/squad_models.dart';
import '../domain/squad_rules.dart';
import 'squad_page.dart' show SquadLoadingList;
import 'widgets/squad_ui.dart';

/// App 04 · Squad Ranking — embaixadores do ciclo por pontos (nunca Score).
class SquadRankingPage extends ConsumerWidget {
  const SquadRankingPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(squadRankingProvider);
    final pilot =
        ref.watch(mySquadProvider).valueOrNull?.member?.isPilot ?? true;
    return SquadScaffold(
      title: 'Squad Ranking',
      subtitle:
          '${pilot ? 'Pontos do piloto' : 'Pontos do ciclo'} · conversões confirmadas',
      body: async.when(
        skipLoadingOnRefresh: true,
        loading: () => const SquadLoadingList(),
        error: (e, _) => SquadMessage(
          title: 'Não foi possível carregar o ranking',
          message: e.toString(),
          actionLabel: 'Tentar de novo',
          onAction: () => ref.invalidate(squadRankingProvider),
          icon: Icons.wifi_off_rounded,
        ),
        data: (ranking) => RefreshIndicator(
          color: AppColors.brand,
          onRefresh: () => ref.refresh(squadRankingProvider.future),
          child: _RankingBody(ranking: ranking),
        ),
      ),
    );
  }
}

class _RankingBody extends StatelessWidget {
  const _RankingBody({required this.ranking});

  final SquadRanking ranking;

  @override
  Widget build(BuildContext context) {
    final entries = ranking.entries;
    final podium = entries.length >= 3;
    final rest = podium ? entries.skip(3).toList() : entries;
    final me = ranking.me;
    final meOutside = me != null && !entries.any((e) => e.me);
    final move = squadRankingMoveLine(me);
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 6, 20, 40),
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        if (move != null) _MoveBanner(text: move, up: (me?.delta ?? 0) > 0),
        if (podium) ...[
          const SizedBox(height: 20),
          _Podium(first: entries[0], second: entries[1], third: entries[2]),
        ],
        const SizedBox(height: 16),
        for (var i = 0; i < rest.length; i++)
          _RankRow(entry: rest[i], divider: i > 0),
        if (meOutside) ...[
          const SizedBox(height: 8),
          _RankRow(entry: me, divider: true),
        ],
        if (ranking.levels.isNotEmpty) ...[
          const SizedBox(height: 18),
          _Levels(levels: ranking.levels, current: ranking.level),
        ],
      ],
    );
  }
}

class _MoveBanner extends StatelessWidget {
  const _MoveBanner({required this.text, required this.up});

  final String text;
  final bool up;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final tone = up ? colors.win : SquadStyle.mute(colors);
    return Container(
      key: const Key('squad-ranking-move'),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: up
            ? AppColors.win.withValues(alpha: 0.08)
            : SquadStyle.soft(colors),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: up
              ? AppColors.win.withValues(alpha: 0.22)
              : Colors.transparent,
        ),
      ),
      child: Row(
        children: [
          Icon(
            up ? Icons.arrow_upward_rounded : Icons.arrow_downward_rounded,
            size: 17,
            color: tone,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: AppTypography.bodyM.copyWith(
                fontSize: 13,
                color: colors.onSurface,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Podium extends StatelessWidget {
  const _Podium({
    required this.first,
    required this.second,
    required this.third,
  });

  final SquadRankingEntry first;
  final SquadRankingEntry second;
  final SquadRankingEntry third;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        // Colunas 1 : 1,15 : 1, como no desenho.
        Expanded(
          flex: 100,
          child: _PodiumSpot(entry: second, height: 82, avatar: 50),
        ),
        const SizedBox(width: 8),
        Expanded(
          flex: 115,
          child: _PodiumSpot(entry: first, height: 108, avatar: 62, gold: true),
        ),
        const SizedBox(width: 8),
        Expanded(
          flex: 100,
          child: _PodiumSpot(entry: third, height: 66, avatar: 50),
        ),
      ],
    );
  }
}

class _PodiumSpot extends StatelessWidget {
  const _PodiumSpot({
    required this.entry,
    required this.height,
    required this.avatar,
    this.gold = false,
  });

  final SquadRankingEntry entry;
  final double height;
  final double avatar;
  final bool gold;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final fg = gold ? SquadStyle.onBrand : colors.onSurface;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        SquadAvatar(
          name: entry.name,
          photoUrl: entry.photoUrl,
          size: avatar,
          hue: squadHueFor(entry.name),
          ring: entry.me,
        ),
        const SizedBox(height: 8),
        Text(
          entry.me ? 'Você' : squadFirstName(entry.name),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          textAlign: TextAlign.center,
          style: SquadStyle.display(
            13,
            color: colors.onSurface,
            weight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 8),
        Container(
          height: height,
          width: double.infinity,
          padding: const EdgeInsets.only(top: 10),
          decoration: BoxDecoration(
            color: gold ? AppColors.brand : colors.surfaceRaised,
            borderRadius: const BorderRadius.vertical(
              top: Radius.circular(16),
              bottom: Radius.circular(6),
            ),
          ),
          child: Column(
            children: [
              Text(
                '${entry.position}',
                style: SquadStyle.display(24, color: fg),
              ),
              Text(
                squadThousands(entry.points),
                style: SquadStyle.mono(11, color: fg.withValues(alpha: 0.8)),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _RankRow extends StatelessWidget {
  const _RankRow({required this.entry, required this.divider});

  final SquadRankingEntry entry;
  final bool divider;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final d = entry.delta;
    final deltaColor = d == null
        ? AppColors.brand
        : d > 0
        ? colors.win
        : d < 0
        ? colors.live
        : SquadStyle.dim(colors);
    return Container(
      height: 56,
      decoration: BoxDecoration(
        color: entry.me ? SquadStyle.tint() : null,
        borderRadius: entry.me ? BorderRadius.circular(12) : null,
        border: divider && !entry.me
            ? Border(top: BorderSide(color: SquadStyle.line(colors)))
            : null,
      ),
      padding: EdgeInsets.symmetric(horizontal: entry.me ? 8 : 0),
      child: Row(
        children: [
          SizedBox(
            width: 26,
            child: Text(
              '${entry.position}',
              style: SquadStyle.mono(13, color: SquadStyle.dim(colors)),
            ),
          ),
          SquadAvatar(
            name: entry.name,
            photoUrl: entry.photoUrl,
            size: 36,
            hue: squadHueFor(entry.name),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              entry.me ? '${entry.name} (você)' : entry.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: SquadStyle.display(
                14,
                color: colors.onSurface,
                weight: FontWeight.w600,
              ),
            ),
          ),
          SizedBox(
            width: 34,
            child: Text(
              squadDeltaLabel(d),
              style: SquadStyle.mono(
                11,
                color: deltaColor,
                weight: FontWeight.w500,
              ),
            ),
          ),
          Text(
            squadThousands(entry.points),
            style: SquadStyle.mono(13, color: colors.onSurface),
          ),
        ],
      ),
    );
  }
}

class _Levels extends StatelessWidget {
  const _Levels({required this.levels, required this.current});

  final List<SquadLevel> levels;
  final String current;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Row(
      children: [
        for (var i = 0; i < levels.length; i++) ...[
          if (i > 0) const SizedBox(width: 6),
          Expanded(
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 6),
              decoration: BoxDecoration(
                color: levels[i].name == current
                    ? SquadStyle.tint()
                    : SquadStyle.soft(colors),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: levels[i].name == current
                      ? AppColors.brand.withValues(alpha: 0.35)
                      : Colors.transparent,
                ),
              ),
              child: Column(
                children: [
                  Text(
                    levels[i].name,
                    style: SquadStyle.display(
                      12.5,
                      color: colors.onSurface,
                      weight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '${squadThousands(levels[i].min)}+',
                    style: SquadStyle.mono(
                      9.5,
                      color: SquadStyle.dim(colors),
                      weight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ],
    );
  }
}
