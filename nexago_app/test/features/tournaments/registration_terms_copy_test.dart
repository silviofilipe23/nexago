import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/registration_terms_copy.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';

TournamentCategoryOffer categoria({int? teamSize}) => TournamentCategoryOffer(
      id: 'c1',
      name: 'Masc. Intermediário',
      entryFee: 220,
      teamSize: teamSize,
    );

void main() {
  test('dupla obrigatória: não oferece seguir sem parceiro', () {
    final copy = registrationTermsCopy(
      category: categoria(),
      requireFormedPair: true,
      hasReceivedInvite: false,
    );

    expect(copy.eyebrow, 'DUPLA OBRIGATÓRIA');
    expect(copy.title, 'Este torneio só aceita inscrição com dupla');
    expect(copy.ctaLabel, 'Definir meu parceiro');
    expect(copy.allowsSolo, isFalse);
  });

  test('dupla com reserva solo: oferece guardar a vaga sozinho', () {
    final copy = registrationTermsCopy(
      category: categoria(),
      requireFormedPair: false,
      hasReceivedInvite: false,
    );

    expect(copy.allowsSolo, isTrue);
    expect(copy.ctaLabel, 'Escolher meu parceiro');
    expect(copy.secondaryLabel, 'Guardar minha vaga sem parceiro');
  });

  test('equipe trio+: fala em elenco, não em dupla', () {
    final copy = registrationTermsCopy(
      category: categoria(teamSize: 4),
      requireFormedPair: false,
      hasReceivedInvite: false,
    );

    expect(copy.title, 'Esta categoria é disputada em equipe de 4');
    expect(copy.ctaLabel, 'Montar meu elenco');
    expect(copy.allowsSolo, isFalse);
  });

  test('convite recebido: a tela vira o aceite', () {
    final copy = registrationTermsCopy(
      category: categoria(),
      requireFormedPair: true,
      hasReceivedInvite: true,
      inviterName: 'Bia Souza',
    );

    expect(copy.eyebrow, 'CONVITE RECEBIDO');
    expect(copy.title, 'Bia Souza quer jogar com você');
    expect(copy.ctaLabel, 'Aceitar convite');
  });
}
