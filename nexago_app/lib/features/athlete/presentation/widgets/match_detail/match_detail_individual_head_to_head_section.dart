import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:nexago_app/core/time/nexago_event_timezone.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../data/match_history/head_to_head_repository.dart';

const kMatchDetailIndividualHeadToHeadPastMatchLimit = 2;

/// Um adversário no card de confrontos diretos (H2H por atleta).
class IndividualHeadToHeadEntry {
  const IndividualHeadToHeadEntry({
    required this.opponentName,
    required this.record,
  });

  final String opponentName;
  final HeadToHeadRecord record;
}

/// "Confrontos diretos" — H2H por ATLETA (mesmo em jogos de dupla conta pelo
/// par de pessoas, não pelo par de duplas — ver `MatchDetailHeadToHeadSection`
/// para o H2H por dupla exata).
///
/// Dupla adversária: os dois atletas ficam no MESMO card, separados por linha.
class MatchDetailIndividualHeadToHeadSection extends StatelessWidget {
  const MatchDetailIndividualHeadToHeadSection({
    super.key,
    required this.entries,
  });

  final List<IndividualHeadToHeadEntry> entries;

  static const _radius = 14.0;

  @override
  Widget build(BuildContext context) {
    if (entries.isEmpty) return const SizedBox.shrink();

    final names = entries
        .map((e) => e.opponentName.trim())
        .where((n) => n.isNotEmpty)
        .toList();
    final semantics = names.isEmpty
        ? 'Confrontos diretos'
        : names.length == 1
        ? 'Confrontos diretos com ${names.first}'
        : 'Confrontos diretos com ${names.join(' e ')}';

    return Semantics(
      label: semantics,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(_radius),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.06),
              borderRadius: BorderRadius.circular(_radius),
              border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
            ),
            child: Column(
              children: [
                Text(
                  'CONFRONTOS DIRETOS',
                  textAlign: TextAlign.center,
                  style: AppTypography.soraRegular(
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                    letterSpacing: 0.5,
                  ),
                ),
                const SizedBox(height: 12),
                for (var i = 0; i < entries.length; i++) ...[
                  if (i > 0)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      child: Divider(
                        height: 1,
                        thickness: 1,
                        color: Colors.white.withValues(alpha: 0.12),
                      ),
                    ),
                  _OpponentBlock(entry: entries[i]),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _OpponentBlock extends StatelessWidget {
  const _OpponentBlock({required this.entry});

  final IndividualHeadToHeadEntry entry;

  @override
  Widget build(BuildContext context) {
    final record = entry.record;
    final total = record.totalMatches;
    final name = entry.opponentName.trim();

    return Column(
      children: [
        if (name.isNotEmpty)
          Text(
            'Você vs $name',
            textAlign: TextAlign.center,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AppTypography.soraRegular(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: Colors.white.withValues(alpha: 0.88),
            ),
          ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: _StatInline(
                value: '${record.wins}',
                label: 'V',
                color: AppColors.win,
              ),
            ),
            Text(
              '$total',
              style: AppTypography.eyebrow.copyWith(
                color: Colors.white.withValues(alpha: 0.45),
                fontSize: 10,
                letterSpacing: 0.4,
              ),
            ),
            Expanded(
              child: _StatInline(
                value: '${record.losses}',
                label: 'D',
                color: AppColors.live,
                alignEnd: true,
              ),
            ),
          ],
        ),
        if (record.recentMatches.isNotEmpty) ...[
          const SizedBox(height: 8),
          ...record.recentMatches
              .take(kMatchDetailIndividualHeadToHeadPastMatchLimit)
              .map(
                (m) => Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: _PastMatchRow(match: m),
                ),
              ),
        ],
      ],
    );
  }
}

class _StatInline extends StatelessWidget {
  const _StatInline({
    required this.value,
    required this.label,
    required this.color,
    this.alignEnd = false,
  });

  final String value;
  final String label;
  final Color color;
  final bool alignEnd;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: alignEnd
          ? MainAxisAlignment.end
          : MainAxisAlignment.start,
      children: [
        Text(
          value,
          style: AppTypography.monoStat.copyWith(
            color: color,
            fontSize: 22,
            fontWeight: FontWeight.w800,
            height: 1,
          ),
        ),
        const SizedBox(width: 4),
        Text(
          label,
          style: AppTypography.eyebrow.copyWith(
            color: color.withValues(alpha: 0.9),
            fontSize: 11,
            letterSpacing: 0.4,
          ),
        ),
      ],
    );
  }
}

class _PastMatchRow extends StatelessWidget {
  const _PastMatchRow({required this.match});

  final HeadToHeadRecentMatch match;

  @override
  Widget build(BuildContext context) {
    final accent = match.athleteAWon ? AppColors.win : AppColors.live;
    final letter = match.athleteAWon ? 'V' : 'D';
    final tournament = match.tournamentName?.trim().isNotEmpty == true
        ? match.tournamentName!.trim()
        : 'Torneio';
    final date = match.playedAt != null ? _dateLabel(match.playedAt!) : null;
    final subtitle = date == null ? tournament : '$tournament · $date';

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
      ),
      child: Row(
        children: [
          Container(
            width: 22,
            height: 22,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: accent,
              borderRadius: BorderRadius.circular(5),
            ),
            child: Text(
              letter,
              style: AppTypography.soraRegular(
                fontSize: 11,
                fontWeight: FontWeight.w900,
                color: AppColors.black,
              ),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              subtitle,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.soraRegular(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: context.themeColors.onSurface.withValues(alpha: 0.9),
              ),
            ),
          ),
          const SizedBox(width: 8),
          Text(
            match.scoreLabel,
            style: AppTypography.mono(
              fontSize: 13,
              fontWeight: FontWeight.w800,
              color: context.themeColors.onSurface,
            ),
          ),
        ],
      ),
    );
  }

  static String _dateLabel(DateTime playedAt) {
    return DateFormat(
      "d MMM yy",
      'pt_BR',
    ).format(toNexagoEventLocal(playedAt));
  }
}
