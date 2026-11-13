import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arena/domain/arena_image_storage_path.dart';

void main() {
  final t = DateTime.fromMillisecondsSinceEpoch(1731500000000);

  test('capa: o instante do envio entra no nome (formato aceito pelo rules)',
      () {
    expect(arenaCoverStoragePath('a1', t), 'arenas/a1/cover-1731500000000');
  });

  test('foto de produto: um arquivo por envio na pasta de produtos', () {
    expect(
      arenaProductImageStoragePath('a1', 'p1', t),
      'arenas/a1/products/p1-1731500000000.jpg',
    );
  });

  test('dois envios seguidos dão caminhos diferentes', () {
    final later = t.add(const Duration(milliseconds: 1));
    expect(arenaCoverStoragePath('a1', t),
        isNot(arenaCoverStoragePath('a1', later)));
  });

  test('foto substituída: só a da pasta de produtos desta arena', () {
    bool replaced(String? prev, String? next) => isReplacedArenaProductImage(
        arenaId: 'a1', previousPath: prev, nextPath: next);
    expect(replaced('arenas/a1/products/p1.jpg', 'arenas/a1/products/p1-2.jpg'),
        isTrue);
    expect(replaced('arenas/a1/products/p1.jpg', null), isTrue);
    expect(
        replaced('arenas/a1/products/p1-2.jpg', 'arenas/a1/products/p1-2.jpg'),
        isFalse);
    expect(
        replaced('arenas/a1/cover-1', 'arenas/a1/products/p1-2.jpg'), isFalse);
    expect(replaced('arenas/a2/products/p1.jpg', null), isFalse);
    expect(replaced(null, 'arenas/a1/products/p1-2.jpg'), isFalse);
  });
}
