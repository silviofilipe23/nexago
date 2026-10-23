import 'package:flutter/material.dart';

import '../../theme/app_colors.dart';
import '../../theme/app_theme_colors.dart';
import '../../theme/app_typography.dart';

/// Peças da agenda em Dia · Semana · Mês, compartilhadas pela Agenda do
/// Professor e pela do Centro de treinamento: navegação de período, tira de
/// dias, grade da semana (6h–22h) e calendário do mês. Quem usa traduz os
/// próprios itens em [NexaAgendaBlock] e passa o [keyPrefix] das chaves
/// (`professor-agenda`, `center-agenda`…).

const _weekdayShort = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const _weekdayLetter = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];

/// Texto/ícone sobre o laranja da marca.
const Color _onBrand = Color(0xFF0A0A0A);

Color _dim(AppThemeColors c) => c.onSurface.withValues(alpha: 0.40);
Color _soft(AppThemeColors c) => c.onSurface.withValues(alpha: 0.05);
Color _line(AppThemeColors c) => c.onSurface.withValues(alpha: 0.08);

TextStyle _display(double size, {Color? color, FontWeight? weight}) =>
    AppTypography.soraRegular(
      fontSize: size,
      fontWeight: weight ?? FontWeight.w800,
      letterSpacing: -size * 0.02,
      height: 1.2,
      color: color,
    );

TextStyle _mono(double size, {Color? color}) =>
    AppTypography.mono(fontSize: size, fontWeight: FontWeight.w700, color: color);

/// Um bloco na grade da Semana.
class NexaAgendaBlock {
  const NexaAgendaBlock({
    required this.id,
    required this.date,
    required this.startMin,
    required this.endMin,
    required this.color,
    required this.letter,
    required this.semanticLabel,
    this.faded = false,
    this.hatched = false,
  });

  final String id;

  /// `YYYY-MM-DD`.
  final String date;

  /// Minutos do dia (horário de parede).
  final int startMin;
  final int endMin;
  final Color color;

  /// Letra no meio do bloco (tipo da aula, inicial da turma…).
  final String letter;
  final String semanticLabel;

  /// Cancelada: esmaecida.
  final bool faded;

  /// Bloqueio: listrado, sem fundo.
  final bool hatched;
}

/// Listras diagonais (bloqueio na Semana e no Mês).
class NexaHatchPainter extends CustomPainter {
  const NexaHatchPainter({this.color = AppColors.live});

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color.withValues(alpha: 0.22)
      ..strokeWidth = 3;
    canvas.save();
    canvas.clipRect(Offset.zero & size);
    for (var x = -size.height; x < size.width; x += 8) {
      canvas.drawLine(
        Offset(x, size.height),
        Offset(x + size.height, 0),
        paint,
      );
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(NexaHatchPainter old) => old.color != color;
}

/// ‹ período › com "Hoje" quando o período não contém hoje.
class NexaAgendaPeriodNav extends StatelessWidget {
  const NexaAgendaPeriodNav({
    super.key,
    required this.keyPrefix,
    required this.label,
    required this.isCurrent,
    required this.onPrev,
    required this.onNext,
    required this.onToday,
  });

  final String keyPrefix;
  final String label;
  final bool isCurrent;
  final VoidCallback onPrev;
  final VoidCallback onNext;
  final VoidCallback onToday;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Row(
      children: [
        IconButton(
          key: Key('$keyPrefix-prev'),
          visualDensity: VisualDensity.compact,
          icon: const Icon(Icons.chevron_left_rounded),
          tooltip: 'Anterior',
          onPressed: onPrev,
        ),
        Expanded(
          child: Text(
            label,
            key: Key('$keyPrefix-period'),
            textAlign: TextAlign.center,
            style: _display(
              13.5,
              weight: FontWeight.w700,
              color: colors.onSurface,
            ),
          ),
        ),
        if (!isCurrent)
          TextButton(
            key: Key('$keyPrefix-today'),
            onPressed: onToday,
            child: const Text('Hoje'),
          ),
        IconButton(
          key: Key('$keyPrefix-next'),
          visualDensity: VisualDensity.compact,
          icon: const Icon(Icons.chevron_right_rounded),
          tooltip: 'Próximo',
          onPressed: onNext,
        ),
      ],
    );
  }
}

/// Tira da semana do Dia (segunda a domingo): letra, dia e quantas aulas.
class NexaAgendaDayStrip extends StatelessWidget {
  const NexaAgendaDayStrip({
    super.key,
    required this.keyPrefix,
    required this.days,
    required this.selected,
    required this.todayKey,
    required this.countOf,
    required this.onPick,
  });

  final String keyPrefix;

  /// Os 7 dias (`YYYY-MM-DD`), começando na segunda.
  final List<String> days;
  final String selected;
  final String todayKey;
  final int Function(String day) countOf;
  final ValueChanged<String> onPick;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        for (var i = 0; i < days.length; i++) ...[
          if (i > 0) const SizedBox(width: 6),
          Expanded(
            child: _DayTile(
              key: Key('$keyPrefix-day-${days[i]}'),
              letter: _weekdayLetter[i % 7],
              day: int.parse(days[i].substring(8)),
              count: countOf(days[i]),
              selected: days[i] == selected,
              today: days[i] == todayKey,
              onTap: () => onPick(days[i]),
            ),
          ),
        ],
      ],
    );
  }
}

class _DayTile extends StatelessWidget {
  const _DayTile({
    super.key,
    required this.letter,
    required this.day,
    required this.count,
    required this.selected,
    required this.today,
    required this.onTap,
  });

  final String letter;
  final int day;
  final int count;
  final bool selected;
  final bool today;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final fg = selected ? _onBrand : colors.onSurface;
    final dim = selected ? _onBrand : _dim(colors);
    return Material(
      color: selected ? AppColors.brand : _soft(colors),
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Container(
          height: 58,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: selected
                  ? Colors.transparent
                  : today
                  ? AppColors.brand.withValues(alpha: 0.5)
                  : _line(colors),
            ),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(letter, style: _mono(9, color: dim)),
              Text(
                '$day',
                style: _display(15, weight: FontWeight.w700, color: fg),
              ),
              Text(count == 0 ? '—' : '$count', style: _mono(8.5, color: dim)),
            ],
          ),
        ),
      ),
    );
  }
}

/// Grade da Semana: das 6h às 22h.
const int kNexaAgendaWeekStartHour = 6;
const int kNexaAgendaWeekEndHour = 22;
const double _hourHeight = 30;

/// Grade da Semana: um bloco por item no horário, linha do agora no dia de
/// hoje; tocar no cabeçalho do dia abre o Dia, tocar no bloco abre o item.
/// [footer] vem logo abaixo (legendas).
class NexaAgendaWeekGrid extends StatelessWidget {
  const NexaAgendaWeekGrid({
    super.key,
    required this.keyPrefix,
    required this.days,
    required this.todayKey,
    required this.nowMin,
    required this.blocks,
    required this.onPickDay,
    required this.onOpen,
    this.footer = const [],
  });

  final String keyPrefix;
  final List<String> days;
  final String todayKey;
  final int nowMin;
  final List<NexaAgendaBlock> blocks;
  final ValueChanged<String> onPickDay;
  final ValueChanged<String> onOpen;
  final List<Widget> footer;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    const startMin = kNexaAgendaWeekStartHour * 60;
    const endMin = kNexaAgendaWeekEndHour * 60;
    const height =
        (kNexaAgendaWeekEndHour - kNexaAgendaWeekStartHour) * _hourHeight;
    double y(int minutes) =>
        (minutes.clamp(startMin, endMin) - startMin) / 60 * _hourHeight;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            const SizedBox(width: 30),
            for (var i = 0; i < days.length; i++)
              Expanded(
                child: InkWell(
                  key: Key('$keyPrefix-week-head-${days[i]}'),
                  onTap: () => onPickDay(days[i]),
                  child: Column(
                    children: [
                      Text(
                        _weekdayShort[i % 7],
                        style: _mono(
                          9.5,
                          color: days[i] == todayKey
                              ? AppColors.brand
                              : _dim(colors),
                        ),
                      ),
                      Text(
                        '${int.parse(days[i].substring(8))}',
                        style: _display(
                          13,
                          weight: FontWeight.w700,
                          color: days[i] == todayKey
                              ? AppColors.brand
                              : colors.onSurface,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 6),
        SizedBox(
          height: height,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SizedBox(
                width: 30,
                child: Column(
                  children: [
                    for (
                      var h = kNexaAgendaWeekStartHour;
                      h < kNexaAgendaWeekEndHour;
                      h++
                    )
                      SizedBox(
                        height: _hourHeight,
                        child: Align(
                          alignment: Alignment.topLeft,
                          child: Text(
                            '${h}h',
                            style: _mono(8.5, color: _dim(colors)),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              for (final d in days)
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 1.5),
                    child: Container(
                      key: Key('$keyPrefix-week-col-$d'),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(8),
                        color: d == todayKey
                            ? AppColors.brand.withValues(alpha: 0.04)
                            : _soft(colors),
                      ),
                      child: Stack(
                        clipBehavior: Clip.hardEdge,
                        children: [
                          for (final b in blocks)
                            if (b.date == d &&
                                b.endMin > startMin &&
                                b.startMin < endMin)
                              Positioned(
                                left: 1,
                                right: 1,
                                top: y(b.startMin) + 1,
                                height: (y(b.endMin) - y(b.startMin) - 2).clamp(
                                  6,
                                  height,
                                ),
                                child: _WeekBlock(
                                  key: Key('$keyPrefix-block-${b.id}'),
                                  block: b,
                                  onTap: () => onOpen(b.id),
                                ),
                              ),
                          if (d == todayKey &&
                              nowMin >= startMin &&
                              nowMin <= endMin)
                            Positioned(
                              key: Key('$keyPrefix-now-line'),
                              left: 0,
                              right: 0,
                              top: y(nowMin),
                              height: 2,
                              child: IgnorePointer(
                                child: ColoredBox(
                                  color: AppColors.live.withValues(alpha: 0.7),
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
        for (final w in footer) ...[const SizedBox(height: 10), w],
      ],
    );
  }
}

class _WeekBlock extends StatelessWidget {
  const _WeekBlock({super.key, required this.block, required this.onTap});

  final NexaAgendaBlock block;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final b = block;
    return Semantics(
      button: true,
      label: b.semanticLabel,
      child: GestureDetector(
        onTap: onTap,
        child: Opacity(
          opacity: b.faded ? 0.4 : 1,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: CustomPaint(
              painter: b.hatched ? NexaHatchPainter(color: b.color) : null,
              child: Container(
                decoration: BoxDecoration(
                  color: b.hatched ? null : b.color.withValues(alpha: 0.19),
                  border: Border(left: BorderSide(color: b.color, width: 2)),
                ),
                alignment: Alignment.center,
                child: Text(b.letter, style: _mono(8.5, color: b.color)),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Calendário do Mês: bolinhas por item, hoje em laranja, dia bloqueado
/// listrado; tocar abre o Dia. [footer] vem logo abaixo (números, legenda).
class NexaAgendaMonthGrid extends StatelessWidget {
  const NexaAgendaMonthGrid({
    super.key,
    required this.keyPrefix,
    required this.days,
    required this.leading,
    required this.todayKey,
    required this.countOf,
    required this.onPickDay,
    this.isBlocked,
    this.footer = const [],
  });

  final String keyPrefix;

  /// Dias do mês (o índice 0 é o dia 1) e casas vazias antes (semana
  /// começando na segunda).
  final List<String> days;
  final int leading;
  final String todayKey;
  final int Function(String day) countOf;
  final bool Function(String day)? isBlocked;
  final ValueChanged<String> onPickDay;
  final List<Widget> footer;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    Widget cell(String d) {
      final n = countOf(d);
      final isToday = d == todayKey;
      final blocked = isBlocked?.call(d) ?? false;
      final past = d.compareTo(todayKey) < 0;
      return Opacity(
        opacity: past && !isToday ? 0.55 : 1,
        child: GestureDetector(
          key: Key('$keyPrefix-month-$d'),
          onTap: () => onPickDay(d),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(11),
            child: CustomPaint(
              painter: blocked && !isToday ? const NexaHatchPainter() : null,
              child: Container(
                height: 50,
                padding: const EdgeInsets.only(top: 6),
                decoration: BoxDecoration(
                  color: isToday
                      ? AppColors.brand
                      : blocked
                      ? null
                      : _soft(colors),
                  borderRadius: BorderRadius.circular(11),
                  border: Border.all(
                    color: isToday
                        ? Colors.transparent
                        : blocked
                        ? AppColors.live.withValues(alpha: 0.3)
                        : _line(colors),
                  ),
                ),
                child: Column(
                  children: [
                    Text(
                      '${int.parse(d.substring(8))}',
                      style: _display(
                        13,
                        weight: FontWeight.w700,
                        color: isToday ? _onBrand : colors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 5),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        for (var k = 0; k < (n > 4 ? 4 : n); k++)
                          Container(
                            width: 4,
                            height: 4,
                            margin: const EdgeInsets.symmetric(horizontal: 1),
                            decoration: BoxDecoration(
                              color: isToday ? _onBrand : AppColors.brand,
                              shape: BoxShape.circle,
                            ),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
    }

    final cells = <Widget>[
      for (var i = 0; i < leading; i++) const SizedBox.shrink(),
      for (final d in days) cell(d),
    ];
    final rows = <List<Widget>>[];
    for (var i = 0; i < cells.length; i += 7) {
      rows.add(cells.sublist(i, (i + 7).clamp(0, cells.length)));
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            for (final l in _weekdayLetter)
              Expanded(
                child: Center(
                  child: Text(l, style: _mono(9.5, color: _dim(colors))),
                ),
              ),
          ],
        ),
        const SizedBox(height: 6),
        for (final row in rows)
          Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Row(
              children: [
                for (var i = 0; i < 7; i++) ...[
                  if (i > 0) const SizedBox(width: 4),
                  Expanded(
                    child: i < row.length ? row[i] : const SizedBox.shrink(),
                  ),
                ],
              ],
            ),
          ),
        for (final w in footer) ...[const SizedBox(height: 10), w],
      ],
    );
  }
}

/// Um número do rodapé do Mês ("12 aulas").
typedef NexaAgendaStat = ({String value, String label, Key key, Color? color});

/// Linha de números do rodapé do Mês.
class NexaAgendaStats extends StatelessWidget {
  const NexaAgendaStats({super.key, required this.stats});

  final List<NexaAgendaStat> stats;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Row(
      children: [
        for (var i = 0; i < stats.length; i++) ...[
          if (i > 0) const SizedBox(width: 8),
          Expanded(
            child: Container(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
              decoration: BoxDecoration(
                color: _soft(colors),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: _line(colors)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    stats[i].value,
                    key: stats[i].key,
                    style: _display(
                      17,
                      color: stats[i].color ?? colors.onSurface,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    stats[i].label,
                    style: AppTypography.bodyS.copyWith(
                      fontSize: 10.5,
                      color: _dim(colors),
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
