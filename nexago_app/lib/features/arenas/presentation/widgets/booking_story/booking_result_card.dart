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
    this.arenaLogo,
  });

  /// "Jogaço\nna areia."
  final String headline;

  /// `1h30`; vazio esconde a coluna "Em quadra".
  final String duration;

  /// `SEX · 22 MAI`.
  final String dateLabel;

  /// `Arena CFC · Quadra 1`.
  final String placeLabel;

  /// Logo da arena já baixado: entra redondo antes do [placeLabel].
  final Uint8List? arenaLogo;
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
    final showScore = infos.contains(BookingResultInfo.score);
    // Placar de cada jogo: em colunas ao lado dos nomes (dois times, até 5
    // sets) ou numa grade abaixo (rei da quadra, ou sets demais).
    final showGames = infos.contains(BookingResultInfo.sets) &&
        result.games.any((g) => g.scoreA > 0 || g.scoreB > 0);
    final gamesInGrid = showGames && bookingResultGamesInGrid(result);

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
      if (showScore)
        _ScoreRows(
          result: result,
          showSets: showGames && !gamesInGrid,
          light: light,
          ink: ink,
          sub: sub,
          accent: accent,
        ),
      if (gamesInGrid)
        _GamesGrid(
          result: result,
          maxGames: bookingResultGridMax(result, withStandings: showScore),
          light: light,
          ink: ink,
          sub: sub,
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
                    leading: art.arenaLogo == null
                        ? null
                        : Container(
                            key: const Key('booking-result-arena-logo'),
                            width: 22,
                            height: 22,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: Colors.white,
                              border: Border.all(color: line, width: 1.5),
                            ),
                            clipBehavior: Clip.antiAlias,
                            child: Image.memory(
                              art.arenaLogo!,
                              fit: BoxFit.cover,
                              gaplessPlayback: true,
                              errorBuilder: (_, __, ___) =>
                                  const SizedBox.shrink(),
                            ),
                          ),
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

/// Os placares vão para a grade abaixo dos times (e não em colunas ao lado
/// dos nomes): rei da quadra, ou mais sets do que cabem.
bool bookingResultGamesInGrid(BookingResult result) =>
    result.isRotation || result.games.length > BookingResultCard.maxSetColumns;

/// Quantos jogos a grade mostra; o resto vira "+N no app". Rei da quadra: 2
/// por linha, 3 linhas (2 com 4 times na classificação, para caber). Sets:
/// 4 por linha, 2 linhas.
int bookingResultGridMax(BookingResult result, {required bool withStandings}) {
  if (!result.isRotation) return 8;
  final standingRows = withStandings
      ? result.teams.length.clamp(0, BookingResultCard.maxStandingRows)
      : 0;
  return standingRows >= BookingResultCard.maxStandingRows ? 4 : 6;
}

/// Canvas "Pelada · placares dos jogos no card" (14 e 15): cada jogo do rei
/// da quadra com os rostos dos dois times e o placar, ou cada set em "S1
/// 21–18" (placar do time de cima primeiro). Vencedor em destaque.
class _GamesGrid extends StatelessWidget {
  const _GamesGrid({
    required this.result,
    required this.maxGames,
    required this.light,
    required this.ink,
    required this.sub,
  });

  final BookingResult result;
  final int maxGames;
  final bool light;
  final Color ink;
  final Color sub;

  @override
  Widget build(BuildContext context) {
    final rotation = result.isRotation;
    final games = [
      for (final g in result.games)
        if (g.scoreA > 0 || g.scoreB > 0) g,
    ];
    final shown = games.take(maxGames).toList();
    final hidden = games.length - shown.length;
    final columns = rotation ? 2 : 4;
    const gap = 6.0;
    final unit = rotation ? 'jogo' : 'set';
    final chipFill =
        light ? const Color(0x14140A03) : Colors.white.withValues(alpha: 0.07);
    final chipLine =
        light ? const Color(0x24140A03) : Colors.white.withValues(alpha: 0.10);
    final avatarBorder =
        light ? const Color(0xFFD8B686) : const Color(0xFF141417);
    final firstTeam = result.teams.first.id;

    Widget score(int a, int b, {required bool aWon}) => Text.rich(
          TextSpan(
            children: [
              TextSpan(
                text: '$a',
                style: TextStyle(
                  fontWeight: aWon ? FontWeight.w800 : FontWeight.w500,
                  color: aWon ? ink : sub,
                ),
              ),
              TextSpan(text: '–', style: TextStyle(color: sub)),
              TextSpan(
                text: '$b',
                style: TextStyle(
                  fontWeight: aWon ? FontWeight.w500 : FontWeight.w800,
                  color: aWon ? sub : ink,
                ),
              ),
            ],
          ),
          style: AppTypography.mono(fontSize: 12, fontWeight: FontWeight.w500),
        );

    Widget tag(String text) => Padding(
          padding: const EdgeInsets.only(right: 4),
          child: Text(
            text,
            style: AppTypography.mono(
              fontSize: 8.5,
              fontWeight: FontWeight.w500,
              color: sub,
            ),
          ),
        );

    Widget chip(int index, ResultGame g) {
      final List<Widget> content;
      if (rotation) {
        final aWon = g.winner == g.teamA;
        Widget faces(int teamId, bool lost) => Opacity(
              opacity: lost ? 0.55 : 1,
              child: ResultTeamAvatars(
                players: result.teamById(teamId)?.players ?? const [],
                size: 14,
                borderColor: avatarBorder,
              ),
            );
        content = [
          tag('J${index + 1}'),
          faces(g.teamA, !aWon),
          const SizedBox(width: 6),
          score(g.scoreA, g.scoreB, aWon: aWon),
          const SizedBox(width: 6),
          faces(g.teamB, aWon),
        ];
      } else {
        final top = g.teamA == firstTeam;
        final a = top ? g.scoreA : g.scoreB;
        final b = top ? g.scoreB : g.scoreA;
        content = [tag('S${index + 1}'), score(a, b, aWon: a > b)];
      }
      return Container(
        height: 26,
        padding: const EdgeInsets.symmetric(horizontal: 6),
        decoration: BoxDecoration(
          color: chipFill,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: chipLine),
        ),
        alignment: Alignment.center,
        child: FittedBox(
          fit: BoxFit.scaleDown,
          child: Row(mainAxisSize: MainAxisSize.min, children: content),
        ),
      );
    }

    final label = AppTypography.mono(
      fontSize: 8.5,
      fontWeight: FontWeight.w500,
      letterSpacing: 1.3,
      color: sub,
    );
    return Column(
      key: const Key('booking-result-games-grid'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '${rotation ? 'JOGOS' : 'SETS'} · ${games.length}',
          style: label,
        ),
        const SizedBox(height: 6),
        LayoutBuilder(
          builder: (context, constraints) {
            final width =
                (constraints.maxWidth - gap * (columns - 1)) / columns;
            return Wrap(
              spacing: gap,
              runSpacing: gap,
              children: [
                for (final (i, g) in shown.indexed)
                  SizedBox(width: width, child: chip(i, g)),
              ],
            );
          },
        ),
        if (hidden > 0) ...[
          const SizedBox(height: 5),
          Text(
            '+$hidden ${hidden == 1 ? unit : '${unit}s'} no app',
            style: label.copyWith(letterSpacing: 0.4),
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
    this.leading,
  });

  /// Antes do valor, na mesma linha (o logo da arena).
  final Widget? leading;

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
        // Sem logo fica só o texto: a coluna "Em quadra" não tem largura
        // limitada, e um Flexible ali quebraria o layout.
        if (leading == null)
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: valueStyle,
          )
        else
          Row(
            children: [
              leading!,
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  value,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: valueStyle,
                ),
              ),
            ],
          ),
      ],
    );
  }
}
