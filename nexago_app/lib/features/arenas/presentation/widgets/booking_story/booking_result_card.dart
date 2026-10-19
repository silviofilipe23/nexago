import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../../../../../core/deep_link/app_domains.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../domain/booking_result.dart';
import '../../../domain/booking_story.dart';
import 'booking_story_card.dart';

/// O que a arte do pós-jogo escreve além do placar.
@immutable
class BookingResultArtData {
  const BookingResultArtData({
    required this.headline,
    required this.duration,
    required this.dateLabel,
    required this.placeLabel,
  });

  /// "Jogaço\nna areia."
  final String headline;

  /// `1h30`; vazio esconde a coluna "Em quadra".
  final String duration;

  /// `SEX · 22 MAI`.
  final String dateLabel;

  /// `Arena CFC · Quadra 1`.
  final String placeLabel;
}

/// Arte 9:16 do pós-jogo (protótipo "Reservar · 6"), mesma moldura do story
/// da reserva: dois times mostram os sets; três ou mais, a classificação.
class BookingResultCard extends StatelessWidget {
  const BookingResultCard({
    super.key,
    required this.result,
    required this.art,
    required this.theme,
    required this.infos,
    this.photo,
  });

  final BookingResult result;
  final BookingResultArtData art;
  final BookingStoryTheme theme;
  final Set<BookingResultInfo> infos;
  final Uint8List? photo;

  /// Rotação com muitos times: a arte para nos quatro primeiros.
  static const int maxStandingRows = 4;

  /// Mais do que isso de sets não cabe ao lado do nome.
  static const int maxSetColumns = 5;

  @override
  Widget build(BuildContext context) {
    final light = theme.isLight;
    final ink = BookingStoryArtFrame.inkOf(theme);
    final sub = BookingStoryArtFrame.subOf(theme);
    final accent = light ? BookingStoryCard.lightInk : AppColors.brand;
    final line =
        light ? const Color(0x2E140A03) : Colors.white.withValues(alpha: 0.16);
    final showDuration =
        infos.contains(BookingResultInfo.duration) && art.duration.isNotEmpty;
    final showPlace = infos.contains(BookingResultInfo.arenaDate);

    final blocks = <Widget>[
      Text(
        art.headline,
        style: AppTypography.soraRegular(
          fontSize: 46,
          fontWeight: FontWeight.w800,
          letterSpacing: -1.84,
          height: 0.95,
          color: ink,
        ),
      ),
      if (infos.contains(BookingResultInfo.score))
        _ScoreRows(
          result: result,
          showSets:
              infos.contains(BookingResultInfo.sets) && !result.isRotation,
          light: light,
          ink: ink,
          sub: sub,
          accent: accent,
        ),
      if (showDuration || showPlace)
        Container(
          padding: const EdgeInsets.only(top: 12),
          decoration: BoxDecoration(
            border: Border(top: BorderSide(color: line)),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (showDuration) ...[
                _Meta(
                  label: 'EM QUADRA',
                  value: art.duration,
                  valueStyle: AppTypography.mono(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: ink,
                  ),
                  sub: sub,
                ),
                const SizedBox(width: 18),
              ],
              if (showPlace)
                Expanded(
                  child: _Meta(
                    label: art.dateLabel,
                    value: art.placeLabel,
                    valueStyle: AppTypography.soraRegular(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: ink,
                    ),
                    sub: sub,
                  ),
                ),
            ],
          ),
        ),
    ];

    return BookingStoryArtFrame(
      theme: theme,
      photo: photo,
      deepScrim: true,
      pillLabel: 'FIM DE JOGO',
      pillColor: light ? BookingStoryCard.lightInk : AppColors.brand,
      pillTextColor: light ? const Color(0xFFE9D3B0) : const Color(0xFF0A0A0A),
      footerLabel: 'PLACAR VIA ${AppDomains.siteHost.toUpperCase()}',
      blocksBottom: 120,
      blocks: blocks,
    );
  }
}

class _ScoreRows extends StatelessWidget {
  const _ScoreRows({
    required this.result,
    required this.showSets,
    required this.light,
    required this.ink,
    required this.sub,
    required this.accent,
  });

  final BookingResult result;
  final bool showSets;
  final bool light;
  final Color ink;
  final Color sub;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    final leader = result.leaderId;
    // Dois times ficam na ordem da lista (quem posta em cima); a rotação
    // mostra a classificação.
    final rows = result.isRotation
        ? [
            for (final s in result.standings.take(
              BookingResultCard.maxStandingRows,
            ))
              (team: s.team, total: s.wins),
          ]
        : [
            for (final t in result.teams) (team: t, total: result.winsOf(t.id)),
          ];
    final games = result.games.take(BookingResultCard.maxSetColumns).toList();

    return Column(
      children: [
        for (var i = 0; i < rows.length; i++) ...[
          if (i > 0) const SizedBox(height: 8),
          Row(
            children: [
              ResultTeamAvatars(
                players: rows[i].team.players,
                size: 26,
                borderColor:
                    light ? const Color(0xFFD8B686) : const Color(0xFF0B0B0C),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  rows[i].team.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.soraRegular(
                    fontSize: 14,
                    fontWeight: rows[i].team.id == leader
                        ? FontWeight.w700
                        : FontWeight.w500,
                    color: rows[i].team.id == leader ? ink : sub,
                  ),
                ),
              ),
              if (showSets)
                for (final g in games)
                  SizedBox(
                    width: 24,
                    child: Text(
                      '${g.scoreOf(rows[i].team.id)}',
                      textAlign: TextAlign.right,
                      style: AppTypography.mono(
                        fontSize: 13,
                        fontWeight: g.winner == rows[i].team.id
                            ? FontWeight.w800
                            : FontWeight.w500,
                        color: g.winner == rows[i].team.id ? ink : sub,
                      ),
                    ),
                  ),
              SizedBox(
                width: 30,
                child: Text(
                  '${rows[i].total}',
                  textAlign: TextAlign.right,
                  style: AppTypography.mono(
                    fontSize: 26,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.52,
                    height: 1,
                    color: rows[i].team.id == leader ? accent : sub,
                  ),
                ),
              ),
            ],
          ),
        ],
      ],
    );
  }
}

/// Mesmo matiz para o mesmo jogador na arte, no placar e no montar time.
double resultPlayerHue(String id) {
  const hues = BookingStoryAvatar.hues;
  return hues[id.hashCode.abs() % hues.length];
}

/// Até três rostos sobrepostos; time ainda sem ninguém vira um "?".
class ResultTeamAvatars extends StatelessWidget {
  const ResultTeamAvatars({
    super.key,
    required this.players,
    required this.size,
    required this.borderColor,
  });

  final List<ResultPlayer> players;
  final double size;
  final Color borderColor;

  @override
  Widget build(BuildContext context) {
    final people = players.isEmpty
        ? [const ResultPlayer(id: 'guest:?', name: '?')]
        : players.take(3).toList();
    final step = size * 0.7;
    return SizedBox(
      width: size + step * (people.length - 1),
      height: size,
      child: Stack(
        children: [
          for (var i = 0; i < people.length; i++)
            Positioned(
              left: step * i,
              child: BookingStoryAvatar(
                person: people[i].toStoryPerson(),
                hue: resultPlayerHue(people[i].id),
                borderColor: borderColor,
                size: size,
              ),
            ),
        ],
      ),
    );
  }
}

class _Meta extends StatelessWidget {
  const _Meta({
    required this.label,
    required this.value,
    required this.valueStyle,
    required this.sub,
  });

  final String label;
  final String value;
  final TextStyle valueStyle;
  final Color sub;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: AppTypography.mono(
            fontSize: 9,
            letterSpacing: 1.26,
            color: sub,
          ),
        ),
        const SizedBox(height: 3),
        Text(
          value,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: valueStyle,
        ),
      ],
    );
  }
}
