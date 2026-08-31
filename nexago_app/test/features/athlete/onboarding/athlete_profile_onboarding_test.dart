import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/athlete_firestore_codes.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile_options.dart';
import 'package:nexago_app/features/athlete/onboarding/domain/athlete_onboarding_draft.dart';

void main() {
  group('AthleteProfileOptions', () {
    test('normalizeLevel maps legacy labels and preserves unmapped ones', () {
      expect(AthleteProfileOptions.normalizeLevel('Open / federado'), 'Open');
      // Escada de 5 níveis: legados mapeiam pro degrau equivalente.
      expect(AthleteProfileOptions.normalizeLevel('Básico'), 'Iniciante 1');
      expect(
        AthleteProfileOptions.normalizeLevel('Avançado'),
        'Intermediário 1',
      );
      // Vazio normaliza para vazio.
      expect(AthleteProfileOptions.normalizeLevel(''), '');
    });

    test('normalizeSport maps legacy labels', () {
      // Futevôlei virou esporte próprio — não é mais alias de Futebol.
      expect(AthleteProfileOptions.normalizeSport('Futevôlei'), 'Futevôlei');
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
      // Nível: só `sportOnboarding.levelsBySport` é escrito — os legados
      // `level` e `sportProfile` saíram do payload.
      expect(data.containsKey('level'), isFalse);
      expect(data.containsKey('sportProfile'), isFalse);

      final onboarding = data['sportOnboarding'] as Map<String, dynamic>;
      expect(onboarding['version'], 1);
      expect(onboarding['primarySportId'], 'VOLEI_PRAIA');
      expect(onboarding['secondarySportIds'], ['BEACH_TENNIS']);
      expect(onboarding['levelsBySport'], {
        'VOLEI_PRAIA': 'intermediario',
        'BEACH_TENNIS': 'iniciante_1',
      });
      expect(onboarding['goals'], ['RESERVAR_ARENA', 'COMPETIR']);
      expect(onboarding.containsKey('completedAt'), isTrue);
    });

    test('writes the declared phoneNumber while it is not verified', () {
      // O WhatsApp de contato é digitado pelo atleta desde que o SMS deixou de
      // ser obrigatório pra inscrição — as rules aceitam o número do client
      // ENQUANTO não há selo.
      const profile = AthleteProfile(
        id: 'u1',
        name: 'Ana',
        sport: 'Vôlei de praia',
        level: 'Intermediário',
        city: 'Goiânia',
        phoneNumber: '(62) 99999-9999',
      );

      final data = profile.toFirestore();
      expect(data['phoneNumber'], '(62) 99999-9999');
      // O SELO continua sendo só da Cloud Function `confirmPhoneVerification`:
      // se estes campos entrarem no payload, TODO save de perfil quebra com
      // `permission-denied` — não só a parte do telefone.
      expect(data.containsKey('phoneVerified'), isFalse);
      expect(data.containsKey('phoneVerifiedAt'), isFalse);
    });

    test('campo vazio não apaga o telefone já salvo', () {
      // `saveProfile` carimba `isProfileComplete: true` quando o perfil passa
      // no gate, e esse campo é curto-circuito do gate NO SERVIDOR: deixar o
      // atleta esvaziar o WhatsApp deixaria a inscrição liberada com contato
      // vazio. O WhatsApp é obrigatório — apagar não é uma operação suportada.
      const profile = AthleteProfile(
        id: 'u1',
        name: 'Ana',
        sport: 'Vôlei de praia',
        level: 'Intermediário',
        city: 'Goiânia',
        phoneNumber: '',
      );

      expect(profile.toFirestore().containsKey('phoneNumber'), isFalse);
    });

    test('never rewrites a phoneNumber that is already verified', () {
      // Depois do selo o número é imutável pelo client (rules) — reenviar uma
      // variante formatada diferente derrubaria o save inteiro.
      const profile = AthleteProfile(
        id: 'u1',
        name: 'Ana',
        sport: 'Vôlei de praia',
        level: 'Intermediário',
        city: 'Goiânia',
        phoneNumber: '+5562999999999',
        phoneVerified: true,
      );

      final data = profile.toFirestore();
      expect(data.containsKey('phoneNumber'), isFalse);
      expect(data.containsKey('phoneVerified'), isFalse);
      expect(data.containsKey('phoneVerifiedAt'), isFalse);
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

    test('reads phoneVerified written by the Cloud Function', () {
      final verified = AthleteProfile.fromFirestore(
        _FakeDoc(
          id: 'u3',
          fields: {
            'name': 'Ana',
            'phoneNumber': '+5562999999999',
            'phoneVerified': true,
          },
        ),
      );
      expect(verified.phoneNumber, '+5562999999999');
      expect(verified.phoneVerified, isTrue);
    });

    test('legacy doc with a phone but no flag is not verified', () {
      // Contas anteriores à verificação por SMS têm o número digitado, sem
      // posse comprovada — precisam passar pelo fluxo para liberar torneios.
      final legacy = AthleteProfile.fromFirestore(
        _FakeDoc(
          id: 'u4',
          fields: {'name': 'Ana', 'whatsapp': '(62) 99999-9999'},
        ),
      );
      expect(legacy.phoneNumber, '(62) 99999-9999');
      expect(legacy.phoneVerified, isFalse);
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
        phoneNumber: '+5511987654321',
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
