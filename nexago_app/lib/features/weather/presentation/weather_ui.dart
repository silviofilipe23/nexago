import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../core/formatting/app_currency_format.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';

/// Azul de chuva do design (`WX_BLUE`). Fundo e borda usam o tom cru; texto
/// no tema claro usa [rainText], que passa de 4,5:1 no branco.
abstract final class WeatherTone {
  static const Color rain = Color(0xFF5AA9FF);
  static const Color _rainTextLight = Color(0xFF1C64B5);

  static Color rainText(BuildContext context) =>
      context.themeColors.isDark ? rain : _rainTextLight;
}

/// Textos e formatos do cancelamento por chuva.
abstract final class WeatherCopy {
  static final _hm = DateFormat('HH:mm', 'pt_BR');
  static final _weekday = DateFormat('EEE', 'pt_BR');
  static final _dayMonth = DateFormat("d 'de' MMMM", 'pt_BR');
  static final _shortMonth = DateFormat('MMM', 'pt_BR');

  static String money(num reais) => formatBRL(reais);

  /// "hoje às 18:00", "amanhã às 09:00" ou "sex, 31 out às 18:00".
  static String deadline(DateTime at, DateTime now) {
    final day = DateTime(at.year, at.month, at.day);
    final today = DateTime(now.year, now.month, now.day);
    final diff = day.difference(today).inDays;
    final time = _hm.format(at);
    if (diff == 0) return 'hoje às $time';
    if (diff == 1) return 'amanhã às $time';
    return '${weekdayShort(at)}, ${dayShortMonth(at)} às $time';
  }

  /// "qua" (sem ponto, minúsculo).
  static String weekdayShort(DateTime d) =>
      _weekday.format(d).replaceAll('.', '').toLowerCase();

  /// "31 out" (sem ponto).
  static String dayShortMonth(DateTime d) =>
      '${d.day} ${_shortMonth.format(d).replaceAll('.', '').toLowerCase()}';

  /// "27 jan 2027".
  static String fullDate(DateTime d) => '${dayShortMonth(d)} ${d.year}';

  /// "28 nov" no ano corrente; "27 jan 2027" em outro ano.
  static String shortDate(DateTime d, DateTime now) =>
      d.year == now.year ? dayShortMonth(d) : fullDate(d);

  /// "29 de outubro".
  static String dayLongMonth(DateTime d) => _dayMonth.format(d);

  /// "Qua · 29 de outubro".
  static String ticketDate(DateTime d) {
    final w = weekdayShort(d);
    final cap = w.isEmpty ? w : w[0].toUpperCase() + w.substring(1);
    return '$cap · ${dayLongMonth(d)}';
  }

  static String time(DateTime d) => _hm.format(d);

  /// "Vale até 27 jan 2027" ou "Sem validade".
  static String validity(DateTime? expiresAt) =>
      expiresAt == null ? 'Sem validade' : 'Vale até ${fullDate(expiresAt)}';

  /// "85%" / "5,4 mm".
  static String percent(num value) => '${value.round()}%';

  static String millimeters(num value) =>
      '${NumberFormat('#,##0.#', 'pt_BR').format(value)} mm';
}

/// Rótulo em mono e caixa alta (`AwxMono` do design).
class WeatherKicker extends StatelessWidget {
  const WeatherKicker(this.text, {super.key, this.color, this.size = 10.5});

  final String text;
  final Color? color;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Text(
      text.toUpperCase(),
      style: AppTypography.mono(
        fontSize: size,
        fontWeight: FontWeight.w700,
        letterSpacing: 1.2,
        color: color ?? context.themeColors.onSurfaceMuted,
      ),
    );
  }
}

/// Ícone de chuva do design (nuvem + três gotas), desenhado em traço.
class WeatherRainIcon extends StatelessWidget {
  const WeatherRainIcon(
      {super.key, this.size = 18, this.color, this.strokeWidth = 1.8});

  final double size;
  final Color? color;
  final double strokeWidth;

  @override
  Widget build(BuildContext context) {
    return SizedBox.square(
      dimension: size,
      child: CustomPaint(
        painter: _RainIconPainter(
          color: color ??
              IconTheme.of(context).color ??
              context.themeColors.onSurface,
          strokeWidth: strokeWidth,
        ),
      ),
    );
  }
}

class _RainIconPainter extends CustomPainter {
  const _RainIconPainter({required this.color, required this.strokeWidth});

  final Color color;
  final double strokeWidth;

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width / 24;
    canvas.scale(s);
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    final cloud = Path()
      ..moveTo(7, 15.5)
      ..arcToPoint(
        const Offset(8.1, 6.6),
        radius: const Radius.circular(4.5),
        largeArc: true,
      )
      ..arcToPoint(const Offset(18.5, 8), radius: const Radius.circular(5.5))
      ..arcToPoint(const Offset(18, 15.5), radius: const Radius.circular(3.8))
      ..close();
    canvas.drawPath(cloud, paint);
    for (final x in const [8.0, 12.0, 16.0]) {
      canvas.drawLine(Offset(x, 18.5), Offset(x - 1, 21), paint);
    }
  }

  @override
  bool shouldRepaint(_RainIconPainter old) =>
      old.color != color || old.strokeWidth != strokeWidth;
}

/// Quadrado arredondado com ícone (avatar das opções e avisos).
class WeatherIconTile extends StatelessWidget {
  const WeatherIconTile({
    super.key,
    required this.child,
    required this.background,
    this.size = 44,
    this.radius = 12,
  });

  final Widget child;
  final Color background;
  final double size;
  final double radius;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(radius),
      ),
      alignment: Alignment.center,
      child: child,
    );
  }
}
