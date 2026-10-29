import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_text_scaler.dart';

void main() {
  group('AppTextScaler', () {
    const scaler = AppTextScaler(TextScaler.noScaling);

    test('texto acima do piso fica em 90%', () {
      expect(scaler.scale(16), closeTo(14.4, 0.001));
      expect(scaler.scale(22), closeTo(19.8, 0.001));
      expect(scaler.scale(14), closeTo(12.6, 0.001));
    });

    test('nunca desce de 11px; o que já está no piso ou abaixo não muda', () {
      expect(scaler.scale(12), 11);
      expect(scaler.scale(11), 11);
      expect(scaler.scale(10), 10);
    });

    test('compõe com a fonte maior escolhida no celular', () {
      const big = AppTextScaler(TextScaler.linear(1.3));

      expect(big.scale(16), closeTo(14.4 * 1.3, 0.001));
      expect(big.scale(16), greaterThan(16));
    });
  });

  group('AppTextScale', () {
    Future<double> renderedSize(
      WidgetTester tester, {
      required double fontSize,
      TextScaler system = TextScaler.noScaling,
      bool twice = false,
    }) async {
      Widget child = Text('Agenda', style: TextStyle(fontSize: fontSize));
      child = AppTextScale(child: child);
      if (twice) child = AppTextScale(child: child);
      await tester.pumpWidget(
        MediaQuery(
          data: MediaQueryData(textScaler: system),
          child: Directionality(
            textDirection: TextDirection.ltr,
            child: Center(child: child),
          ),
        ),
      );
      // No flutter_test cada letra é um quadrado do tamanho da fonte: a
      // altura da linha mostra o tamanho efetivo.
      return tester.getSize(find.text('Agenda')).height;
    }

    testWidgets('reduz o texto que fica abaixo dele', (tester) async {
      final normal = await renderedSize(tester, fontSize: 20);
      await tester.pumpWidget(const SizedBox());
      expect(normal, closeTo(18, 0.5));
    });

    testWidgets('não reduz duas vezes quando aparece aninhado', (tester) async {
      final size = await renderedSize(tester, fontSize: 20, twice: true);
      expect(size, closeTo(18, 0.5));
    });

    testWidgets('respeita a fonte maior do sistema', (tester) async {
      final size = await renderedSize(
        tester,
        fontSize: 20,
        system: const TextScaler.linear(1.5),
      );
      expect(size, closeTo(27, 0.5));
    });
  });
}
