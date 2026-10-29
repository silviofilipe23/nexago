import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../domain/booking_result.dart';
import '../../../domain/booking_result_record.dart';
import '../../../domain/pelada.dart';
import '../booking_story/booking_result_card.dart';
import '../booking_story/booking_story_card.dart';

/// Peças das telas de Peladas (10b, 10c, 00d) — tokens da spec §9.
abstract final class PeladaStyle {
  PeladaStyle._();

  static Color line(AppThemeColors c) => c.onSurface.withValues(alpha: 0.06);

  /// No claro, 55% dava ~3,8:1 sobre o creme/branco; 72% fica ≥ 5,9:1 até
  /// na folha (#E8E4DE) e no gradiente laranja do topo. Escuro inalterado.
  static Color dim(AppThemeColors c) =>
      c.onSurface.withValues(alpha: c.isDark ? 0.55 : 0.72);

  /// Também é texto (saldo, posição, J1, S1, set perdido), não só
  /// separador: no claro, 40% dava ~2,5:1; 64% fica ≥ 4,8:1 no creme e nos
  /// cards. Escuro inalterado.
  static Color mute(AppThemeColors c) =>
      c.onSurface.withValues(alpha: c.isDark ? 0.40 : 0.64);

  // Tons de estado: os do tema ([AppThemeColors.win] e cia.), escurecidos no
  // claro. Ficam ≥ 5:1 até no gradiente laranja do topo do detalhe, o fundo
  // mais claro onde aparecem.

  /// Vitória: `4V`, `saldo +N` e a faixa do jogo ganho.
  static Color win(AppThemeColors c) => c.win;

  /// Contestação e derrota: `saldo −N`, a faixa do jogo perdido e o aviso.
  static Color live(AppThemeColors c) => c.live;

  /// Pendente: borda amarela de 25% (spec 10b). No claro ela sumia no card
  /// branco (~1,1:1); lá vira o âmbar do selo, ≥ 3:1 no card e no creme.
  static Color pendingBorder(AppThemeColors c) =>
      c.isDark ? const Color(0x40F4C543) : c.pending;

  static Color toneColor(PeladaStatusTone tone, {bool isDark = true}) =>
      switch (tone) {
        PeladaStatusTone.confirmed =>
          isDark ? AppColors.win : AppColors.winLight,
        PeladaStatusTone.pending =>
          isDark ? AppColors.pending : AppColors.pendingLight,
        PeladaStatusTone.disputed =>
          isDark ? AppColors.live : AppColors.liveLight,
      };
}

/// `● CONFIRMADO` · `◐ AGUARDANDO 2` · `✕ CONTESTADO`.
class PeladaStatusTagView extends StatelessWidget {
  const PeladaStatusTagView({super.key, required this.saved});

  final SavedBookingResult saved;

  @override
  Widget build(BuildContext context) {
    final tag = peladaStatusTag(saved);
    return Text(
      tag.label,
      maxLines: 1,
      // Sem quebrar no espaço: quebrando, sobrava só o "●" na linha.
      softWrap: false,
      overflow: TextOverflow.ellipsis,
      style: AppTypography.mono(
        fontSize: 10,
        letterSpacing: 0.5,
        color: PeladaStyle.toneColor(
          tag.tone,
          isDark: context.themeColors.isDark,
        ),
      ),
    );
  }
}

/// `1º de 4` num quadrado; laranja no 1º.
class PeladaPositionBadge extends StatelessWidget {
  const PeladaPositionBadge({
    super.key,
    required this.position,
    required this.of,
    this.size = 36,
  });

  final int position;
  final int of;
  final double size;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final first = position == 1;
    final scale = size / 36;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: first
            ? AppColors.brand.withValues(alpha: 0.12)
            : colors.onSurface.withValues(alpha: 0.04),
        borderRadius: BorderRadius.circular(11 * scale),
        border: Border.all(
          color: first
              ? AppColors.brand.withValues(alpha: 0.40)
              : colors.onSurface.withValues(alpha: 0.10),
        ),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text.rich(
            TextSpan(
              children: [
                TextSpan(text: '$position'),
                TextSpan(
                  text: 'º',
                  style: TextStyle(fontSize: 9 * scale),
                ),
              ],
            ),
            style: AppTypography.soraRegular(
              fontSize: 14 * scale,
              fontWeight: FontWeight.w800,
              height: 1,
              color: first ? colors.brandText : colors.onSurface,
            ),
          ),
          SizedBox(height: 2 * scale),
          Text(
            'de $of',
            style: AppTypography.mono(
              fontSize: 7.5 * scale,
              fontWeight: FontWeight.w600,
              height: 1,
              color: PeladaStyle.dim(colors),
            ),
          ),
        ],
      ),
    );
  }
}

/// Rostos sobrepostos (32%) de quem jogou, até [max].
class PeladaFaces extends StatelessWidget {
  const PeladaFaces({
    super.key,
    required this.players,
    this.size = 20,
    this.max = 4,
  });

  final List<ResultPlayer> players;
  final double size;
  final int max;

  @override
  Widget build(BuildContext context) {
    final shown = players.take(max).toList();
    if (shown.isEmpty) return SizedBox(height: size);
    final step = size * 0.68;
    return SizedBox(
      width: size + step * (shown.length - 1),
      height: size,
      child: Stack(
        children: [
          for (var i = 0; i < shown.length; i++)
            Positioned(
              left: step * i,
              child: BookingStoryAvatar(
                person: shown[i].toStoryPerson(),
                hue: resultPlayerHue(shown[i].id),
                borderColor: context.themeColors.surfaceCard,
                size: size,
              ),
            ),
        ],
      ),
    );
  }
}

/// `5V · 2D` em cima, `saldo +18` embaixo.
class PeladaRecord extends StatelessWidget {
  const PeladaRecord({super.key, required this.mine, this.fontSize = 16});

  final PeladaMine mine;
  final double fontSize;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final style = AppTypography.mono(
      fontSize: fontSize,
      fontWeight: FontWeight.w700,
      height: 1,
      color: colors.onSurface,
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text.rich(
          TextSpan(
            children: [
              TextSpan(
                text: '${mine.wins}V',
                style: TextStyle(color: PeladaStyle.win(colors)),
              ),
              TextSpan(
                text: ' · ',
                style: TextStyle(color: PeladaStyle.mute(colors)),
              ),
              TextSpan(text: '${mine.losses}D'),
            ],
          ),
          style: style,
        ),
        const SizedBox(height: 4),
        Text(
          'saldo ${peladaBalanceLabel(mine.balance)}',
          style: AppTypography.mono(
            fontSize: 10,
            fontWeight: FontWeight.w500,
            color: PeladaStyle.mute(colors),
          ),
        ),
      ],
    );
  }
}

/// Uma pelada na lista de 10b (e, [compact], na aba do perfil público).
class PeladaSessionRow extends StatelessWidget {
  const PeladaSessionRow({
    super.key,
    required this.saved,
    required this.uid,
    required this.onTap,
    this.compact = false,
  });

  final SavedBookingResult saved;

  /// De quem é o histórico (o dono do perfil, não necessariamente quem vê).
  final String uid;
  final VoidCallback onTap;

  /// Sem rostos nem estado (perfil público).
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final mine = peladaMineOf(saved, uid);
    final day = peladaDayParts(saved);
    final pending = !saved.isConfirmed;
    final others = [
      for (final t in saved.result.teams)
        for (final p in t.players)
          if (p.id != uid) p,
    ];
    final place = [
      peladaTimeRange(saved),
      if (saved.courtName != null) saved.courtName!,
    ].join(' · ');

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: colors.surfaceCard,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: BorderSide(
            color: pending && !compact
                ? PeladaStyle.pendingBorder(colors)
                : PeladaStyle.line(colors),
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          key: Key('pelada-row-${saved.bookingId}'),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 10, 12),
            child: Row(
              children: [
                SizedBox(
                  width: 34,
                  child: Column(
                    children: [
                      Text(
                        day.weekday,
                        style: AppTypography.mono(
                          fontSize: 10,
                          letterSpacing: 0.9,
                          color: PeladaStyle.dim(colors),
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        day.day,
                        style: AppTypography.soraRegular(
                          fontSize: 20,
                          fontWeight: FontWeight.w800,
                          height: 1,
                          color: colors.onSurface,
                        ),
                      ),
                    ],
                  ),
                ),
                Container(
                  width: 1,
                  height: compact ? 34 : 48,
                  margin: const EdgeInsets.symmetric(horizontal: 10),
                  color: PeladaStyle.line(colors),
                ),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        saved.arenaName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.soraRegular(
                          fontSize: 13.5,
                          fontWeight: FontWeight.w700,
                          color: colors.onSurface,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        place,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.soraRegular(
                          fontSize: 11.5,
                          fontWeight: FontWeight.w500,
                          color: PeladaStyle.dim(colors),
                        ),
                      ),
                      if (!compact) ...[
                        const SizedBox(height: 6),
                        Row(
                          children: [
                            // Três rostos: com quatro, a etiqueta não cabia
                            // ao lado em 375 pt.
                            PeladaFaces(players: others, max: 3),
                            const SizedBox(width: 6),
                            Flexible(child: PeladaStatusTagView(saved: saved)),
                          ],
                        ),
                      ],
                    ],
                  ),
                ),
                if (mine != null) ...[
                  const SizedBox(width: 6),
                  PeladaRecord(mine: mine, fontSize: 15),
                  const SizedBox(width: 8),
                  PeladaPositionBadge(
                    position: mine.position,
                    of: mine.teamsCount,
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// O cartão do topo de 10b: horários, horas em quadra, jogos, vitórias,
/// vezes em 1º e a arena mais jogada.
class PeladasSummaryCard extends StatelessWidget {
  const PeladasSummaryCard({super.key, required this.summary});

  final PeladasSummary summary;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final top = summary.topArena;
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.18)),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            AppColors.brand.withValues(alpha: 0.10),
            AppColors.brand.withValues(alpha: 0.02),
          ],
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'PELADAS · ${summary.year}',
            style: AppTypography.mono(
              fontSize: 10,
              letterSpacing: 1.4,
              color: colors.brandText,
            ),
          ),
          const SizedBox(height: 6),
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text(
                '${summary.sessions}',
                key: const Key('peladas-summary-sessions'),
                style: AppTypography.soraRegular(
                  fontSize: 40,
                  fontWeight: FontWeight.w800,
                  height: 1,
                  letterSpacing: -1.2,
                  color: colors.onSurface,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  '${summary.sessions == 1 ? 'horário jogado' : 'horários jogados'}'
                  ' · ${peladaHoursLabel(summary.minutes)} em quadra',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.soraRegular(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    color: PeladaStyle.dim(colors),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: PeladaStatBox(value: '${summary.games}', label: 'Jogos'),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: PeladaStatBox(
                  value: '${(summary.winRate * 100).round()}%',
                  label: 'Vitórias',
                  accent: true,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: PeladaStatBox(
                  value: '${summary.firstPlaces}',
                  label: 'Vezes 1º',
                ),
              ),
            ],
          ),
          if (top != null) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                Icon(
                  Icons.place_rounded,
                  size: 14,
                  color: colors.brandText,
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: Text.rich(
                    TextSpan(
                      children: [
                        const TextSpan(text: 'Mais jogada: '),
                        TextSpan(
                          text: top.name,
                          style: TextStyle(
                            fontWeight: FontWeight.w700,
                            color: colors.onSurface,
                          ),
                        ),
                        TextSpan(text: ' · ${top.count}x'),
                      ],
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.soraRegular(
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                      color: PeladaStyle.dim(colors),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class PeladaStatBox extends StatelessWidget {
  const PeladaStatBox({
    super.key,
    required this.value,
    required this.label,
    this.accent = false,
  });

  final String value;
  final String label;
  final bool accent;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: PeladaStyle.line(colors)),
      ),
      child: Column(
        children: [
          Text(
            value,
            style: AppTypography.soraRegular(
              fontSize: 19,
              fontWeight: FontWeight.w800,
              height: 1.1,
              color: accent ? colors.brandText : colors.onSurface,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            label.toUpperCase(),
            style: AppTypography.mono(
              fontSize: 10,
              letterSpacing: 1,
              color: PeladaStyle.dim(colors),
            ),
          ),
        ],
      ),
    );
  }
}

/// Os chips de filtro de 10b: Todas · Pendentes · arenas.
class PeladaFilterChips extends StatelessWidget {
  const PeladaFilterChips({
    super.key,
    required this.filter,
    required this.total,
    required this.pendingCount,
    required this.arenas,
    required this.onChanged,
  });

  final PeladaFilter filter;
  final int total;

  /// 0 esconde o chip "Pendentes".
  final int pendingCount;
  final List<PeladaArenaCount> arenas;
  final ValueChanged<PeladaFilter> onChanged;

  @override
  Widget build(BuildContext context) {
    final chips = <(PeladaFilter, String, int)>[
      (const PeladaFilter.all(), 'Todas', total),
      if (pendingCount > 0)
        (const PeladaFilter.pending(), 'Pendentes', pendingCount),
      for (final a in arenas) (PeladaFilter.arena(a.name), a.name, a.count),
    ];
    // Poucos chips: Row rolável (o ListView preguiçoso não montava os de
    // fora da tela).
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (final (i, (f, label, count)) in chips.indexed) ...[
            if (i > 0) const SizedBox(width: 8),
            SizedBox(
              height: 34,
              child: _Chip(
                key: Key(
                  'pelada-filter-${f.pending ? 'pending' : f.arena == null ? 'all' : f.arena}',
                ),
                label: label,
                count: count,
                selected: f == filter,
                onTap: () => onChanged(f),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({
    super.key,
    required this.label,
    required this.count,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final int count;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final fg = selected ? colors.brandText : colors.onSurface;
    return Material(
      color: selected
          ? AppColors.brand.withValues(alpha: 0.12)
          : colors.surfaceCard,
      shape: StadiumBorder(
        side: BorderSide(
          color: selected
              ? AppColors.brand.withValues(alpha: 0.40)
              : colors.onSurface.withValues(alpha: 0.10),
        ),
      ),
      child: InkWell(
        customBorder: const StadiumBorder(),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                label,
                style: AppTypography.soraRegular(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w600,
                  color: fg,
                ),
              ),
              const SizedBox(width: 6),
              Text(
                '$count',
                style: AppTypography.mono(
                  fontSize: 10.5,
                  color: selected
                      ? colors.brandText
                          .withValues(alpha: colors.isDark ? 0.85 : 1)
                      : PeladaStyle.dim(colors),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
