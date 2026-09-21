import '../../../core/profiles/app_user_profile.dart';
import '../data/tournament_inscriptions_repository.dart';
import 'tournament_discovery_models.dart';

/// Inscrição confirmada pro roster público: paga, fora da fila e com elenco
/// fechado. É a mesma regra que o painel usa pra “confirmada” e que a chave
/// exige pra gerar jogo — reserva solo ou waitlist não entra na lista.
bool isConfirmedTournamentInscription(Map<String, dynamic> inscription) {
  return inscription['isPaid'] == true &&
      inscription['waitlist'] != true &&
      inscription['partnerPending'] != true;
}

/// Uids do elenco da inscrição, em ordem estável.
///
/// União dos mesmos lugares que [athleteIsInscriptionMember] consulta:
/// `participantUids` (equipe), slots `player1Id`/`player2Id` do time e o
/// `player1Id` legado da inscrição. Sem isso trio+ sumiria do roster.
List<String> inscriptionMemberUids({
  required Map<String, dynamic> inscription,
  Map<String, dynamic>? team,
}) {
  final ordered = <String>[];
  final seen = <String>{};

  void add(String? raw) {
    final id = raw?.trim() ?? '';
    if (id.isEmpty || !seen.add(id)) return;
    ordered.add(id);
  }

  void addAll(dynamic raw) {
    if (raw is! List) return;
    for (final item in raw) {
      add(item?.toString());
    }
  }

  addAll(inscription['participantUids']);
  if (team != null) {
    add(team['player1Id'] as String?);
    add(team['player2Id'] as String?);
    addAll(team['memberUids']);
  }
  add(inscription['player1Id'] as String?);
  return ordered;
}

/// Membro visível de uma equipe inscrita.
class TournamentEnrolledTeamMember {
  const TournamentEnrolledTeamMember({
    required this.uid,
    required this.name,
    required this.initials,
    this.photoUrl,
  });

  final String uid;
  final String name;
  final String initials;
  final String? photoUrl;
}

/// Equipe (dupla/trio/…) com inscrição confirmada em uma categoria.
class TournamentEnrolledTeam {
  const TournamentEnrolledTeam({
    required this.registrationId,
    required this.teamId,
    required this.displayName,
    required this.members,
    required this.categoryId,
    required this.categoryName,
  });

  final String registrationId;
  final String teamId;
  final String displayName;
  final List<TournamentEnrolledTeamMember> members;
  final String categoryId;
  final String categoryName;
}

TournamentEnrolledTeamMember _memberFromProfile(
  String uid,
  AppUserProfile? profile,
) {
  if (profile == null) {
    return TournamentEnrolledTeamMember(
      uid: uid,
      name: 'Atleta',
      initials: '?',
    );
  }
  final label = appUserDisplayName(profile).trim();
  return TournamentEnrolledTeamMember(
    uid: uid,
    name: label.isEmpty ? 'Atleta' : enrolledAthleteDisplayName(label),
    initials: appUserInitials(profile),
    photoUrl: appUserProfilePhotoUrl(profile),
  );
}

/// Até duas palavras do nome — "Ana Paula Silva" → "Ana Paula".
///
/// Na lista de equipes o sobrenome completo estoura a linha; duas palavras
/// bastam pra reconhecer o atleta sem truncar no meio da palavra.
String enrolledAthleteDisplayName(String fullName) {
  final parts = fullName
      .trim()
      .split(RegExp(r'\s+'))
      .where((p) => p.isNotEmpty)
      .toList(growable: false);
  if (parts.isEmpty) return 'Atleta';
  if (parts.length == 1) return parts.first;
  return '${parts[0]} ${parts[1]}';
}

/// Nome da equipe: custom/teamName do doc, senão "Nome1 / Nome2 / …".
String enrolledTeamDisplayName({
  required Map<String, dynamic> inscription,
  Map<String, dynamic>? team,
  required List<TournamentEnrolledTeamMember> members,
}) {
  for (final key in const ['customTeamName', 'teamName', 'name']) {
    final raw = (inscription[key] as String?)?.trim() ??
        (team?[key] as String?)?.trim();
    if (raw != null && raw.isNotEmpty) return raw;
  }
  final names = members
      .map((m) => m.name.trim())
      .where((n) => n.isNotEmpty && n != 'Atleta')
      .toList(growable: false);
  if (names.isEmpty) return 'Equipe';
  return names.join(' / ');
}

/// Monta uma linha por inscrição confirmada (a vaga = a equipe).
List<TournamentEnrolledTeam> buildTournamentEnrolledTeams({
  required List<OrganizerInscriptionWithTeam> rows,
  required Map<String, AppUserProfile> profiles,
  required List<TournamentCategoryOffer> categories,
}) {
  final categoryNameById = <String, String>{
    for (final c in categories)
      if (c.id.trim().isNotEmpty)
        c.id.trim(): c.name.trim().isEmpty ? c.id : c.name,
  };

  final teams = <TournamentEnrolledTeam>[];
  for (final row in rows) {
    if (!isConfirmedTournamentInscription(row.inscription)) continue;
    final categoryId =
        (row.inscription['categoryId'] as String?)?.trim() ?? '';
    if (categoryId.isEmpty) continue;

    final memberUids = inscriptionMemberUids(
      inscription: row.inscription,
      team: row.team,
    );
    if (memberUids.isEmpty) continue;

    final members = [
      for (final uid in memberUids) _memberFromProfile(uid, profiles[uid]),
    ];
    final teamId = (row.inscription['teamId'] as String?)?.trim() ??
        (row.team?['id'] as String?)?.trim() ??
        '';

    teams.add(
      TournamentEnrolledTeam(
        registrationId: row.registrationId,
        teamId: teamId,
        displayName: enrolledTeamDisplayName(
          inscription: row.inscription,
          team: row.team,
          members: members,
        ),
        members: members,
        categoryId: categoryId,
        categoryName: categoryNameById[categoryId] ?? categoryId,
      ),
    );
  }

  teams.sort((a, b) {
    final byCategory =
        a.categoryName.toLowerCase().compareTo(b.categoryName.toLowerCase());
    if (byCategory != 0) return byCategory;
    return a.displayName.toLowerCase().compareTo(b.displayName.toLowerCase());
  });
  return teams;
}

/// Filtra equipes pela categoria (`null` / vazio = todas).
List<TournamentEnrolledTeam> filterEnrolledTeamsByCategory(
  List<TournamentEnrolledTeam> teams,
  String? categoryId,
) {
  final id = categoryId?.trim() ?? '';
  if (id.isEmpty) return teams;
  return teams.where((t) => t.categoryId == id).toList(growable: false);
}

/// Agrupa equipes por categoria, na ordem já ordenada da lista.
List<({String categoryId, String categoryName, List<TournamentEnrolledTeam> teams})>
    groupEnrolledTeamsByCategory(List<TournamentEnrolledTeam> teams) {
  final groups =
      <({String categoryId, String categoryName, List<TournamentEnrolledTeam> teams})>[];
  for (final team in teams) {
    if (groups.isNotEmpty && groups.last.categoryId == team.categoryId) {
      groups.last.teams.add(team);
    } else {
      groups.add((
        categoryId: team.categoryId,
        categoryName: team.categoryName,
        teams: <TournamentEnrolledTeam>[team],
      ));
    }
  }
  return groups;
}
