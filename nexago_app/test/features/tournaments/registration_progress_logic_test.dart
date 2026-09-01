// Testes do porte de `registration-progress.ts` (painel web) pra Dart:
// trilha de passos do acompanhamento de inscrição na Home do atleta.
// Espelha os casos de `registration-progress.spec.ts` do portal.
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/registration_progress_logic.dart';
import 'package:nexago_app/features/tournaments/domain/registration_wizard_step.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_payment_mode.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_uniform_selection.dart';

const kMe = 'uid-eu';
const kPartner = 'uid-parceiro';

TournamentCategoryOffer makeCategory({
  String id = 'cat-1',
  String name = 'Masc. Intermediário',
  double entryFee = 180,
  String? uniformType,
  List<String> uniformSizeOptionsTop = const [],
  int? teamSize,
}) {
  return TournamentCategoryOffer(
    id: id,
    name: name,
    entryFee: entryFee,
    uniformType: uniformType,
    uniformSizeOptionsTop: uniformSizeOptionsTop,
    teamSize: teamSize,
  );
}

/// Categoria com uniforme só de regata, sem número e sem nome na camisa.
final uniformCategory = makeCategory(
  uniformType: 'top_only',
  uniformSizeOptionsTop: const ['P', 'M', 'G'],
);

MyTournamentRegistration makeRegistration({
  String registrationId = 'reg-1',
  String tournamentId = 't1',
  String tournamentName = 'Open Goiânia Beach',
  String categoryId = 'cat-1',
  bool partnerPending = true,
  bool isPaid = false,
  bool isWaitlist = false,
  bool athleteHasReserved = false,
  bool hasPartialPayment = false,
  List<String> participantUids = const [kMe],
  String? player1Id = kMe,
  int? teamSize,
  String? teamName,
  TournamentUniformSelection? uniformPlayer1,
  TournamentUniformSelection? uniformPlayer2,
  Map<String, TournamentUniformSelection> uniformByUid = const {},
  TournamentCategoryOffer? category,
  bool categoryResolved = true,
  TournamentPaymentMode paymentMode = TournamentPaymentMode.appPixCard,
  bool tournamentIsCancelled = false,
  DateTime? startDate,
}) {
  return MyTournamentRegistration(
    registrationId: registrationId,
    tournamentId: tournamentId,
    tournamentName: tournamentName,
    dateLabel: '12 a 14 ago',
    statusLabel: 'Inscrito',
    isPaid: isPaid,
    categoryId: categoryId,
    startDate: startDate,
    isWaitlist: isWaitlist,
    athleteHasReserved: athleteHasReserved,
    partnerPending: partnerPending,
    hasPartialPayment: hasPartialPayment,
    participantUids: participantUids,
    player1Id: player1Id,
    teamSize: teamSize,
    teamName: teamName,
    uniformPlayer1: uniformPlayer1,
    uniformPlayer2: uniformPlayer2,
    uniformByUid: uniformByUid,
    category: categoryResolved ? (category ?? makeCategory()) : null,
    paymentMode: paymentMode,
    tournamentIsCancelled: tournamentIsCancelled,
  );
}

RegistrationProgress? build(
  MyTournamentRegistration registration, {
  String? partnerName = 'Bruno Viana',
}) {
  return buildRegistrationProgress(
    registration,
    myUid: kMe,
    myName: 'Marcelo Souza',
    partnerName: partnerName,
  );
}

void main() {
  group('uniformSlotForRegistration', () {
    test('player1Id igual ao uid lê o slot 1', () {
      final registration = makeRegistration(
        player1Id: kMe,
        participantUids: const [kMe, kPartner],
        uniformPlayer1: const TournamentUniformSelection(sizeTop: 'G'),
        uniformPlayer2: const TournamentUniformSelection(sizeTop: 'P'),
      );

      expect(uniformSlotForRegistration(registration, kMe).sizeTop, 'G');
    });

    test('sem player1Id, primeiro participantUid lê o slot 1', () {
      final registration = makeRegistration(
        player1Id: null,
        participantUids: const [kMe, kPartner],
        uniformPlayer1: const TournamentUniformSelection(sizeTop: 'M'),
      );

      expect(uniformSlotForRegistration(registration, kMe).sizeTop, 'M');
    });

    test('convidado (índice 1) lê o slot 2', () {
      final registration = makeRegistration(
        player1Id: null,
        participantUids: const [kPartner, kMe],
        uniformPlayer1: const TournamentUniformSelection(sizeTop: 'G'),
        uniformPlayer2: const TournamentUniformSelection(sizeTop: 'P'),
      );

      expect(uniformSlotForRegistration(registration, kMe).sizeTop, 'P');
    });

    test('equipe (teamSize) lê uniformByUid do atleta', () {
      final registration = makeRegistration(
        teamSize: 3,
        participantUids: const [kMe, kPartner],
        uniformByUid: const {
          kMe: TournamentUniformSelection(sizeTop: 'M'),
          kPartner: TournamentUniformSelection(sizeTop: 'G'),
        },
      );

      expect(uniformSlotForRegistration(registration, kMe).sizeTop, 'M');
    });

    test('equipe sem entrada no mapa devolve slot vazio', () {
      final registration = makeRegistration(teamSize: 3);

      final slot = uniformSlotForRegistration(registration, kMe);
      expect(slot.sizeTop, isNull);
      expect(slot.sizeShorts, isNull);
      expect(slot.jerseyNumber, isNull);
      expect(slot.jerseyName, isNull);
    });
  });

  group('buildRegistrationProgress — trilha de passos', () {
    test('inscrição confirmada (paga, dupla fechada, uniforme ok) não gera '
        'trilha', () {
      final registration = makeRegistration(
        isPaid: true,
        partnerPending: false,
        participantUids: const [kMe, kPartner],
      );

      expect(build(registration), isNull);
    });

    test('confirmada com uniforme salvo também sai do card', () {
      final registration = makeRegistration(
        isPaid: true,
        partnerPending: false,
        participantUids: const [kMe, kPartner],
        uniformPlayer1: const TournamentUniformSelection(sizeTop: 'M'),
        category: uniformCategory,
      );

      expect(build(registration), isNull);
    });

    test('categoria sem exigência resolve como null quando '
        'buildRegistrationProgress não acha a categoria', () {
      expect(build(makeRegistration(categoryResolved: false)), isNull);
    });

    test('sem uniforme exigido: 4 passos na ordem Categoria → Dupla → '
        'Pagamento → Confirmada', () {
      final progress = build(makeRegistration())!;

      expect(progress.totalSteps, 4);
      expect(
        progress.steps.map((s) => s.label).toList(),
        ['Categoria', 'Dupla', 'Pagamento', 'Confirmada'],
      );
    });

    test('uniforme exigido (top_only): 5 passos', () {
      final progress = build(
        makeRegistration(category: uniformCategory),
      )!;

      expect(progress.totalSteps, 5);
      expect(
        progress.steps.map((s) => s.label).toList(),
        ['Categoria', 'Dupla', 'Uniforme', 'Pagamento', 'Confirmada'],
      );
    });

    test('uniforme exigido (full): 5 passos', () {
      final progress = build(
        makeRegistration(category: makeCategory(uniformType: 'full')),
      )!;

      expect(progress.totalSteps, 5);
      expect(progress.steps[2].label, 'Uniforme');
    });

    test('partnerPending: parado na Dupla com pendingLabel e caption', () {
      final progress = build(makeRegistration())!;

      expect(progress.currentStep, 2);
      expect(progress.pendingLabel, 'Falta fechar a dupla');
      expect(progress.steps[1].caption, 'Falta parceiro');
      expect(
        progress.steps.map((s) => s.state).toList(),
        [
          RegistrationStepState.done,
          RegistrationStepState.current,
          RegistrationStepState.todo,
          RegistrationStepState.todo,
        ],
      );
      expect(progress.paymentPending, isFalse);
    });

    test('uniforme pendente (dupla já fechada): parado no Uniforme com '
        'caption Pendente', () {
      // Dupla vem antes do uniforme na trilha — pra isolar o uniforme como
      // passo atual, a dupla precisa estar fechada, senão é ela que bloqueia
      // (ver grupo "ordem do wizard").
      final progress = build(
        makeRegistration(category: uniformCategory, partnerPending: false),
      )!;

      expect(progress.currentStep, 3);
      expect(progress.pendingLabel, 'Falta escolher o uniforme');
      expect(progress.steps[2].caption, 'Pendente');
    });

    test('uniforme salvo (dupla já fechada) avança pro pagamento', () {
      final progress = build(
        makeRegistration(
          category: uniformCategory,
          partnerPending: false,
          participantUids: const [kMe, kPartner],
          uniformPlayer1: const TournamentUniformSelection(sizeTop: 'M'),
        ),
      )!;

      expect(progress.currentStep, 4);
      expect(progress.steps[2].caption, 'Salvo');
      expect(progress.steps[3].label, 'Pagamento');
    });

    test('só falta pagar: paymentPending true e pendingLabel do pagamento',
        () {
      final progress = build(
        makeRegistration(
          partnerPending: false,
          participantUids: const [kMe, kPartner],
        ),
      )!;

      expect(progress.currentStep, 3);
      expect(progress.totalSteps, 4);
      expect(progress.pendingLabel, 'Falta o pagamento');
      expect(progress.paymentPending, isTrue);
      expect(progress.steps[1].caption, 'Marcelo & Bruno');
    });

    test('parceiro sem perfil encontrado não quebra a sublinha da Dupla', () {
      final progress = build(
        makeRegistration(
          partnerPending: false,
          participantUids: const [kMe, kPartner],
        ),
        partnerName: null,
      )!;

      expect(progress.steps[1].caption, 'Dupla formada');
    });

    test('lista de espera propaga pro card', () {
      final progress = build(makeRegistration(isWaitlist: true))!;

      expect(progress.waitlist, isTrue);
      expect(progress.currentStep, 2);
    });

    test('propaga ids, nomes e startAt pro card', () {
      final start = DateTime(2026, 8, 12);
      final progress = build(makeRegistration(startDate: start))!;

      expect(progress.registrationId, 'reg-1');
      expect(progress.tournamentId, 't1');
      expect(progress.categoryId, 'cat-1');
      expect(progress.tournamentName, 'Open Goiânia Beach');
      expect(progress.categoryName, 'Masc. Intermediário');
      expect(progress.startAt, start);
    });
  });

  group('buildRegistrationProgress — ordem do wizard', () {
    test('trilha segue a ordem do wizard: dupla antes do uniforme', () {
      final progress = buildRegistrationProgress(
        makeRegistration(category: uniformCategory, partnerPending: true),
        myUid: kMe,
        myName: 'Rafael Torres',
      );

      expect(
        progress!.steps.map((s) => s.label).toList(),
        ['Categoria', 'Dupla', 'Uniforme', 'Pagamento', 'Confirmada'],
      );
    });

    test('a trilha concorda com o porteiro sobre qual é o próximo passo', () {
      // As duas implementações existem porque partem de MODELOS diferentes
      // (`MyTournamentRegistration` aqui, `UserCategoryRegistration` + snapshot
      // no porteiro). Este teste é o que impede as duas divergirem em silêncio.
      final registration = makeRegistration(
        category: uniformCategory,
        partnerPending: true,
      );
      final progress = buildRegistrationProgress(
        registration,
        myUid: kMe,
        myName: 'Rafael Torres',
      );
      final step = resolveRegistrationStep(
        RegistrationStepInput(
          categoryResolved: true,
          hasReceivedInvite: false,
          hasRegistration: true,
          lgpdAccepted: true,
          partnerPending: true,
          uniformRequired: true,
          uniformComplete: false,
          isPaid: false,
        ),
      );

      expect(progress!.steps[progress.currentStep - 1].label, 'Dupla');
      expect(step, RegistrationWizardStep.parceiro);
    });

    test('dupla pendente é o passo atual mesmo com uniforme pendente', () {
      final progress = buildRegistrationProgress(
        makeRegistration(category: uniformCategory, partnerPending: true),
        myUid: kMe,
        myName: 'Rafael Torres',
      );

      expect(progress!.currentStep, 2);
      expect(progress.pendingLabel, 'Falta fechar a dupla');
    });
  });

  group('buildRegistrationProgress — caption do passo Pagamento', () {
    // `\s` de propósito: o Intl pt-BR pode separar "R$" do valor com espaço
    // não-quebrável (U+00A0), invisível no fonte, que quebra comparação
    // literal — mesma pegadinha do spec da web.
    test('dupla mostra a metade da inscrição', () {
      final progress = build(makeRegistration(partnerPending: false))!;

      expect(
        progress.steps[2].caption,
        matches(RegExp(r'^Sua metade · R\$\s90,00$')),
      );
    });

    test('equipe (trio) mostra a cota por atleta', () {
      final progress = build(
        makeRegistration(
          teamSize: 3,
          teamName: 'Trio Calango',
          partnerPending: false,
          participantUids: const [kMe, kPartner, 'uid-3'],
          category: makeCategory(entryFee: 210, teamSize: 3),
        ),
      )!;

      expect(
        progress.steps[2].caption,
        matches(RegExp(r'^Sua cota · R\$\s70,00$')),
      );
    });

    test('categoria gratuita mostra Gratuito', () {
      final progress = build(
        makeRegistration(
          partnerPending: false,
          category: makeCategory(entryFee: 0),
        ),
      )!;

      expect(progress.steps[2].caption, 'Gratuito');
    });

    test('pagamento direto com o organizador não mostra valor', () {
      final progress = build(
        makeRegistration(
          partnerPending: false,
          paymentMode: TournamentPaymentMode.directWithOrganizer,
        ),
      )!;

      expect(progress.steps[2].caption, 'Direto com o organizador');
    });

    test('minha parte paga mas inscrição não fechada: passo segue pendente',
        () {
      final progress = build(
        makeRegistration(
          partnerPending: false,
          athleteHasReserved: true,
          hasPartialPayment: true,
        ),
      )!;

      expect(progress.steps[2].caption, 'Sua parte paga');
      expect(progress.steps[2].state, RegistrationStepState.current);
    });
  });

  group('buildRegistrationProgress — estado monotônico', () {
    test('uniforme pendente com pagamento feito: passos seguintes ficam todo',
        () {
      final progress = build(
        makeRegistration(
          isPaid: true,
          partnerPending: false,
          participantUids: const [kMe, kPartner],
          category: uniformCategory,
        ),
      )!;

      expect(progress.steps[2].label, 'Uniforme');
      expect(progress.pendingLabel, 'Falta escolher o uniforme');
      expect(
        progress.steps.map((s) => s.state).toList(),
        [
          RegistrationStepState.done,
          RegistrationStepState.done,
          RegistrationStepState.current,
          RegistrationStepState.todo,
          RegistrationStepState.todo,
        ],
      );
    });

    test('paga aguardando parceiro: Pagamento vira todo apesar do caption '
        'Pago', () {
      final progress = build(
        makeRegistration(isPaid: true, partnerPending: true),
      )!;

      expect(progress.currentStep, 2);
      expect(progress.steps[2].caption, 'Pago');
      expect(progress.steps[2].state, RegistrationStepState.todo);
    });
  });

  group('buildRegistrationProgress — canCancel', () {
    test('true só sem NENHUM pagamento na inscrição', () {
      expect(build(makeRegistration())!.canCancel, isTrue);
      expect(
        build(makeRegistration(hasPartialPayment: true))!.canCancel,
        isFalse,
      );
      // Paga aguardando parceiro ainda gera trilha — mas nunca cancelável.
      expect(
        build(makeRegistration(isPaid: true, partnerPending: true))!.canCancel,
        isFalse,
      );
    });
  });

  group('buildRegistrationProgress — equipe (trio)', () {
    test('rótulo Equipe com elenco parcial e pendingLabel próprio', () {
      final progress = build(
        makeRegistration(
          teamSize: 3,
          partnerPending: true,
          participantUids: const [kMe, kPartner],
          category: makeCategory(entryFee: 210, teamSize: 3),
        ),
      )!;

      expect(progress.steps[1].label, 'Equipe');
      expect(progress.steps[1].caption, 'Elenco 2/3');
      expect(progress.pendingLabel, 'Falta completar a equipe');
    });

    test('equipe completa mostra o nome da equipe', () {
      final progress = build(
        makeRegistration(
          teamSize: 3,
          teamName: 'Trio Calango',
          partnerPending: false,
          participantUids: const [kMe, kPartner, 'uid-3'],
          category: makeCategory(entryFee: 210, teamSize: 3),
        ),
      )!;

      expect(progress.steps[1].caption, 'Trio Calango');
    });

    test('equipe completa sem nome cai em Equipe completa', () {
      final progress = build(
        makeRegistration(
          teamSize: 3,
          partnerPending: false,
          participantUids: const [kMe, kPartner, 'uid-3'],
          category: makeCategory(entryFee: 210, teamSize: 3),
        ),
      )!;

      expect(progress.steps[1].caption, 'Equipe completa');
    });

    test('uniforme da equipe vem de uniformByUid', () {
      final teamUniformCategory = makeCategory(
        entryFee: 210,
        teamSize: 3,
        uniformType: 'top_only',
        uniformSizeOptionsTop: const ['P', 'M', 'G'],
      );
      final pending = build(
        makeRegistration(
          teamSize: 3,
          partnerPending: true,
          category: teamUniformCategory,
        ),
      )!;
      final saved = build(
        makeRegistration(
          teamSize: 3,
          partnerPending: true,
          uniformByUid: const {
            kMe: TournamentUniformSelection(sizeTop: 'M'),
          },
          category: teamUniformCategory,
        ),
      )!;

      expect(pending.steps[2].caption, 'Pendente');
      expect(saved.steps[2].caption, 'Salvo');
      expect(saved.steps[1].label, 'Equipe');
    });
  });

  group('buildInProgressRegistrations', () {
    test('descarta torneio cancelado e categoria não resolvida', () {
      final result = buildInProgressRegistrations(
        [
          makeRegistration(registrationId: 'r-ativa'),
          makeRegistration(
            registrationId: 'r-cancelada',
            tournamentIsCancelled: true,
          ),
          makeRegistration(
            registrationId: 'r-sem-categoria',
            categoryResolved: false,
          ),
        ],
        myUid: kMe,
        myName: 'Marcelo Souza',
      );

      expect(result.map((r) => r.registrationId).toList(), ['r-ativa']);
    });

    test('ordena pelo início mais próximo; sem data vai pro fim', () {
      final result = buildInProgressRegistrations(
        [
          makeRegistration(registrationId: 'r-sem-data'),
          makeRegistration(
            registrationId: 'r-tarde',
            startDate: DateTime(2026, 9, 1),
          ),
          makeRegistration(
            registrationId: 'r-cedo',
            startDate: DateTime(2026, 8, 1),
          ),
        ],
        myUid: kMe,
        myName: 'Marcelo Souza',
      );

      expect(
        result.map((r) => r.registrationId).toList(),
        ['r-cedo', 'r-tarde', 'r-sem-data'],
      );
    });

    test('usa partnerNameByUid pra montar "Meu & Parceiro"', () {
      final result = buildInProgressRegistrations(
        [
          makeRegistration(
            partnerPending: false,
            participantUids: const [kMe, kPartner],
          ),
        ],
        myUid: kMe,
        myName: 'Marcelo Souza',
        partnerNameByUid: const {kPartner: 'Bruno Viana'},
      );

      expect(result.single.steps[1].caption, 'Marcelo & Bruno');
    });

    test('parceiro fora do mapa de nomes cai em Dupla formada', () {
      final result = buildInProgressRegistrations(
        [
          makeRegistration(
            partnerPending: false,
            participantUids: const [kMe, kPartner],
          ),
        ],
        myUid: kMe,
        myName: 'Marcelo Souza',
      );

      expect(result.single.steps[1].caption, 'Dupla formada');
    });
  });

  group('partnerUidsOf', () {
    test('devolve os uids dos parceiros sem o meu e sem repetir', () {
      final uids = partnerUidsOf(
        [
          makeRegistration(participantUids: const [kMe, kPartner]),
          makeRegistration(participantUids: const [kPartner, kMe]),
          makeRegistration(participantUids: const [kMe]),
        ],
        kMe,
      );

      expect(uids, [kPartner]);
    });
  });
}
