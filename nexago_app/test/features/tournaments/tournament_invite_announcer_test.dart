import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_invite_announcer.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_partner_invite.dart';

/// Regras do anúncio automático do convite (a tela que abre ao entrar no app).
///
/// Puras de propósito: quem decide O QUE anunciar e QUANDO parar de anunciar é
/// este módulo; o widget só orquestra store e navegação.
void main() {
  final sessionStart = DateTime.utc(2026, 8, 19, 10, 0);

  TournamentPartnerInvite invite(
    String id, {
    DateTime? createdAt,
    bool hasCreatedAt = true,
    String status = 'pending',
    DateTime? expiresAt,
  }) {
    return TournamentPartnerInvite(
      id: id,
      tournamentId: 't1',
      categoryId: 'c1',
      inviterUid: 'u1',
      inviterName: 'Bia',
      inviteeUid: 'u2',
      inviteeName: 'Léo',
      status: status,
      createdAt: createdAt ?? sessionStart.subtract(const Duration(hours: 1)),
      hasCreatedAt: hasCreatedAt,
      expiresAt: expiresAt ?? sessionStart.add(const Duration(hours: 20)),
    );
  }

  group('nextInviteToAnnounce', () {
    test('sem convite pendente não anuncia nada', () {
      expect(
        nextInviteToAnnounce(
          pending: const [],
          announced: const {},
          sessionStartedAt: sessionStart,
        ),
        isNull,
      );
    });

    test('anuncia o convite que já existia quando o app abriu', () {
      final result = nextInviteToAnnounce(
        pending: [invite('a')],
        announced: const {},
        sessionStartedAt: sessionStart,
      );

      expect(result?.id, 'a');
    });

    // Uma vez por sessão, não uma vez por convite: respondeu ou adiou, não
    // volta a abrir nesta sessão do app.
    test('convite já anunciado nesta sessão não volta', () {
      expect(
        nextInviteToAnnounce(
          pending: [invite('a')],
          announced: const {'a'},
          sessionStartedAt: sessionStart,
        ),
        isNull,
      );
    });

    // O listener é ao vivo: sem este corte, um convite chegando no meio de um
    // pagamento abriria uma tela por cima dele. Convite novo acende o badge e
    // o card; a tela dele é na próxima entrada.
    test('convite que chegou depois da abertura não interrompe a sessão', () {
      expect(
        nextInviteToAnnounce(
          pending: [
            invite('novo', createdAt: sessionStart.add(const Duration(minutes: 5))),
          ],
          announced: const {},
          sessionStartedAt: sessionStart,
        ),
        isNull,
      );
    });

    test('o mais antigo vem primeiro — é o que está mais perto de expirar', () {
      final result = nextInviteToAnnounce(
        pending: [
          invite('novo', createdAt: sessionStart.subtract(const Duration(minutes: 10))),
          invite('velho', createdAt: sessionStart.subtract(const Duration(days: 1))),
        ],
        announced: const {},
        sessionStartedAt: sessionStart,
      );

      expect(result?.id, 'velho');
    });

    // Doc sem `createdAt` não é convite recém-criado — engolir para sempre
    // seria pior que anunciar.
    test('convite sem createdAt conta como antigo', () {
      final result = nextInviteToAnnounce(
        pending: [
          invite(
            'sem-data',
            createdAt: sessionStart.add(const Duration(hours: 2)),
            hasCreatedAt: false,
          ),
        ],
        announced: const {},
        sessionStartedAt: sessionStart,
      );

      expect(result?.id, 'sem-data');
    });

    test('convite expirado não é anunciado', () {
      expect(
        nextInviteToAnnounce(
          pending: [
            invite('a', expiresAt: sessionStart.subtract(const Duration(hours: 1))),
          ],
          announced: const {},
          sessionStartedAt: sessionStart,
        ),
        isNull,
      );
    });

    test('convite já respondido não é anunciado', () {
      expect(
        nextInviteToAnnounce(
          pending: [invite('a', status: 'declined')],
          announced: const {},
          sessionStartedAt: sessionStart,
        ),
        isNull,
      );
    });
  });

  group('inviteAnnouncementTitle', () {
    test('dupla', () {
      expect(inviteAnnouncementTitle(invite('a')), 'Bia te chamou pra dupla');
    });

    test('equipe nomeada usa o nome da equipe', () {
      final teamInvite = TournamentPartnerInvite(
        id: 'a',
        tournamentId: 't1',
        categoryId: 'c1',
        inviterUid: 'u1',
        inviterName: 'Bia',
        inviteeUid: 'u2',
        inviteeName: 'Léo',
        status: 'pending',
        createdAt: sessionStart,
        expiresAt: sessionStart.add(const Duration(hours: 20)),
        isTeamInvite: true,
        teamName: 'Areia Quente',
      );

      expect(
        inviteAnnouncementTitle(teamInvite),
        'Bia te chamou pra equipe Areia Quente',
      );
    });

    test('equipe sem nome ainda fala de equipe', () {
      final teamInvite = TournamentPartnerInvite(
        id: 'a',
        tournamentId: 't1',
        categoryId: 'c1',
        inviterUid: 'u1',
        inviterName: 'Bia',
        inviteeUid: 'u2',
        inviteeName: 'Léo',
        status: 'pending',
        createdAt: sessionStart,
        expiresAt: sessionStart.add(const Duration(hours: 20)),
        isTeamInvite: true,
      );

      expect(inviteAnnouncementTitle(teamInvite), 'Bia te chamou pra equipe');
    });
  });

  // O convite recebido também aparece dentro da tela de inscrição, na
  // categoria em que ele existe — mesmo lugar do portal web.
  group('receivedInviteForCategory', () {
    test('acha o convite da categoria selecionada', () {
      final result = receivedInviteForCategory(
        pending: [invite('a')],
        tournamentId: 't1',
        categoryId: 'c1',
      );

      expect(result?.id, 'a');
    });

    test('ignora convite de outra categoria', () {
      expect(
        receivedInviteForCategory(
          pending: [invite('a')],
          tournamentId: 't1',
          categoryId: 'outra',
        ),
        isNull,
      );
    });

    test('ignora convite de outro torneio', () {
      expect(
        receivedInviteForCategory(
          pending: [invite('a')],
          tournamentId: 'outro',
          categoryId: 'c1',
        ),
        isNull,
      );
    });

    test('ignora convite expirado', () {
      expect(
        receivedInviteForCategory(
          pending: [
            invite('a', expiresAt: sessionStart.subtract(const Duration(days: 1))),
          ],
          tournamentId: 't1',
          categoryId: 'c1',
        ),
        isNull,
      );
    });

    test('sem torneio ou categoria não devolve nada', () {
      expect(
        receivedInviteForCategory(
          pending: [invite('a')],
          tournamentId: '',
          categoryId: 'c1',
        ),
        isNull,
      );
      expect(
        receivedInviteForCategory(
          pending: [invite('a')],
          tournamentId: 't1',
          categoryId: '',
        ),
        isNull,
      );
    });
  });

  // O atleta pode convidar mais de uma pessoa: o primeiro aceite derruba os
  // demais no backend, mas até lá todos precisam aparecer com "cancelar".
  group('sentPendingInvitesFor', () {
    test('lista os convites pendentes da categoria', () {
      final result = sentPendingInvitesFor(
        invites: [invite('a'), invite('b')],
        tournamentId: 't1',
        categoryId: 'c1',
      );

      expect(result.map((i) => i.id), ['a', 'b']);
    });

    test('ordena do mais antigo pro mais novo', () {
      final result = sentPendingInvitesFor(
        invites: [
          invite('novo', createdAt: sessionStart),
          invite('velho', createdAt: sessionStart.subtract(const Duration(days: 2))),
        ],
        tournamentId: 't1',
        categoryId: 'c1',
      );

      expect(result.map((i) => i.id), ['velho', 'novo']);
    });

    test('ignora aceitos, expirados e de outra categoria', () {
      final result = sentPendingInvitesFor(
        invites: [
          invite('aceito', status: 'accepted'),
          invite('expirado', expiresAt: sessionStart.subtract(const Duration(days: 1))),
          invite('ok'),
        ],
        tournamentId: 't1',
        categoryId: 'c1',
      );

      expect(result.map((i) => i.id), ['ok']);
    });

    test('o convite em destaque sai da lista', () {
      final result = sentPendingInvitesFor(
        invites: [invite('a'), invite('b')],
        tournamentId: 't1',
        categoryId: 'c1',
        excludeInviteId: 'a',
      );

      expect(result.map((i) => i.id), ['b']);
    });
  });
}
