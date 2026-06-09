import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/athlete_firestore_codes.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_options.dart';
import 'package:nexago_app/features/athlete/onboarding/domain/athlete_onboarding_draft.dart';

void main() {
  group('AthleteProfileOptions', () {
    test('normalizeLevel maps legacy federado label', () {
      expect(AthleteProfileOptions.normalizeLevel('Open / federado'), 'Open');
      expect(AthleteProfileOptions.normalizeLevel('Básico'), 'Iniciante');
      expect(AthleteProfileOptions.normalizeLevel('Avançado'), 'Iniciante');
    });

    test('normalizeSport maps legacy labels', () {
      expect(AthleteProfileOptions.normalizeSport('Futevôlei'), 'Futebol');
      expect(
        AthleteProfileOptions.normalizeSport('Beach tênis'),
        'Beach tennis',
      );
    });
  });

  group('AthleteProfile.toFirestore', () {
    test('persists canonical user document with goals array', () {
      const profile = AthleteProfile(
        id: 'u1',
        name: 'Ana',
        sport: 'Vôlei de praia',
        level: 'Intermediário',
        city: '',
        sports: ['Beach tennis'],
        goals: ['RESERVAR_ARENA', 'COMPETIR'],
        nickname: 'Aninha',
        birthDate: '2000-01-01',
        gender: 'Feminino',
        primarySportFirestoreId: 'VOLEI_PRAIA',
        secondarySportFirestoreIds: ['BEACH_TENNIS'],
        onboardingCompleted: true,
        isProfileComplete: true,
      );

      final data = profile.toFirestore();
      expect(data['fullName'], 'Ana');
      expect(data['isProfileComplete'], isTrue);
      expect(data['birthDate'], '2000-01-01');
      expect(data['sportProfile'], {'level': 'intermediario'});

      final onboarding = data['sportOnboarding'] as Map<String, dynamic>;
      expect(onboarding['version'], 1);
      expect(onboarding['primarySportId'], 'VOLEI_PRAIA');
      expect(onboarding['secondarySportIds'], ['BEACH_TENNIS']);
      expect(onboarding['levelsBySport'], {
        'VOLEI_PRAIA': 'intermediario',
        'BEACH_TENNIS': 'iniciante',
      });
      expect(onboarding['goals'], ['RESERVAR_ARENA', 'COMPETIR']);
      expect(onboarding.containsKey('completedAt'), isTrue);
    });

    test('persists city and state on user document', () {
      const profile = AthleteProfile(
        id: 'u1',
        name: 'Ana',
        sport: 'Vôlei de praia',
        level: 'Intermediário',
        city: 'Goiânia',
        state: 'go',
      );

      final data = profile.toFirestore();
      expect(data['city'], 'Goiânia');
      expect(data['state'], 'GO');
    });

    test('copyWith updates or clears state explicitly', () {
      const profile = AthleteProfile(
        id: 'u1',
        name: 'Ana',
        sport: 'Vôlei de praia',
        level: 'Intermediário',
        city: 'Goiânia',
        state: 'SP',
      );

      expect(profile.copyWith(state: 'GO').state, 'GO');
      expect(profile.copyWith(state: null).state, isNull);
      expect(profile.copyWith().state, 'SP');
    });

    test('copyWith updates or clears nickname explicitly', () {
      const profile = AthleteProfile(
        id: 'u1',
        name: 'Ana',
        sport: 'Vôlei de praia',
        level: 'Intermediário',
        city: '',
        nickname: 'Aninha',
      );

      expect(profile.copyWith(nickname: 'Nana').nickname, 'Nana');
      expect(profile.copyWith(nickname: null).nickname, isNull);
      expect(profile.copyWith().nickname, 'Aninha');
    });
  });

  group('AthleteProfile.fromFirestore', () {
    test('parses birthDate from Firestore Timestamp', () {
      final snap = _FakeDoc(
        id: 'u1',
        fields: {
          'name': 'João',
          'birthDate': Timestamp.fromDate(DateTime(1990, 3, 15)),
        },
      );

      final profile = AthleteProfile.fromFirestore(snap);
      expect(profile.birthDate, '15/03/1990');
    });

    test('parses birthDate from ISO string', () {
      final snap = _FakeDoc(
        id: 'u2',
        fields: {'name': 'Ana', 'birthDate': '2000-01-01'},
      );

      final profile = AthleteProfile.fromFirestore(snap);
      expect(profile.birthDate, '01/01/2000');
    });
  });

  group('AthleteOnboardingDraft.toAthleteProfile', () {
    test('maps draft to firestore sport codes and goal array', () {
      const draft = AthleteOnboardingDraft(
        primarySportId: 'beach_volleyball',
        otherSportIds: {'beach_tennis'},
        level: 'Intermediário',
        goalIds: {'book_arena', 'compete'},
        name: 'Marcelo',
        phoneDigits: '(11) 98765-4321',
        birthDate: '15/03/1990',
        gender: 'Feminino',
      );

      final profile = draft.toAthleteProfile(uid: 'uid-1');
      expect(profile.primarySportFirestoreId, 'VOLEI_PRAIA');
      expect(profile.secondarySportFirestoreIds, ['BEACH_TENNIS']);
      expect(profile.goals, ['RESERVAR_ARENA', 'COMPETIR']);
      expect(profile.birthDate, '1990-03-15');
      expect(
        AthleteFirestoreCodes.levelLabelToFirestore(profile.level),
        'intermediario',
      );
    });
  });
}

class _FakeDoc implements DocumentSnapshot<Map<String, dynamic>> {
  _FakeDoc({required this.id, required Map<String, dynamic> fields})
    : _fields = fields;

  @override
  final String id;
  final Map<String, dynamic> _fields;

  @override
  bool get exists => true;

  @override
  DocumentReference<Map<String, dynamic>> get reference =>
      throw UnimplementedError();

  @override
  SnapshotMetadata get metadata => throw UnimplementedError();

  @override
  Map<String, dynamic>? data() => _fields;

  @override
  dynamic get(Object field) => _fields[field];

  @override
  dynamic operator [](Object field) => _fields[field];
}
