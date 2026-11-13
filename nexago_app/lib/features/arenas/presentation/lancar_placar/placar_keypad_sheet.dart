import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';

/// Teclado do placar (canvas "Proposta · 4"): digitar 18 é um toque no
/// atalho ou dois no teclado — nunca 18 toques no "+". Devolve o número
/// (0–99) ou `null` se o atleta fechar.
Future<int?> showPlacarKeypad(
  BuildContext context, {
  required String title,
  required int initial,
  List<int> quick = const [],
  String? hint,
}) {
  return showModalBottomSheet<int>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: context.themeColors.surfaceSheet,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    builder: (_) => _PlacarKeypad(
      title: title,
      initial: initial,
      quick: quick,
      hint: hint,
    ),
  );
}

class _PlacarKeypad extends StatefulWidget {
  const _PlacarKeypad({
    required this.title,
    required this.initial,
    required this.quick,
    this.hint,
  });

  final String title;
  final int initial;
  final List<int> quick;
  final String? hint;

  @override
  State<_PlacarKeypad> createState() => _PlacarKeypadState();
}

class _PlacarKeypadState extends State<_PlacarKeypad> {
  /// Vazio até o primeiro dígito: o valor de antes aparece apagado e o
  /// primeiro toque o substitui (não emenda "0" com "7").
  String _typed = '';

  int get _value =>
      _typed.isEmpty ? widget.initial : int.parse(_typed).clamp(0, 99);

  void _digit(int d) {
    HapticFeedback.selectionClick();
    setState(() {
      final next = _typed == '0' ? '$d' : '$_typed$d';
      if (next.length <= 2) _typed = next;
    });
  }

  void _back() {
    HapticFeedback.selectionClick();
    setState(() {
      if (_typed.isNotEmpty) _typed = _typed.substring(0, _typed.length - 1);
    });
  }

  void _done([int? value]) => Navigator.of(context).pop(value ?? _value);

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final keyStyle = AppTypography.mono(
      fontSize: 22,
      fontWeight: FontWeight.w600,
      color: colors.onSurface,
    );

    Widget key(String label, VoidCallback onTap, {Key? k, String? semantics}) =>
        Semantics(
          button: true,
          label: semantics ?? label,
          child: Material(
            color: colors.onSurface.withValues(alpha: 0.08),
            borderRadius: BorderRadius.circular(12),
            child: InkWell(
              key: k,
              onTap: onTap,
              borderRadius: BorderRadius.circular(12),
              child: SizedBox(
                height: 54,
                child: Center(child: Text(label, style: keyStyle)),
              ),
            ),
          ),
        );

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: colors.onSurface.withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: Text(
                  widget.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.soraRegular(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: colors.onSurface,
                  ),
                ),
              ),
              if (widget.hint != null)
                Text(
                  widget.hint!.toUpperCase(),
                  style: AppTypography.mono(
                    fontSize: 10,
                    fontWeight: FontWeight.w500,
                    letterSpacing: 1.2,
                    color: colors.onSurface.withValues(alpha: 0.6),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 10),
          Center(
            child: Text(
              '$_value',
              key: const Key('placar-keypad-value'),
              style: AppTypography.mono(
                fontSize: 44,
                fontWeight: FontWeight.w800,
                color: _typed.isEmpty
                    ? colors.onSurface.withValues(alpha: 0.35)
                    : colors.onSurface,
              ),
            ),
          ),
          if (widget.quick.isNotEmpty) ...[
            const SizedBox(height: 10),
            Row(
              children: [
                for (final (i, v) in widget.quick.indexed) ...[
                  if (i > 0) const SizedBox(width: 8),
                  Expanded(
                    child: SizedBox(
                      height: 44,
                      child: OutlinedButton(
                        key: Key('placar-keypad-quick-$v'),
                        onPressed: () => _done(v),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: colors.brandText,
                          backgroundColor:
                              AppColors.brand.withValues(alpha: 0.08),
                          side: BorderSide(
                            color: AppColors.brand.withValues(alpha: 0.5),
                            width: 1.5,
                          ),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                          textStyle: AppTypography.mono(
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        child: Text('$v'),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ],
          const SizedBox(height: 12),
          GridView.count(
            crossAxisCount: 3,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 8,
            crossAxisSpacing: 8,
            childAspectRatio: 2.4,
            children: [
              for (var d = 1; d <= 9; d++)
                key('$d', () => _digit(d), k: Key('placar-keypad-$d')),
              key('⌫', _back,
                  k: const Key('placar-keypad-back'), semantics: 'Apagar'),
              key('0', () => _digit(0), k: const Key('placar-keypad-0')),
              Material(
                color: AppColors.brand,
                borderRadius: BorderRadius.circular(12),
                child: InkWell(
                  key: const Key('placar-keypad-ok'),
                  onTap: _done,
                  borderRadius: BorderRadius.circular(12),
                  child: Center(
                    child: Text(
                      'OK',
                      style: AppTypography.soraRegular(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                        color: const Color(0xFF0A0A0A),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
