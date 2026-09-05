import 'dart:typed_data';
import 'package:nexago_app/core/layout/nexa_app_bar.dart';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/formatting/br_phone_format.dart';
import '../../../core/location/user_location_providers.dart';
import '../../../core/media/profile_image_crop_config.dart';
import '../../../core/media/profile_image_picker.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../domain/athlete_profile.dart';
import '../domain/athlete_profile_options.dart';
import '../domain/athlete_profile_providers.dart';
import '../domain/gamification_providers.dart';
import '../domain/profile_completion_providers.dart';
import '../phone_verification/presentation/phone_verification_field.dart';
import 'widgets/br_state_city_fields.dart';
import 'widgets/edit_profile/edit_profile_account_prefs_group.dart';
import 'widgets/edit_profile/edit_profile_completion_banner.dart';
import 'widgets/edit_profile/edit_profile_dropdown_field.dart';
import 'widgets/edit_profile/edit_profile_field_decorations.dart';
import 'widgets/edit_profile/edit_profile_highlights_section.dart';
import 'widgets/edit_profile/edit_profile_media_header.dart';
import 'widgets/edit_profile/edit_profile_save_bar.dart';
import 'widgets/edit_profile/edit_profile_section_header.dart';
import 'widgets/edit_profile/edit_profile_text_field.dart';

/// Edição do perfil do atleta (Firestore `athletes` + Storage para avatar).
class AthleteEditProfilePage extends ConsumerStatefulWidget {
  const AthleteEditProfilePage({super.key, this.initialFocus});

  /// `photo` | `sport` | `city` | `phone` — scroll ao abrir (fluxo completar perfil).
  final String? initialFocus;

  @override
  ConsumerState<AthleteEditProfilePage> createState() =>
      _AthleteEditProfilePageState();
}

class _AthleteEditProfilePageState
    extends ConsumerState<AthleteEditProfilePage> {
  final _formKey = GlobalKey<FormState>();
  final _avatarSectionKey = GlobalKey();
  final _sportSectionKey = GlobalKey();
  final _phoneSectionKey = GlobalKey();
  final _citySectionKey = GlobalKey();
  final _nameCtrl = TextEditingController();
  final _nicknameCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _bioCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();

  /// WhatsApp de contato. Editável enquanto não verificado — depois do selo o
  /// número só muda por um novo SMS (as rules recusam a troca pelo client).
  String? _phoneNumber;
  bool _phoneVerified = false;

  String? _selectedState;
  String? _selectedCity;

  String _sport = AthleteProfileOptions.sports.first;
  String _level = AthleteProfileOptions.levels.first;

  Uint8List? _pickedBytes;
  String? _pickedContentType;
  String? _existingAvatarUrl;

  /// Foto de perfil já enviada e gravada em `users/{uid}` pelo salvamento
  /// separado (ver [_persistAvatar]). [_pickedBytes] continua em tela como
  /// preview local — sem isso o avatar piscaria com as iniciais enquanto a
  /// nova URL baixa —, mas "Salvar alterações" não deve subir os bytes de novo.
  bool _avatarPersisted = false;

  /// Upload da foto de perfil em andamento.
  bool _savingAvatar = false;

  Uint8List? _pickedCoverBytes;
  String? _pickedCoverContentType;
  String? _existingCoverPhotoUrl;
  bool _removeCoverRequested = false;

  List<String> _highlightUrls = const [];
  final List<ProfilePickedImage> _pendingHighlights = [];

  bool _initialized = false;
  bool _saving = false;
  bool _onboardingCompleted = true;
  List<String> _sports = const [];
  List<String> _goals = const [];
  String? _birthDate;
  String? _gender;

  @override
  void dispose() {
    _nameCtrl.dispose();
    _nicknameCtrl.dispose();
    _emailCtrl.dispose();
    _bioCtrl.dispose();
    _phoneCtrl.dispose();
    super.dispose();
  }

  void _applyProfile(AthleteProfile p) {
    _nameCtrl.text = p.name;
    _nicknameCtrl.text = p.nickname ?? '';
    _phoneNumber = p.phoneNumber;
    _phoneVerified = p.phoneVerified;
    // Número legado que a máscara não entende aparece cru: melhor mostrar o
    // que está salvo do que um campo vazio que o atleta não pediu.
    _phoneCtrl.text = formatPhoneBrDisplay(p.phoneNumber) ?? (p.phoneNumber ?? '');
    _selectedState = p.state;
    _selectedCity = p.city.trim().isEmpty ? null : p.city.trim();
    _bioCtrl.text = p.bio ?? '';
    _existingAvatarUrl = p.avatarUrl;
    _existingCoverPhotoUrl = p.coverPhotoUrl;
    _removeCoverRequested = false;
    _pickedCoverBytes = null;
    _pickedCoverContentType = null;
    _highlightUrls = List<String>.from(p.highlightPhotoUrls);
    _pendingHighlights.clear();
    _sport = _matchOrFirst(AthleteProfileOptions.sports, p.sport);
    _level = _matchOrFirst(
      AthleteProfileOptions.levels,
      AthleteProfileOptions.normalizeLevel(p.level),
    );
    _onboardingCompleted = p.onboardingCompleted;
    _sports = List<String>.from(p.sports);
    _goals = List<String>.from(p.goals);
    _birthDate = p.birthDate;
    _gender = p.gender;
  }

  String _matchOrFirst(List<String> options, String value) {
    final v = value.trim();
    if (v.isEmpty) return options.first;
    for (final e in options) {
      if (e == v) return v;
    }
    return options.first;
  }

  Future<void> _pickAvatar() async {
    final result = await pickProfileImage(
      context: context,
      target: ProfileImageCropTarget.avatar,
    );
    if (result == null || !mounted) return;
    setState(() {
      _pickedBytes = result.bytes;
      _pickedContentType = result.contentType;
      _avatarPersisted = false;
    });
    await _persistAvatar();
  }

  /// Salva a foto de perfil sozinha, assim que o atleta a troca.
  ///
  /// Trocar a foto é uma ação isolada: o atleta não deveria ter que preencher
  /// (nem reenviar) o resto do formulário para a foto nova valer. O que
  /// continua pendente do "Salvar alterações" são só os campos de texto.
  ///
  /// Em qualquer falha os bytes escolhidos permanecem em [_pickedBytes]: o
  /// save do formulário ainda tenta subir a foto, então nada se perde.
  Future<void> _persistAvatar() async {
    final bytes = _pickedBytes;
    final contentType = _pickedContentType;
    if (bytes == null || contentType == null) return;

    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    // Documento inexistente (perfil ainda em rascunho): a criação de
    // `users/{uid}` exige o payload completo com `roles` — deixa para o save
    // do formulário, que passa por `saveProfile`.
    if (ref.read(athleteProfileProvider).valueOrNull == null) return;

    setState(() => _savingAvatar = true);
    try {
      final repo = ref.read(athleteProfileRepositoryProvider);
      final url = await repo.uploadAvatar(
        uid: user.uid,
        bytes: bytes,
        contentType: contentType,
      );
      await repo.saveAvatarPhotoUrl(uid: user.uid, photoUrl: url);
      if (!mounted) return;
      setState(() {
        _existingAvatarUrl = url;
        _avatarPersisted = true;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Foto de perfil atualizada.')),
      );
      try {
        await ref
            .read(gamificationServiceProvider)
            .syncProfileCompletionRewards(userId: user.uid);
      } catch (_) {
        // Foto já salva; gamificação é best-effort (CF pode estar indisponível).
      }
      if (!mounted) return;
      ref.invalidate(gamificationSummaryProvider);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Erro ao salvar a foto: $e')),
      );
    } finally {
      if (mounted) setState(() => _savingAvatar = false);
    }
  }

  Future<void> _pickCoverPhoto() async {
    final result = await pickProfileImage(
      context: context,
      target: ProfileImageCropTarget.cover,
    );
    if (result == null || !mounted) return;
    setState(() {
      _pickedCoverBytes = result.bytes;
      _pickedCoverContentType = result.contentType;
      _removeCoverRequested = false;
    });
  }

  Future<void> _addHighlightPhoto() async {
    final total = _highlightUrls.length + _pendingHighlights.length;
    if (total >= maxHighlightPhotos) return;
    final result = await pickProfileImage(
      context: context,
      target: ProfileImageCropTarget.highlight,
    );
    if (result == null || !mounted) return;
    setState(() => _pendingHighlights.add(result));
  }

  void _removeExistingHighlight(int index) {
    setState(() => _highlightUrls.removeAt(index));
  }

  void _removePendingHighlight(int index) {
    setState(() => _pendingHighlights.removeAt(index));
  }

  void _scrollToFocus() {
    final focus = widget.initialFocus?.trim().toLowerCase();
    if (focus == null || focus.isEmpty) return;
    final key = switch (focus) {
      'photo' => _avatarSectionKey,
      'sport' => _sportSectionKey,
      'city' => _citySectionKey,
      'phone' => _phoneSectionKey,
      _ => null,
    };
    if (key?.currentContext == null) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      Scrollable.ensureVisible(
        key!.currentContext!,
        duration: const Duration(milliseconds: 320),
        curve: Curves.easeOutCubic,
        alignment: 0.1,
      );
    });
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;

    final user = FirebaseAuth.instance.currentUser;
    if (user == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Sessão expirada. Entre novamente.')),
      );
      return;
    }

    setState(() => _saving = true);
    try {
      final repo = ref.read(athleteProfileRepositoryProvider);
      String? avatarUrl = _existingAvatarUrl;

      // `_avatarPersisted`: a foto já subiu e foi gravada em [_persistAvatar];
      // reenviar os mesmos bytes só gastaria rede do atleta.
      if (!_avatarPersisted &&
          _pickedBytes != null &&
          _pickedContentType != null) {
        avatarUrl = await repo.uploadAvatar(
          uid: user.uid,
          bytes: _pickedBytes!,
          contentType: _pickedContentType!,
        );
        _existingAvatarUrl = avatarUrl;
        _avatarPersisted = true;
      }

      String? coverPhotoUrl = _removeCoverRequested
          ? null
          : _existingCoverPhotoUrl;
      if (_pickedCoverBytes != null && _pickedCoverContentType != null) {
        coverPhotoUrl = await repo.uploadCoverPhoto(
          uid: user.uid,
          bytes: _pickedCoverBytes!,
          contentType: _pickedCoverContentType!,
        );
        _existingCoverPhotoUrl = coverPhotoUrl;
        _pickedCoverBytes = null;
        _pickedCoverContentType = null;
        _removeCoverRequested = false;
      }

      for (final pending in _pendingHighlights) {
        final photoId =
            '${DateTime.now().microsecondsSinceEpoch}_${_highlightUrls.length}';
        final url = await repo.uploadHighlightPhoto(
          uid: user.uid,
          photoId: photoId,
          bytes: pending.bytes,
          contentType: pending.contentType,
        );
        _highlightUrls = [..._highlightUrls, url];
      }
      _pendingHighlights.clear();

      final base =
          ref.read(athleteProfileProvider).valueOrNull ??
          AthleteProfile.draft(user);
      final city = _selectedCity?.trim() ?? '';
      final stateRaw = _selectedState?.trim();
      final state = stateRaw != null && stateRaw.isNotEmpty
          ? stateRaw.toUpperCase()
          : null;
      final nicknameTrim = _nicknameCtrl.text.trim();
      final bioRaw = _bioCtrl.text.trim();
      final bio = bioRaw.isEmpty
          ? null
          : (bioRaw.length > 160 ? bioRaw.substring(0, 160) : bioRaw);

      final profile = base.copyWith(
        name: _nameCtrl.text.trim(),
        avatarUrl: avatarUrl,
        coverPhotoUrl: coverPhotoUrl,
        sport: _sport,
        // level intencionalmente não passa por aqui: "nível só sobe",
        // gerenciado apenas em Esportes e níveis.
        // Número declarado vai pro Firestore; o selo `phoneVerified` continua
        // sendo escrito só pela Cloud Function (`toFirestore` filtra).
        phoneNumber: _phoneNumber,
        phoneVerified: _phoneVerified,
        city: city,
        state: state,
        bio: bio,
        sports: _sports,
        goals: _goals,
        nickname: nicknameTrim.isEmpty ? null : nicknameTrim,
        birthDate: _birthDate,
        gender: _gender,
        onboardingCompleted: _onboardingCompleted,
        highlightPhotoUrls: _highlightUrls,
      );

      await repo.saveProfile(profile);
      try {
        await ref
            .read(gamificationServiceProvider)
            .syncProfileCompletionRewards(userId: user.uid, profile: profile);
      } catch (_) {
        // Perfil já foi salvo; gamificação é best-effort (CF pode estar indisponível).
      }

      if (!mounted) return;
      if (widget.initialFocus != null && widget.initialFocus!.isNotEmpty) {
        context.pop();
      } else {
        context.go(AppRoutes.athleteProfileUpdateSuccess);
      }

      ref.invalidate(athleteProfileProvider);
      ref.invalidate(userLocationProvider);
      ref.invalidate(profileCompletionStateProvider);
      ref.invalidate(gamificationSummaryProvider);
    } on FirebaseException catch (e) {
      if (!mounted) return;
      final message = e.code == 'permission-denied'
          ? 'Sem permissão para salvar o perfil. Se você já definiu níveis em Esportes e níveis, não é possível rebaixá-los por aqui.'
          : 'Erro ao salvar: ${e.message ?? e.code}';
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(message)),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Erro ao salvar: $e')));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _popOrBack() {
    if (context.canPop()) {
      context.pop();
    } else {
      context.go(AppRoutes.athleteProfile);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final user = ref.watch(authProvider).valueOrNull;
    final profileAsync = ref.watch(athleteProfileProvider);

    if (user == null) {
      return Scaffold(
        backgroundColor: context.themeColors.canvas,
        appBar: NexaAppBar(
          backgroundColor: context.themeColors.canvas,
          title: Text('Editar perfil'),
        ),
        body: Center(child: Text('Faça login para editar o perfil.')),
      );
    }

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      appBar: _editProfileAppBar(theme),
      body: _buildBody(context, theme, user, profileAsync),
      // Só depois de carregado: sem formulário em tela não há o que salvar.
      bottomNavigationBar: _initialized
          ? EditProfileSaveBar(
              // Bloqueado durante o upload da foto: um save concorrente
              // reenviaria os mesmos bytes para o mesmo caminho do Storage.
              saving: _saving || _savingAvatar,
              onSave: _save,
            )
          : null,
    );
  }

  Widget _buildBody(
    BuildContext context,
    ThemeData theme,
    User user,
    AsyncValue<AthleteProfile?> profileAsync,
  ) {
    if (!_initialized) {
      return profileAsync.when(
        data: (doc) {
          final p = doc ?? AthleteProfile.draft(user);
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (!mounted || _initialized) return;
            setState(() {
              _applyProfile(p);
              _emailCtrl.text = user.email?.trim() ?? '';
              _initialized = true;
            });
            _scrollToFocus();
          });
          return Center(
            child: CircularProgressIndicator(color: AppColors.brand),
          );
        },
        loading: () => Center(
          child: CircularProgressIndicator(color: AppColors.brand),
        ),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              'Não foi possível carregar.\n$e',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyLarge?.copyWith(
                color: context.themeColors.onSurfaceMuted,
              ),
            ),
          ),
        ),
      );
    }

    return AbsorbPointer(
      absorbing: _saving,
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Form(
              key: _formKey,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const EditProfileCompletionBanner(),
                  KeyedSubtree(
                    key: _avatarSectionKey,
                    child: EditProfileMediaHeader(
                      name: _nameCtrl.text,
                      coverRemovedPending: _removeCoverRequested,
                      existingCoverUrl: _pickedCoverBytes == null
                          ? _existingCoverPhotoUrl
                          : null,
                      pickedCoverBytes: _pickedCoverBytes,
                      onEditCover: _pickCoverPhoto,
                      existingAvatarUrl: _pickedBytes == null
                          ? _existingAvatarUrl
                          : null,
                      pickedAvatarBytes: _pickedBytes,
                      onEditAvatar: _pickAvatar,
                      avatarSaving: _savingAvatar,
                    ),
                  ),
                  SizedBox(height: 52),
                  const EditProfileSectionHeader(
                    icon: Icons.badge_outlined,
                    title: 'IDENTIDADE',
                  ),
                  EditProfileTextField(
                    controller: _nameCtrl,
                    label: 'NOME',
                    required: true,
                    textCapitalization: TextCapitalization.words,
                    validator: (v) {
                      if (v == null || v.trim().isEmpty) {
                        return 'Informe seu nome';
                      }
                      return null;
                    },
                    onChanged: (_) => setState(() {}),
                  ),
                  SizedBox(height: 12),
                  EditProfileTextField(
                    controller: _nicknameCtrl,
                    label: 'APELIDO',
                    helperText: 'Como prefere ser chamado',
                    textCapitalization: TextCapitalization.words,
                  ),
                  SizedBox(height: 12),
                  KeyedSubtree(
                    key: _sportSectionKey,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        EditProfileDropdownField<String>(
                          value: _sport,
                          label: 'ESPORTE',
                          required: true,
                          items: AthleteProfileOptions.sports
                              .map(
                                (e) => DropdownMenuItem(
                                  value: e,
                                  child: Text(e),
                                ),
                              )
                              .toList(),
                          onChanged: (v) {
                            if (v == null) return;
                            setState(() => _sport = v);
                          },
                        ),
                        SizedBox(height: 12),
                        InkWell(
                          borderRadius: BorderRadius.circular(14),
                          onTap: () => context.pushNamed(
                            AppRouteNames.athleteSportsLevels,
                          ),
                          child: InputDecorator(
                            decoration: editProfileInputDecoration(
                              context: context,
                              label: 'NÍVEL',
                              suffixIcon: Icon(
                                Icons.lock_outline_rounded,
                                size: 18,
                                color: context.themeColors.onSurfaceMuted,
                              ),
                            ),
                            child: Text(
                              _level,
                              style: theme.textTheme.bodyLarge?.copyWith(
                                color: context.themeColors.onSurface,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  SizedBox(height: 28),
                  const EditProfileSectionHeader(
                    icon: Icons.forum_outlined,
                    title: 'CONTATO',
                  ),
                  KeyedSubtree(
                    key: _phoneSectionKey,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: Text(
                            'WHATSAPP *',
                            style: theme.textTheme.labelSmall?.copyWith(
                              color: context.themeColors.onSurfaceMuted,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.6,
                            ),
                          ),
                        ),
                        PhoneVerificationField(
                          controller: _phoneCtrl,
                          verified: _phoneVerified,
                          onChanged: (v) => _phoneNumber = v,
                          onVerified: (phoneNumber) => setState(() {
                            _phoneNumber = phoneNumber;
                            _phoneVerified = true;
                            _phoneCtrl.text =
                                formatPhoneBrDisplay(phoneNumber) ?? '';
                          }),
                        ),
                      ],
                    ),
                  ),
                  SizedBox(height: 12),
                  KeyedSubtree(
                    key: _citySectionKey,
                    child: BrStateCityFields(
                      selectedState: _selectedState,
                      selectedCity: _selectedCity,
                      useEditProfileStyle: true,
                      onStateChanged: (v) => setState(() => _selectedState = v),
                      onCityChanged: (v) => setState(() => _selectedCity = v),
                    ),
                  ),
                  SizedBox(height: 28),
                  const EditProfileSectionHeader(
                    icon: Icons.person_outline_rounded,
                    title: 'SOBRE VOCÊ',
                  ),
                  EditProfileTextField(
                    controller: _bioCtrl,
                    label: 'BIO',
                    maxLines: 4,
                    maxLength: 160,
                    showCounter: true,
                    helperText: 'Aparece no seu perfil público.',
                  ),
                  SizedBox(height: 28),
                  const EditProfileSectionHeader(
                    icon: Icons.photo_library_outlined,
                    title: 'FOTOS DE DESTAQUE',
                  ),
                  EditProfileHighlightsGrid(
                    existingUrls: _highlightUrls,
                    pendingBytes: [
                      for (final p in _pendingHighlights) p.bytes,
                    ],
                    maxPhotos: maxHighlightPhotos,
                    onAdd: _addHighlightPhoto,
                    onRemoveExisting: _removeExistingHighlight,
                    onRemovePending: _removePendingHighlight,
                  ),
                  SizedBox(height: 28),
                  const EditProfileSectionHeader(
                    icon: Icons.settings_outlined,
                    title: 'E-MAIL E CONTA',
                  ),
                  EditProfileAccountPrefsGroup(
                    email: _emailCtrl.text.trim().isEmpty
                        ? user.email
                        : _emailCtrl.text.trim(),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  PreferredSizeWidget _editProfileAppBar(ThemeData theme) {
    return NexaAppBar(
      backgroundColor: context.themeColors.canvas,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      centerTitle: true,
      leading: Padding(
        padding: const EdgeInsets.only(left: 12),
        child: Center(
          child: Material(
            color: context.themeColors.surfaceRaised,
            borderRadius: BorderRadius.circular(12),
            child: InkWell(
              onTap: _popOrBack,
              borderRadius: BorderRadius.circular(12),
              child: SizedBox(
                width: 40,
                height: 40,
                child: Icon(
                  Icons.chevron_left_rounded,
                  color: context.themeColors.onSurface,
                ),
              ),
            ),
          ),
        ),
      ),
      title: Text(
        'Editar perfil',
        style: theme.textTheme.titleLarge?.copyWith(
          fontWeight: FontWeight.w800,
          color: context.themeColors.onSurface,
          letterSpacing: -0.3,
        ),
      ),
    );
  }
}
