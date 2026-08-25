import 'package:flutter_test/flutter_test.dart';

import 'package:nexago_app/features/tournaments/data/tournament_partner_invite_service.dart';

void main() {
  group('TournamentPartnerInviteSendResult.fromMap', () {
    test('mapa vazio (backend antigo) conta como perfil pronto', () {
      // Retrocompatibilidade: sem os campos novos, o envio se comporta
      // exatamente como antes — nenhum aviso de pendência.
      final result = TournamentPartnerInviteSendResult.fromMap('inv1', {});

      expect(result.inviteId, 'inv1');
      expect(result.inviteeProfileReady, isTrue);
      expect(result.inviteeMissingSteps, isEmpty);
    });

    test('inviteeProfileReady true explicito continua pronto', () {
      final result = TournamentPartnerInviteSendResult.fromMap('inv1', {
        'inviteeProfileReady': true,
        'inviteeMissingSteps': <dynamic>[],
      });

      expect(result.inviteeProfileReady, isTrue);
      expect(result.inviteeMissingSteps, isEmpty);
    });

    test('inviteeProfileReady false traz os passos pendentes', () {
      final result = TournamentPartnerInviteSendResult.fromMap('inv2', {
        'inviteeProfileReady': false,
        'inviteeMissingSteps': ['WhatsApp', 'cidade'],
      });

      expect(result.inviteId, 'inv2');
      expect(result.inviteeProfileReady, isFalse);
      expect(result.inviteeMissingSteps, ['WhatsApp', 'cidade']);
    });

    test('filtra itens nao-String da lista de passos', () {
      final result = TournamentPartnerInviteSendResult.fromMap('inv3', {
        'inviteeProfileReady': false,
        'inviteeMissingSteps': ['WhatsApp', 1, null, true, 'cidade'],
      });

      expect(result.inviteeMissingSteps, ['WhatsApp', 'cidade']);
    });

    test('inviteeMissingSteps com tipo inesperado vira lista vazia', () {
      final result = TournamentPartnerInviteSendResult.fromMap('inv4', {
        'inviteeProfileReady': false,
        'inviteeMissingSteps': 'WhatsApp',
      });

      expect(result.inviteeProfileReady, isFalse);
      expect(result.inviteeMissingSteps, isEmpty);
    });

    test('inviteeProfileReady com tipo inesperado nao bloqueia (so false bloqueia)', () {
      final result = TournamentPartnerInviteSendResult.fromMap('inv5', {
        'inviteeProfileReady': 'false',
      });

      // Apenas o booleano false sinaliza pendência; qualquer outra coisa
      // preserva o comportamento antigo (pronto).
      expect(result.inviteeProfileReady, isTrue);
    });
  });
}
