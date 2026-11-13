import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/profile_image_file_name.dart';

void main() {
  group('profileImageFileName', () {
    test('usa o tipo e o instante do envio', () {
      final now = DateTime.fromMillisecondsSinceEpoch(1794224273667);
      expect(profileImageFileName('avatar', now), 'avatar-1794224273667.jpg');
      expect(profileImageFileName('cover', now), 'cover-1794224273667.jpg');
    });

    test('nunca reaproveita o nome fixo que invalidava a URL antiga', () {
      final now = DateTime.now();
      expect(profileImageFileName('avatar', now), isNot('avatar.jpg'));
      expect(profileImageFileName('cover', now), isNot('cover.jpg'));
    });

    test('dois envios em instantes diferentes geram arquivos diferentes', () {
      final a = DateTime.fromMillisecondsSinceEpoch(1000);
      final b = DateTime.fromMillisecondsSinceEpoch(1001);
      expect(
        profileImageFileName('avatar', a),
        isNot(profileImageFileName('avatar', b)),
      );
    });
  });
}
