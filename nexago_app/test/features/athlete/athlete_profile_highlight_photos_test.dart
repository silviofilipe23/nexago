// Testes da galeria de fotos de destaque (`highlightPhotoUrls`) no modelo
// `AthleteProfile`: round-trip Firestore (fromFirestore/toFirestore) e
// imutabilidade via copyWith, incluindo o teto defensivo de leitura em
// [maxHighlightPhotos].
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';

void main() {
  const base = AthleteProfile(
    id: 'u1',
    name: 'Ana Souza',
    sport: 'Vôlei de praia',
    level: 'Intermediário',
    city: 'Goiânia',
    state: 'GO',
  );

  group('AthleteProfile.highlightPhotoUrls', () {
    test('vazio por padrão', () {
      expect(base.highlightPhotoUrls, isEmpty);
    });

    test('toFirestore grava o array (mesmo vazio)', () {
      expect(base.toFirestore()['highlightPhotoUrls'], <String>[]);

      final withPhotos = base.copyWith(
        highlightPhotoUrls: ['https://x/1.jpg', 'https://x/2.jpg'],
      );
      expect(
        withPhotos.toFirestore()['highlightPhotoUrls'],
        ['https://x/1.jpg', 'https://x/2.jpg'],
      );
    });

    test('copyWith substitui a lista sem mutar o original', () {
      final updated = base.copyWith(highlightPhotoUrls: ['https://x/1.jpg']);
      expect(updated.highlightPhotoUrls, ['https://x/1.jpg']);
      expect(base.highlightPhotoUrls, isEmpty);
    });

    test('copyWith sem o parâmetro preserva a lista existente', () {
      final withPhotos = base.copyWith(
        highlightPhotoUrls: ['https://x/1.jpg'],
      );
      final renamed = withPhotos.copyWith(name: 'Ana S.');
      expect(renamed.highlightPhotoUrls, ['https://x/1.jpg']);
    });

    test('fromFirestore lê a lista de URLs', () {
      final doc = _FakeDocSnapshot(
        id: 'u1',
        fields: {
          'fullName': 'Ana Souza',
          'city': 'Goiânia',
          'state': 'GO',
          'highlightPhotoUrls': ['https://x/1.jpg', 'https://x/2.jpg'],
        },
      );
      final profile = AthleteProfile.fromFirestore(doc);
      expect(profile.highlightPhotoUrls, [
        'https://x/1.jpg',
        'https://x/2.jpg',
      ]);
    });

    test('fromFirestore ignora entradas vazias/inválidas', () {
      final doc = _FakeDocSnapshot(
        id: 'u1',
        fields: {
          'fullName': 'Ana Souza',
          'highlightPhotoUrls': ['https://x/1.jpg', '', '   ', null],
        },
      );
      final profile = AthleteProfile.fromFirestore(doc);
      expect(profile.highlightPhotoUrls, ['https://x/1.jpg']);
    });

    test('fromFirestore trunca defensivamente em maxHighlightPhotos', () {
      final urls = List<String>.generate(
        maxHighlightPhotos + 3,
        (i) => 'https://x/$i.jpg',
      );
      final doc = _FakeDocSnapshot(
        id: 'u1',
        fields: {'fullName': 'Ana Souza', 'highlightPhotoUrls': urls},
      );
      final profile = AthleteProfile.fromFirestore(doc);
      expect(profile.highlightPhotoUrls.length, maxHighlightPhotos);
      expect(profile.highlightPhotoUrls, urls.take(maxHighlightPhotos));
    });

    test('fromFirestore sem o campo resulta em lista vazia', () {
      final doc = _FakeDocSnapshot(
        id: 'u1',
        fields: {'fullName': 'Ana Souza'},
      );
      final profile = AthleteProfile.fromFirestore(doc);
      expect(profile.highlightPhotoUrls, isEmpty);
    });
  });
}

class _FakeDocSnapshot implements DocumentSnapshot<Map<String, dynamic>> {
  _FakeDocSnapshot({required this.id, required Map<String, dynamic>? fields})
      : _fields = fields;

  @override
  final String id;
  final Map<String, dynamic>? _fields;

  @override
  bool get exists => _fields != null;

  @override
  Map<String, dynamic>? data() => _fields;

  @override
  dynamic get(Object field) => _fields?[field];

  @override
  dynamic operator [](Object field) => _fields?[field];

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
