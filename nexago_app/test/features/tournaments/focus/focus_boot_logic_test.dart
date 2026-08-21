import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/focus/focus_boot_logic.dart';

void main() {
  group('FocusBootProgress', () {
    test('a fração cresce um terço a cada passo assentado', () {
      expect(FocusBootProgress.none.fraction, 0);
      expect(
        const FocusBootProgress({FocusBootStep.nextMatch}).fraction,
        closeTo(1 / 3, 1e-9),
      );
      expect(
        const FocusBootProgress({
          FocusBootStep.nextMatch,
          FocusBootStep.journey,
          FocusBootStep.announcements,
        }).fraction,
        1,
      );
    });

    test('só está completo com os três passos', () {
      expect(FocusBootProgress.none.isComplete, isFalse);
      expect(
        const FocusBootProgress({
          FocusBootStep.nextMatch,
          FocusBootStep.journey,
        }).isComplete,
        isFalse,
      );
      expect(
        const FocusBootProgress({
          FocusBootStep.announcements,
          FocusBootStep.journey,
          FocusBootStep.nextMatch,
        }).isComplete,
        isTrue,
      );
    });

    test('isDone responde por passo', () {
      const progress = FocusBootProgress({FocusBootStep.journey});
      expect(progress.isDone(FocusBootStep.journey), isTrue);
      expect(progress.isDone(FocusBootStep.nextMatch), isFalse);
    });
  });

  group('shouldShowFocusBoot', () {
    bool show({
      bool hasTournament = true,
      FocusBootProgress progress = FocusBootProgress.none,
      bool minimumHoldElapsed = true,
      bool deadlineElapsed = false,
    }) {
      return shouldShowFocusBoot(
        hasTournament: hasTournament,
        progress: progress,
        minimumHoldElapsed: minimumHoldElapsed,
        deadlineElapsed: deadlineElapsed,
      );
    }

    const complete = FocusBootProgress({
      FocusBootStep.nextMatch,
      FocusBootStep.journey,
      FocusBootStep.announcements,
    });

    test('sem torneio segura, mesmo com tudo pronto e prazo estourado', () {
      // As seções e a nav dependem do formato da categoria, que vem do torneio.
      expect(
        show(
          hasTournament: false,
          progress: complete,
          deadlineElapsed: true,
        ),
        isTrue,
      );
    });

    test('o piso segura mesmo com os três passos prontos', () {
      // É o que evita o pisca quando o detalhe do torneio vem do cache.
      expect(show(progress: complete, minimumHoldElapsed: false), isTrue);
    });

    test('com os três passos prontos, entra', () {
      expect(show(progress: complete), isFalse);
    });

    test('faltando passo dentro do prazo, segura', () {
      expect(
        show(progress: const FocusBootProgress({FocusBootStep.nextMatch})),
        isTrue,
      );
    });

    test('prazo estourado entra mesmo faltando passo', () {
      expect(
        show(
          progress: const FocusBootProgress({FocusBootStep.nextMatch}),
          deadlineElapsed: true,
        ),
        isFalse,
      );
    });

    test('o prazo não vence o piso', () {
      expect(
        show(minimumHoldElapsed: false, deadlineElapsed: true),
        isTrue,
      );
    });
  });
}
