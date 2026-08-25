import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/text/safe_display_text.dart';

void main() {
  group('sanitizeUtf16', () {
    test('replaces unpaired high surrogate', () {
      const lone = '\uD83C';
      expect(sanitizeUtf16(lone), '\uFFFD');
    });

    test('keeps valid emoji', () {
      expect(sanitizeUtf16('🏐'), '🏐');
    });
  });

  group('firstGraphemesUpper', () {
    test('takes full emoji as one unit', () {
      expect(firstGraphemesUpper('🏐Arena', 2), '🏐A');
    });
  });

  group('shortPersonLabel', () {
    test('keeps emoji last token intact', () {
      expect(shortPersonLabel('Pereira 🐸'), 'Pereira 🐸.');
      expect(shortPersonLabel('Blessed 🥇'), 'Blessed 🥇.');
    });

    test('uses letter initial for normal names', () {
      expect(shortPersonLabel('Ana Silva'), 'Ana S.');
    });
  });
}
