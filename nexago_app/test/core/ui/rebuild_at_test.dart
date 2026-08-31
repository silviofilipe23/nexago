import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/ui/rebuild_at.dart';

void main() {
  final opensAt = DateTime(2026, 9, 5, 10, 0);

  Widget gateLabel(BuildContext context, DateTime now) {
    return Text(
      now.isBefore(opensAt) ? 'EM BREVE' : 'ABERTO',
      textDirection: TextDirection.ltr,
    );
  }

  testWidgets('reconstrói o filho quando o relógio cruza o instante', (
    tester,
  ) async {
    var now = DateTime(2026, 9, 5, 9, 59);

    await tester.pumpWidget(
      RebuildAt(instant: opensAt, clock: () => now, builder: gateLabel),
    );

    expect(find.text('EM BREVE'), findsOneWidget);

    // Meio caminho: nada acontece — o disparo é único, no instante marcado.
    now = DateTime(2026, 9, 5, 9, 59, 30);
    await tester.pump(const Duration(seconds: 30));

    expect(find.text('EM BREVE'), findsOneWidget);
    expect(find.text('ABERTO'), findsNothing);

    // Chega a hora: reconstrói sozinho, sem ninguém de fora pedir.
    now = DateTime(2026, 9, 5, 10, 0, 1);
    await tester.pump(const Duration(seconds: 35));

    expect(find.text('ABERTO'), findsOneWidget);
    expect(find.text('EM BREVE'), findsNothing);
  });

  testWidgets('não agenda nada quando o instante é nulo', (tester) async {
    final now = DateTime(2026, 9, 5, 9, 59);

    await tester.pumpWidget(
      RebuildAt(instant: null, clock: () => now, builder: gateLabel),
    );

    expect(find.text('EM BREVE'), findsOneWidget);

    // Sem instante não há timer: um pump longo não muda nada e o teste
    // terminaria com timer pendente se algo tivesse sido agendado.
    await tester.pump(const Duration(days: 1));

    expect(find.text('EM BREVE'), findsOneWidget);
  });

  testWidgets('não agenda nada quando o instante já passou', (tester) async {
    final now = DateTime(2026, 9, 5, 10, 30);

    await tester.pumpWidget(
      RebuildAt(instant: opensAt, clock: () => now, builder: gateLabel),
    );

    expect(find.text('ABERTO'), findsOneWidget);

    await tester.pump(const Duration(days: 1));

    expect(find.text('ABERTO'), findsOneWidget);
  });

  testWidgets('reagenda quando o instante muda', (tester) async {
    var now = DateTime(2026, 9, 5, 9, 0);
    final adiado = DateTime(2026, 9, 5, 11, 0);

    await tester.pumpWidget(
      RebuildAt(instant: opensAt, clock: () => now, builder: gateLabel),
    );

    // Organizador adiou a abertura enquanto o atleta esperava na tela.
    await tester.pumpWidget(
      RebuildAt(
        instant: adiado,
        clock: () => now,
        builder: (context, clockNow) => Text(
          clockNow.isBefore(adiado) ? 'EM BREVE' : 'ABERTO',
          textDirection: TextDirection.ltr,
        ),
      ),
    );

    // A hora antiga não vale mais: passa das 10:00 e o gate continua fechado.
    now = DateTime(2026, 9, 5, 10, 0, 1);
    await tester.pump(const Duration(hours: 1));

    expect(find.text('EM BREVE'), findsOneWidget);

    now = DateTime(2026, 9, 5, 11, 0, 1);
    await tester.pump(const Duration(hours: 1));

    expect(find.text('ABERTO'), findsOneWidget);
  });

  testWidgets('cancela o timer ao sair da tela', (tester) async {
    final now = DateTime(2026, 9, 5, 9, 0);

    await tester.pumpWidget(
      RebuildAt(instant: opensAt, clock: () => now, builder: gateLabel),
    );

    // Timer vivo depois do dispose faz o próprio flutter_test falhar
    // ("A Timer is still pending") — é essa a asserção real aqui.
    await tester.pumpWidget(
      const Text('outra tela', textDirection: TextDirection.ltr),
    );

    expect(find.text('outra tela'), findsOneWidget);
  });
}
