import 'package:cloud_firestore/cloud_firestore.dart';

/// Papéis de staff em `tournaments/{id}/staff/{uid}` — alinhado a
/// `functions/src/tournament-acl.ts` e às rules.
///
/// `eventAdmin` ("administrador", criado em 16/09/2026) opera o evento inteiro
/// mas não vê o caixa nem saca — a fronteira é o servidor (as rules liberam a
/// leitura do caixa só a dono e gestor, e a callable de saque recusa o
/// administrador), então aqui o papel serve para rótulo e para o que a tela
/// oferece.
enum TournamentStaffRole {
  manager('manager', 'Gestor'),
  eventAdmin('eventAdmin', 'Administrador'),
  scorer('scorer', 'Mesário');

  const TournamentStaffRole(this.value, this.label);

  final String value;
  final String label;

  /// Papel a partir do valor gravado no Firestore. Papel ausente ou
  /// desconhecido conta como gestor — mesmo default de `buildStaffMirrorData`
  /// no backend. Divergir daqui criaria tela que mostra uma coisa e servidor
  /// que decide outra.
  static TournamentStaffRole fromValue(String? value) {
    for (final role in TournamentStaffRole.values) {
      if (role.value == value) return role;
    }
    return TournamentStaffRole.manager;
  }

  String get description => switch (this) {
        TournamentStaffRole.scorer => 'Lança placar das partidas',
        TournamentStaffRole.eventAdmin =>
          'Opera inscrições, chaves, agenda e placar — sem acesso ao caixa',
        TournamentStaffRole.manager =>
          'Opera inscrições, chaves, agenda e placar',
      };
}

/// Os números de dinheiro do evento (arrecadação, taxa, repasse líquido)
/// podem aparecer para quem está olhando?
///
/// O administrador do evento organiza tudo e **não vê nada de dinheiro**: nem
/// extrato de repasse, nem total arrecadado. O gestor vê, e é coerente que
/// veja — ele saca desse caixa. O mesário só lança placar.
///
/// **Papel desconhecido conta como "sem dinheiro".** É o caso de
/// `roleLoaded: false`: o espelho `users/{uid}/tournamentStaff` ainda não
/// emitiu. Isso é seguro porque o dono entra por `isOwner`, que sai do
/// `managerId` do documento do torneio e não depende do espelho — e sem o
/// documento do torneio em mão a tela não teria número nenhum para mostrar.
/// Então ninguém que tem direito perde o número por causa desta guarda.
///
/// A alternativa (tratar desconhecido como "pode ver") abria uma janela real:
/// quem atua como organizador nos próprios eventos E é administrador no evento
/// de outra pessoa não passa pelo pré-carregamento do login — a espera do
/// espelho em `post_login_destination.dart` é só para quem não tem papel de
/// organizador. Caindo por link direto ou push numa tela de dinheiro, os
/// primeiros frames mostravam arrecadação e repasse até o primeiro snapshot
/// chegar.
bool tournamentStaffSeesMoney({
  required bool isOwner,
  required bool roleLoaded,
  required TournamentStaffRole? role,
}) {
  if (isOwner) return true;
  if (!roleLoaded) return false;
  return role == TournamentStaffRole.manager;
}

class TournamentStaffMember {
  const TournamentStaffMember({
    required this.uid,
    required this.role,
    required this.status,
    this.displayName = '',
    this.nickname = '',
    this.photoUrl,
    this.addedAt,
  });

  final String uid;
  final TournamentStaffRole role;
  final String status;
  final String displayName;
  final String nickname;
  final String? photoUrl;
  final DateTime? addedAt;

  bool get isActive => status == 'active';

  String get displayLabel {
    if (nickname.trim().isNotEmpty) return nickname.trim();
    if (displayName.trim().isNotEmpty) return displayName.trim();
    return 'Usuário';
  }

  factory TournamentStaffMember.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data() ?? const <String, dynamic>{};
    final addedAt = data['addedAt'];
    return TournamentStaffMember(
      uid: doc.id,
      role: TournamentStaffRole.fromValue(data['role'] as String?),
      status: (data['status'] as String?) ?? 'active',
      displayName: (data['displayName'] as String?) ?? '',
      nickname: (data['nickname'] as String?) ?? '',
      photoUrl: data['photoUrl'] as String?,
      addedAt: addedAt is Timestamp ? addedAt.toDate() : null,
    );
  }
}
