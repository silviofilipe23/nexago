import 'dart:async';
import 'dart:typed_data';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';

import '../../../core/search/search_keywords.dart';
import '../domain/athlete_notification_preferences.dart';
import '../domain/athlete_privacy_preferences.dart';
import '../domain/athlete_discover_logic.dart';
import '../domain/athlete_profile.dart';
import '../domain/athlete_profile_options.dart';
import '../domain/profile_access.dart';
import '../domain/profile_completion_models.dart';

/// Limites de rede do "Concluir cadastro". Sem eles o atleta fica
/// "processando" sem fim: o SDK do Storage insiste por até 10 min numa
/// conexão que caiu, a callable espera 60 s e o Firestore enfileira a escrita
/// offline para sempre. Quem estoura cai na tela com mensagem de rede e o
/// atleta tenta de novo (sem subir a foto outra vez).
const Duration kAvatarUploadTimeout = Duration(seconds: 60);

/// A callable `grantAthleteRole` sofre cold start em quase todo cadastro
/// (5–16 s medidos em campo); 25 s cobre isso com folga numa rede normal.
const Duration kAthleteRoleGrantTimeout = Duration(seconds: 25);

const Duration kProfileSaveTimeout = Duration(seconds: 20);

class AthleteProfileRepository {
  AthleteProfileRepository(this._firestore, {FirebaseFunctions? functions})
      : _functions = functions ?? FirebaseFunctions.instance;

  final FirebaseFirestore _firestore;
  final FirebaseFunctions _functions;

  CollectionReference<Map<String, dynamic>> get _users =>
      _firestore.collection('users');

  Stream<AthleteProfile?> watchProfile(String uid) {
    return _users.doc(uid).snapshots().map((snap) {
      if (!snap.exists || snap.data() == null) return null;
      return AthleteProfile.fromFirestore(snap);
    });
  }

  Future<void> saveProfile(AthleteProfile profile) async {
    final docRef = _users.doc(profile.id);
    final snap = await docRef.get().timeout(kProfileSaveTimeout);
    final exists = snap.exists;

    final stepsComplete = ProfileCompletionState.fromProfile(profile).allComplete;
    final tournamentReady = isTournamentProfileReady(profile);
    final data = <String, dynamic>{
      ...profile.toFirestore(),
      'city': profile.city.trim(),
      'updatedAt': FieldValue.serverTimestamp(),
    };
    // Selo de SMS torna `phoneNumber` imutável pelo client (`firestore.rules`).
    // O rascunho local pode não saber do selo (o atleta verificou e reiniciou o
    // cadastro): mandar o número junto faria as rules recusarem o save INTEIRO
    // com `permission-denied`, não só a parte do telefone.
    if (snap.data()?['phoneVerified'] == true) {
      data.remove('phoneNumber');
    }
    data.remove('isProfileComplete');
    if (stepsComplete || profile.isProfileComplete || tournamentReady) {
      data['isProfileComplete'] = true;
    }
    if (stepsComplete || tournamentReady) {
      data['onboardingCompleted'] = true;
    }

    final stateTrim = profile.state?.trim() ?? '';
    if (stateTrim.isNotEmpty) {
      data['state'] = stateTrim.toUpperCase();
    } else if (exists) {
      data['state'] = FieldValue.delete();
    }

    final nicknameTrim = profile.nickname?.trim() ?? '';
    if (nicknameTrim.isNotEmpty) {
      data['nickname'] = nicknameTrim;
    } else if (exists) {
      data['nickname'] = FieldValue.delete();
    }

    final authUser = FirebaseAuth.instance.currentUser;
    if (authUser != null && authUser.uid == profile.id) {
      final email = authUser.email?.trim();
      if (email != null && email.isNotEmpty) {
        data['email'] = email;
      }
    }

    // Garante papel de atleta em todo save (não só na criação), senão
    // contas que já existiam antes desse campo ficam de fora de queries
    // por `roles`/`hasAthleteRole` para sempre.
    //
    // IMPORTANTE: as rules do Firestore só permitem `update` em
    // `users/{uid}` quando `roles` (se presente no payload) é IDÊNTICO ao
    // valor já salvo — só uma Cloud Function via Admin SDK pode alterar
    // `roles` (anti-privilege-escalation). Por isso `roles` NUNCA é
    // incluído no payload enviado ao Firestore aqui: quando falta o papel
    // de atleta, delegamos para a callable `grantAthleteRole` (idempotente,
    // faz a união preservando os papéis existentes e espelha via Admin
    // SDK). `existingRoles`/`effectiveRoles` abaixo são só em memória, para
    // derivar `hasAthleteRole`/`hasOrganizerRole`/`keywords` localmente.
    final existingRolesRaw = exists ? (snap.data()?['roles']) : null;
    final existingRoles = existingRolesRaw is List
        ? existingRolesRaw.whereType<String>().toSet()
        : <String>{};
    if (!existingRoles.contains('athlete')) {
      await grantAthleteRole();
    }
    final effectiveRoles = <String>{...existingRoles, 'athlete'};

    final searchFields = buildUserSearchFields(<String, dynamic>{
      ...data,
      'roles': effectiveRoles.toList(),
    });
    data['keywords'] = searchFields.keywords;
    data['hasAthleteRole'] = searchFields.hasAthleteRole;
    data['hasOrganizerRole'] = searchFields.hasOrganizerRole;

    data['discoverSportIds'] = discoverSportIdsForProfile(profile);
    data['lookingForPartner'] = profile.lookingForPartner;
    if (profile.gameObjective != null && profile.gameObjective!.trim().isNotEmpty) {
      data['gameObjective'] = profile.gameObjective!.trim();
    } else if (exists) {
      data['gameObjective'] = FieldValue.delete();
    }

    final normalizedGender = _normalizedGenderForFirestore(profile.gender);
    if (normalizedGender != null) {
      data['gender'] = normalizedGender;
    } else if (exists) {
      data['gender'] = FieldValue.delete();
    }

    // FieldValue.delete() em documento inexistente falha no Firestore.
    final cover = profile.coverPhotoUrl?.trim();
    if (exists && (cover == null || cover.isEmpty)) {
      data['coverPhotoUrl'] = FieldValue.delete();
    }

    if (exists) {
      _preserveAthleteLevelsOnUpdate(
        data: data,
        existing: snap.data() ?? <String, dynamic>{},
      );
    }

    await docRef.set(data, SetOptions(merge: true)).timeout(kProfileSaveTimeout);
  }

  Future<void> saveNotificationPreferences({
    required String uid,
    required AthleteNotificationPreferences preferences,
  }) async {
    await _users.doc(uid).set(
      <String, dynamic>{
        'notificationPreferences': preferences.toFirestore(),
        'updatedAt': FieldValue.serverTimestamp(),
      },
      SetOptions(merge: true),
    );
  }

  Future<void> savePrivacyPreferences({
    required String uid,
    required AthletePrivacyPreferences preferences,
  }) async {
    await _users.doc(uid).set(
      <String, dynamic>{
        'privacyPreferences': preferences.toFirestore(),
        'publicProfileEnabled': preferences.publicProfileEnabled,
        'updatedAt': FieldValue.serverTimestamp(),
      },
      SetOptions(merge: true),
    );
  }

  /// Opt-in de comunicações de marketing, dado na tela de consentimento da
  /// inscrição.
  ///
  /// É consentimento de PLATAFORMA, não do torneio — por isso mora no perfil e
  /// não na inscrição (o aceite do termo do evento continua sendo
  /// `lgpdAccepted`, carimbado pela callable em `lgpdAcceptedUids`).
  ///
  /// O campo é gravado pelo próprio dono: a regra de update de `users` é uma
  /// lista de PROIBIÇÕES (roles, superAdmin, reputation, sandRank, referredBy,
  /// phoneVerified, níveis), não um allow-list — campo novo do dono passa. Ele
  /// também não está em `PUBLIC_PROFILE_FIELDS`, então não vai para o espelho
  /// público.
  Future<void> saveMarketingOptIn({
    required String uid,
    required bool optIn,
  }) async {
    await _users.doc(uid).set(
      <String, dynamic>{
        'marketingOptIn': optIn,
        'updatedAt': FieldValue.serverTimestamp(),
      },
      SetOptions(merge: true),
    );
  }

  Stream<List<Map<String, dynamic>>> watchUserTokens(String uid) {
    return _users
        .doc(uid)
        .collection('tokens')
        .snapshots()
        .map((snap) => snap.docs.map((d) => {...d.data(), 'id': d.id}).toList());
  }

  Future<void> deleteUserToken({
    required String uid,
    required String tokenId,
  }) async {
    await _users.doc(uid).collection('tokens').doc(tokenId).delete();
  }

  /// Concede o papel de atleta (claim no token + `users.roles`) pela callable
  /// `grantAthleteRole` — idempotente no servidor e nunca reduz acesso. `async`
  /// de propósito: qualquer falha vira erro do Future, nunca lançamento
  /// síncrono, para quem roda isto em paralelo com outra coisa.
  Future<void> grantAthleteRole({Duration? timeout}) async {
    await _functions
        .httpsCallable(
          'grantAthleteRole',
          options: HttpsCallableOptions(
            timeout: timeout ?? kAthleteRoleGrantTimeout,
          ),
        )
        .call<void>();
  }

  /// Upload em `profiles/{uid}/avatar.jpg` (regras do Storage) e retorna a URL.
  ///
  /// Estourado o [timeout], a tarefa é cancelada de verdade — senão o SDK
  /// continua tentando por até 10 minutos por baixo e um novo upload da mesma
  /// foto disputa o mesmo caminho.
  Future<String> uploadAvatar({
    required String uid,
    required Uint8List bytes,
    required String contentType,
    Duration? timeout,
  }) async {
    final limit = timeout ?? kAvatarUploadTimeout;
    final ref = FirebaseStorage.instance
        .ref()
        .child('profiles')
        .child(uid)
        .child('avatar.jpg');
    final task = ref.putData(
      bytes,
      SettableMetadata(contentType: contentType),
    );
    try {
      await task.timeout(limit);
    } on TimeoutException {
      unawaited(task.cancel());
      rethrow;
    }
    return ref.getDownloadURL().timeout(limit);
  }

  /// Upload em `profiles/{uid}/cover.jpg` e retorna a URL de download.
  Future<String> uploadCoverPhoto({
    required String uid,
    required Uint8List bytes,
    required String contentType,
  }) async {
    final ref = FirebaseStorage.instance
        .ref()
        .child('profiles')
        .child(uid)
        .child('cover.jpg');
    await ref.putData(
      bytes,
      SettableMetadata(contentType: contentType),
    );
    return ref.getDownloadURL();
  }

  /// Upload de uma foto de destaque em
  /// `profiles/{uid}/highlights/{photoId}.jpg` e retorna a URL de download.
  /// [photoId] deve ser único por foto (não reaproveitar entre fotos
  /// diferentes da mesma galeria).
  Future<String> uploadHighlightPhoto({
    required String uid,
    required String photoId,
    required Uint8List bytes,
    required String contentType,
  }) async {
    final ref = FirebaseStorage.instance
        .ref()
        .child('profiles')
        .child(uid)
        .child('highlights')
        .child('$photoId.jpg');
    await ref.putData(
      bytes,
      SettableMetadata(contentType: contentType),
    );
    return ref.getDownloadURL();
  }

  /// Remove o arquivo de Storage de uma foto de destaque. Melhor esforço:
  /// a URL já sai de `highlightPhotoUrls` via [saveProfile] independentemente
  /// do resultado deste delete (evita bloquear a UI por um arquivo órfão).
  Future<void> removeHighlightPhoto(String url) async {
    try {
      await FirebaseStorage.instance.refFromURL(url).delete();
    } catch (_) {
      // Melhor esforço: URL pode já ter sido removida ou não pertencer
      // mais a este bucket.
    }
  }
}

String? _normalizedGenderForFirestore(String? raw) {
  final trimmed = raw?.trim() ?? '';
  if (trimmed.isEmpty) return null;
  final lower = trimmed.toLowerCase();
  if (lower.startsWith('masc')) return 'Masculino';
  if (lower.startsWith('fem')) return 'Feminino';
  return trimmed;
}

/// Evita que `set(merge)` rebaixe níveis travados e dispare
/// `athleteLevelsNotDowngraded` nas rules.
///
/// Os campos legados `level`/`sportProfile.level` não são mais emitidos pelo
/// `toFirestore` (a escrita canônica é só `sportOnboarding.levelsBySport`);
/// campo AUSENTE no payload já preserva o valor sob merge, então os clamps
/// legados só agem se algum caminho ainda incluir o campo (defesa barata —
/// remover quando os legados aposentarem de vez).
///
/// JANELA DE CORREÇÃO (Task 4, espelho do `sportLevelNotLowered` das rules):
/// o clamp por esporte em `levelsBySport` só entra em ação quando
/// `sportOnboarding.levelLocked.{sportId}` já é `true` no doc EXISTENTE — sem
/// isso o notifier (`AthleteSportsLevelsNotifier.updateLevel`) já decidiu
/// aceitar a descida, e este clamp não pode desfazer essa escolha sob o tapete
/// no save (senão a UI mostraria a descida e o próximo reload reverteria
/// sozinho, sem nenhum aviso).
void _preserveAthleteLevelsOnUpdate({
  required Map<String, dynamic> data,
  required Map<String, dynamic> existing,
}) {
  final existingLevel = existing['level'];
  final requestLevel = data['level'];
  if (requestLevel is String &&
      existingLevel is String &&
      existingLevel.trim().isNotEmpty) {
    final existingRank = AthleteProfileOptions.levelRank(existingLevel);
    final requestRank = AthleteProfileOptions.levelRank(requestLevel);
    if (existingRank != null &&
        (requestRank == null || requestRank < existingRank)) {
      data['level'] = existingLevel;
    }
  }

  final requestSportProfile = data['sportProfile'];
  final existingSportProfile = existing['sportProfile'];
  if (requestSportProfile is Map) {
    if (requestSportProfile.isEmpty) {
      data.remove('sportProfile');
    } else if (existingSportProfile is Map) {
      final existingCode =
          existingSportProfile['level']?.toString().trim() ?? '';
      if (existingCode.isNotEmpty) {
        final existingRank =
            AthleteProfileOptions.levelRank(existingCode) ?? -1;
        final requestCode =
            requestSportProfile['level']?.toString().trim() ?? '';
        final requestRank = requestCode.isEmpty
            ? -1
            : (AthleteProfileOptions.levelRank(requestCode) ?? -1);
        if (requestRank < existingRank) {
          data['sportProfile'] = <String, dynamic>{'level': existingCode};
        }
      }
    }
  }

  final existingOnboarding = existing['sportOnboarding'];
  final requestOnboarding = data['sportOnboarding'];
  if (existingOnboarding is Map && requestOnboarding is Map) {
    final existingLevels = existingOnboarding['levelsBySport'];
    final requestLevels = requestOnboarding['levelsBySport'];
    if (existingLevels is Map && requestLevels is Map) {
      final lockedRaw = existingOnboarding['levelLocked'];
      final lockedMap = lockedRaw is Map ? lockedRaw : const {};
      final merged = Map<String, dynamic>.from(requestLevels);
      for (final entry in existingLevels.entries) {
        final sportId = entry.key.toString();
        // Janela de correção: sem lock para este esporte, a descida é
        // legítima — nada a clampar.
        if (lockedMap[sportId] != true) continue;
        final existingCode = entry.value?.toString().trim() ?? '';
        if (existingCode.isEmpty) continue;
        final existingRank =
            AthleteProfileOptions.levelRank(existingCode) ?? -1;
        final requestCode = merged[sportId]?.toString().trim() ?? '';
        final requestRank = requestCode.isEmpty
            ? -1
            : (AthleteProfileOptions.levelRank(requestCode) ?? -1);
        if (requestRank < existingRank) {
          merged[sportId] = existingCode;
        }
      }
      (requestOnboarding as Map<String, dynamic>)['levelsBySport'] = merged;
    }
  }
}
