import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer_public_profile/presentation/widgets/organizer_clock.dart';

void main() {
  testWidgets(
    'reconstrói em cada instante seguinte, recalculado a cada disparo',
    (tester) async {
      final t0 = DateTime(2026, 8, 10, 9);
      var fakeNow = t0;
      final changes = [
        t0.add(const Duration(hours: 1)),
        t0.add(const Duration(hours: 3)),
      ];
      final seen = <DateTime>[];

      await tester.pumpWidget(
        Directionality(
          textDirection: TextDirection.ltr,
          child: OrganizerClock(
            clock: () => fakeNow,
            nextChangeAt: (now) {
              for (final c in changes) {
                if (c.isAfter(now)) return c;
              }
              return null;
            },
            builder: (context, now) {
              seen.add(now);
              return Text('$now');
            },
          ),
        ),
      );
      expect(seen, [t0]);

      // Antes do instante, nada.
      await tester.pump(const Duration(minutes: 30));
      expect(seen, [t0]);

      // Cruzou o primeiro instante: reconstrói e agenda o segundo.
      fakeNow = changes[0];
      await tester.pump(const Duration(minutes: 31));
      expect(seen.last, changes[0]);

      fakeNow = changes[1];
      await tester.pump(const Duration(hours: 2, minutes: 1));
      expect(seen.last, changes[1]);

      // Nada mais muda: nenhum timer pendente (o teste falharia ao desmontar).
      final count = seen.length;
      await tester.pump(const Duration(days: 3));
      expect(seen.length, count);
    },
  );

  testWidgets('espera longa acorda no teto de um dia só para recalcular', (
    tester,
  ) async {
    final t0 = DateTime(2026, 8, 10, 9);
    var fakeNow = t0;
    final far = t0.add(const Duration(days: 40));
    var builds = 0;

    await tester.pumpWidget(
      Directionality(
        textDirection: TextDirection.ltr,
        child: OrganizerClock(
          clock: () => fakeNow,
          nextChangeAt: (now) => far.isAfter(now) ? far : null,
          builder: (context, now) {
            builds++;
            return const SizedBox();
          },
        ),
      ),
    );
    expect(builds, 1);
    fakeNow = t0.add(const Duration(days: 1));
    await tester.pump(OrganizerClock.maxWait + const Duration(milliseconds: 2));
    expect(builds, 2);
    await tester.pumpWidget(const SizedBox());
  });
}
