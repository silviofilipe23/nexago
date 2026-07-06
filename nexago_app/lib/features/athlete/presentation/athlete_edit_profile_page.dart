import 'dart:typed_data';
import 'package:nexago_app/core/layout/nexa_app_bar.dart';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_providers.dart';
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
import 'widgets/br_state_city_fields.dart';
import 'widgets/edit_profile/edit_profile_account_prefs_group.dart';
import 'widgets/edit_profile/edit_profile_completion_banner.dart';
import 'widgets/edit_profile/edit_profile_dropdown_field.dart';
import 'widgets/edit_profile/edit_profile_field_decorations.dart';
import 'widgets/edit_profile/edit_profile_media_header.dart';
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
  final _phoneCtrl = TextEditingController();
  final _bioCtrl = TextEditingController();

  String? _selectedState;
  String? _selectedCity;

  String _sport = AthleteProfileOptions.sports.first;
  String _level = AthleteProfileOptions.levels.first;

  Uint8List? _pickedBytes;
  String? _pickedContentType;
  String? _existingAvatarUrl;

  Uint8List? _pickedCoverBytes;
  String? _pickedCoverContentType;
  String? _existingCoverPhotoUrl;
  bool _removeCoverRequested = false;

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
    _phoneCtrl.dispose();
    _bioCtrl.dispose();
    super.dispose();
  }

  void _applyProfile(AthleteProfile p) {
    _nameCtrl.text = p.name;
    _nicknameCtrl.text = p.nickname ?? '';
    _phoneCtrl.text = p.phoneNumber ?? '';
    _selectedState = p.state;
    _selectedCity = p.city.trim().isEmpty ? null : p.city.trim();
    _bioCtrl.text = p.bio ?? '';
    _existingAvatarUrl = p.avatarUrl;
    _existingCoverPhotoUrl = p.coverPhotoUrl;
    _removeCoverRequested = false;
    _pickedCoverBytes = null;
    _pickedCoverContentType = null;
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
    });
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

      if (_pickedBytes != null && _pickedContentType != null) {
        avatarUrl = await repo.uploadAvatar(
          uid: user.uid,
          bytes: _pickedBytes!,
          contentType: _pickedContentType!,
        );
        _existingAvatarUrl = avatarUrl;
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
        phoneNumber: _phoneCtrl.text.trim().isEmpty
            ? null
            : _phoneCtrl.text.trim(),
        city: city,
        state: state,
        bio: bio,
        sports: _sports,
        goals: _goals,
        nickname: nicknameTrim.isEmpty ? null : nicknameTrim,
        birthDate: _birthDate,
        gender: _gender,
        onboardingCompleted: _onboardingCompleted,
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
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
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
                    child: EditProfileTextField(
                      controller: _phoneCtrl,
                      label: 'WHATSAPP',
                      required: true,
                      keyboardType: TextInputType.phone,
                      hintText: '(00) 00000-0000',
                      prefixIcon: Icon(
                        Icons.chat_bubble_outline_rounded,
                        size: 20,
                        color: context.themeColors.onSurfaceMuted,
                      ),
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
                    icon: Icons.settings_outlined,
                    title: 'E-MAIL E CONTA',
                  ),
                  EditProfileAccountPrefsGroup(
                    email: _emailCtrl.text.trim().isEmpty
                        ? user.email
                        : _emailCtrl.text.trim(),
                  ),
                  SizedBox(height: 28),
                  FilledButton(
                    onPressed: _saving ? null : _save,
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.brand,
                      foregroundColor: context.themeColors.canvas,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                      ),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        if (_saving)
                          SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: context.themeColors.canvas,
                            ),
                          )
                        else
                          Icon(Icons.check_rounded),
                        SizedBox(width: 10),
                        Text(
                          _saving ? 'Salvando…' : 'Salvar alterações',
                          style: TextStyle(
                            fontWeight: FontWeight.w800,
                            fontSize: 16,
                          ),
                        ),
                      ],
                    ),
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
