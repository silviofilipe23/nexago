import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/data/tournament_create_mapper.dart';
import 'package:nexago_app/features/organizer/domain/tournament_create/tournament_create_draft.dart';
import 'package:nexago_app/features/tournaments/data/tournament_document_mapper.dart';
import 'package:nexago_app/features/tournaments/domain/registration_terms_copy.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_registration_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_substitution_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_team_roster_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_uniform_selection.dart';

/// Categoria individual no app (multiesporte fase 4d1): `teamSize: 1`.
void main() {
  test(
    'categoria teamSize 1 é individual: não é equipe, rótulos de atleta',
    () {
      final d = TournamentDocumentMapper.detailFromMap('t1', {
        'name': 'Open de Tênis',
        'categories': [
          {
            'id': 'c1',
            'categoryName': 'Simples',
            'entryFee': 120,
            'teamSize': 1,
          },
        ],
      });
      final offer = d.categoryOffers.single;
      expect(offer.teamSize, 1);
      expect(offer.isTeamCategory, isFalse);
      expect(offer.isIndividualCategory, isTrue);
      expect(offer.rosterSize, 1);
      expect(offer.formatLabel, 'Individual');
      expect(offer.unitLabel, 'atletas');
      expect(offer.unitSingular, 'atleta');
      expect(offer.genderDetail, isNull);
    },
  );

  test('cotação da individual é a taxa inteira', () {
    final quote = buildRegistrationQuote(entryFee: 120, teamSize: 1);
    expect(quote.shareAmount, 120);
    expect(quote.isTeamCategory, isFalse);
    expect(quote.unitSingular, 'atleta');
  });

  test(
    'condições da individual inscrevem direto, mesmo com dupla obrigatória',
    () {
      final copy = registrationTermsCopy(
        category: const TournamentCategoryOffer(
          id: 'c1',
          name: 'Simples',
          entryFee: 120,
          teamSize: 1,
        ),
        requireFormedPair: true,
        hasReceivedInvite: false,
      );
      expect(copy.eyebrow, 'INDIVIDUAL');
      expect(copy.registersDirectly, isTrue);
      expect(copy.allowsSolo, isFalse);
    },
  );

  test(
    'uniforme da individual mora no slot Player1 (como o servidor grava)',
    () {
      const filled = TournamentUniformSelection(sizeTop: 'M');
      final slot = uniformSlotFor(
        uid: 'me',
        teamSize: 1,
        player1Id: 'me',
        uniformPlayer1: filled,
      );
      expect(slot, filled);
    },
  );

  test('individual não tem "sair da equipe"', () {
    expect(
      canLeaveTeamRegistration(
        teamSize: 1,
        captainUid: null,
        myUid: 'me',
        isPaid: false,
        sharePaidUids: const [],
      ),
      isFalse,
    );
  });

  test('pagamento da individual abre no valor integral', () {
    expect(
      initialRegistrationPaymentType(
        awaitingSoloPartner: false,
        isTeamCategory: false,
        isIndividual: true,
      ),
      'full',
    );
    expect(
      initialRegistrationPaymentType(
        awaitingSoloPartner: false,
        isTeamCategory: false,
      ),
      'share',
    );
  });

  test(
    'organizador (app): teamSize 1 sem disputeType carrega como individual',
    () {
      final parsed = TournamentCreateMapper.fromFirestore({
        'name': 'Open de Tênis',
        'city': 'Goiânia',
        'locationName': 'Arena',
        'startAt': Timestamp.fromDate(DateTime(2026, 11, 1)),
        'endAt': Timestamp.fromDate(DateTime(2026, 11, 2)),
        'categories': [
          {'id': 'c1', 'categoryName': 'Simples', 'maxTeams': 8, 'teamSize': 1},
          {'id': 'c2', 'categoryName': 'Trio', 'maxTeams': 8, 'teamSize': 3},
          {'id': 'c3', 'categoryName': 'Dupla', 'maxTeams': 8},
        ],
      }, 't1');
      final disputes = parsed.draft.categories.map((c) => c.dispute).toList();
      expect(disputes, [
        TournamentCategoryDispute.individual,
        TournamentCategoryDispute.trio,
        TournamentCategoryDispute.dupla,
      ]);
    },
  );

  test('individual não oferece substituir atleta (não há parceiro)', () {
    expect(
      substitutionReplaceableUids(
        participantUids: const ['me'],
        uid: 'me',
        teamSize: 1,
        captainUid: null,
        partnerPending: false,
        bracketPublished: false,
      ),
      isEmpty,
    );
  });

  test('textos de pagamento da individual não citam parceiro', () {
    final quote = buildRegistrationQuote(entryFee: 120, teamSize: 1);
    final free = buildRegistrationQuote(entryFee: 0, teamSize: 1);
    expect(
      registrationDualPaymentProgressLabel(
        quote: quote,
        paidAmount: 0,
        isPaid: false,
      ),
      isNot(contains('parceiro')),
    );
    expect(
      registrationDualPaymentProgressLabel(
        quote: free,
        paidAmount: 0,
        isPaid: false,
      ),
      'Confirme sua inscrição gratuita.',
    );
    expect(
      registrationDualPaymentProgressLabel(
        quote: quote,
        paidAmount: 0,
        isPaid: false,
        isDirectOrganizerPayment: true,
      ),
      isNot(contains('Cada atleta')),
    );
    expect(
      registrationDualPaymentProgressLabel(
        quote: quote,
        paidAmount: 120,
        isPaid: true,
      ),
      isNot(contains('dupla')),
    );
    expect(
      directOrganizerShareHint(quote, 'full'),
      'Você está pagando a inscrição inteira.',
    );
  });
}
