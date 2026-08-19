import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexago_app/core/auth/auth_providers.dart';

/// Estado do anúncio automático de convite, vivo enquanto o app estiver aberto.
///
/// "Uma vez por sessão" aqui é a sessão do app (equivalente ao `sessionStorage`
/// do portal web): fechar e reabrir anuncia de novo, enquanto o convite seguir
/// pendente. Chaveado por uid porque trocar de conta é sessão nova para quem
/// entrou.
class InviteAnnouncementSession {
  InviteAnnouncementSession({DateTime? startedAt})
      : startedAt = startedAt ?? DateTime.now();

  /// Momento em que o app abriu — corta os convites que chegaram depois, para
  /// não abrir tela por cima de algo que o atleta está fazendo.
  final DateTime startedAt;

  final Map<String, Set<String>> _announcedByUid = <String, Set<String>>{};

  Set<String> announcedFor(String uid) =>
      _announcedByUid[uid] ?? const <String>{};

  void markAnnounced(String uid, String inviteId) {
    if (uid.isEmpty || inviteId.isEmpty) return;
    (_announcedByUid[uid] ??= <String>{}).add(inviteId);
  }
}

final inviteAnnouncementSessionProvider = Provider<InviteAnnouncementSession>(
  (ref) => InviteAnnouncementSession(),
);

/// uid do atleta logado, isolado de `authProvider` para dar um ponto de troca
/// em teste — fabricar um `User` do Firebase só para saber o identificador
/// custaria mais que o comportamento sob teste.
final announcerAthleteUidProvider = Provider<String>(
  (ref) => ref.watch(authProvider).valueOrNull?.uid ?? '',
);
