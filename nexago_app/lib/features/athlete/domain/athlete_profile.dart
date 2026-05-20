import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

/// Perfil do atleta em `athletes/{id}` (id = UID do Firebase Auth).
class AthleteProfile {
  const AthleteProfile({
    required this.id,
    required this.name,
    this.avatarUrl,
    this.coverPhotoUrl,
    required this.sport,
    required this.level,
    required this.city,
    this.phoneNumber,
    this.cpfCnpj,
    this.bio,
    this.useBiometric = false,
  });

  final String id;
  final String name;
  final String? avatarUrl;

  /// Imagem larga de capa no topo do perfil (URL pública, ex. Storage).
  final String? coverPhotoUrl;
  final String sport;
  final String level;
  final String city;
  final String? phoneNumber;

  /// CPF/CNPJ (somente dígitos) para pagamentos PIX via Asaas.
  final String? cpfCnpj;
  final String? bio;

  /// Proteção ao abrir o app com Face ID / biometria (persistido em `users/{uid}`).
  final bool useBiometric;

  /// Rascunho a partir do usuário autenticado (documento ainda inexistente no Firestore).
  factory AthleteProfile.draft(User user) {
    final email = user.email;
    final fallbackName = email != null && email.contains('@')
        ? email.split('@').first
        : 'Atleta';
    return AthleteProfile(
      id: user.uid,
      name: user.displayName?.trim().isNotEmpty == true
          ? user.displayName!.trim()
          : fallbackName,
      avatarUrl: user.photoURL,
      coverPhotoUrl: null,
      sport: '',
      level: '',
      city: '',
      phoneNumber: user.phoneNumber,
      bio: null,
      useBiometric: false,
    );
  }

  factory AthleteProfile.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data() ?? {};
    final profilePhotoUrl = (data['profilePhotoUrl'] as String?)?.trim();
    final avatarUrl = (data['avatarUrl'] as String?)?.trim();
    final resolvedPhotoUrl = (profilePhotoUrl != null && profilePhotoUrl.isNotEmpty)
        ? profilePhotoUrl
        : ((avatarUrl != null && avatarUrl.isNotEmpty) ? avatarUrl : null);
    final coverPhotoUrl = (data['coverPhotoUrl'] as String?)?.trim();
    return AthleteProfile(
      id: doc.id,
      name: (data['name'] as String?)?.trim() ?? '',
      avatarUrl: resolvedPhotoUrl,
      coverPhotoUrl:
          (coverPhotoUrl != null && coverPhotoUrl.isNotEmpty) ? coverPhotoUrl : null,
      sport: (data['sport'] as String?)?.trim() ?? '',
      level: (data['level'] as String?)?.trim() ?? '',
      city: (data['city'] as String?)?.trim() ?? '',
      phoneNumber: (data['phoneNumber'] as String?)?.trim().isNotEmpty == true
          ? data['phoneNumber'] as String
          : null,
      cpfCnpj: _digitsOnly(
        (data['cpfCnpj'] as String?) ?? (data['cpf'] as String?),
      ),
      bio: (data['bio'] as String?)?.trim().isNotEmpty == true
          ? data['bio'] as String
          : null,
      useBiometric: data['useBiometric'] == true,
    );
  }

  static String? _digitsOnly(String? raw) {
    if (raw == null) return null;
    final d = raw.replaceAll(RegExp(r'\D'), '');
    if (d.length == 11 || d.length == 14) return d;
    return null;
  }

  Map<String, dynamic> toFirestore() {
    return <String, dynamic>{
      'name': name,
      'sport': sport,
      'level': level,
      'city': city,
      'useBiometric': useBiometric,
      if (avatarUrl != null && avatarUrl!.isNotEmpty)
        'profilePhotoUrl': avatarUrl!.trim(),
      if (phoneNumber != null && phoneNumber!.trim().isNotEmpty)
        'phoneNumber': phoneNumber!.trim(),
      if (avatarUrl != null && avatarUrl!.isNotEmpty) 'avatarUrl': avatarUrl,
      if (bio != null && bio!.trim().isNotEmpty) 'bio': bio!.trim(),
      if (coverPhotoUrl != null && coverPhotoUrl!.trim().isNotEmpty)
        'coverPhotoUrl': coverPhotoUrl!.trim(),
    };
  }

  AthleteProfile copyWith({
    String? name,
    String? avatarUrl,
    String? coverPhotoUrl,
    String? sport,
    String? level,
    String? city,
    String? phoneNumber,
    String? cpfCnpj,
    String? bio,
    bool? useBiometric,
    bool clearAvatar = false,
    bool clearCoverPhoto = false,
    bool clearPhone = false,
    bool clearBio = false,
  }) {
    return AthleteProfile(
      id: id,
      name: name ?? this.name,
      avatarUrl: clearAvatar ? null : (avatarUrl ?? this.avatarUrl),
      coverPhotoUrl: clearCoverPhoto
          ? null
          : (coverPhotoUrl ?? this.coverPhotoUrl),
      sport: sport ?? this.sport,
      level: level ?? this.level,
      city: city ?? this.city,
      phoneNumber: clearPhone ? null : (phoneNumber ?? this.phoneNumber),
      cpfCnpj: cpfCnpj ?? this.cpfCnpj,
      bio: clearBio ? null : (bio ?? this.bio),
      useBiometric: useBiometric ?? this.useBiometric,
    );
  }
}
