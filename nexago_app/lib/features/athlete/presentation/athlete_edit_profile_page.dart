import 'package:cached_network_image/cached_network_image.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/biometric/biometric_providers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../domain/athlete_profile.dart';
import '../domain/athlete_profile_options.dart';
import '../domain/athlete_profile_providers.dart';

/// Edição do perfil do atleta (Firestore `athletes` + Storage para avatar).
class AthleteEditProfilePage extends ConsumerStatefulWidget {
  const AthleteEditProfilePage({super.key});

  @override
  ConsumerState<AthleteEditProfilePage> createState() =>
      _AthleteEditProfilePageState();
}

class _AthleteEditProfilePageState extends ConsumerState<AthleteEditProfilePage> {
  final _formKey = GlobalKey<FormState>();
  final _nameCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _cityCtrl = TextEditingController();
  final _bioCtrl = TextEditingController();

  String _sport = AthleteProfileOptions.sports.first;
  String _level = AthleteProfileOptions.levels.first;

  Uint8List? _pickedBytes;
  String? _pickedContentType;
  String? _existingAvatarUrl;

  bool _initialized = false;
  bool _saving = false;
  bool _useBiometric = false;

  @override
  void dispose() {
    _nameCtrl.dispose();
    _phoneCtrl.dispose();
    _cityCtrl.dispose();
    _bioCtrl.dispose();
    super.dispose();
  }

  void _applyProfile(AthleteProfile p) {
    _nameCtrl.text = p.name;
    _phoneCtrl.text = p.phoneNumber ?? '';
    _cityCtrl.text = p.city;
    _bioCtrl.text = p.bio ?? '';
    _existingAvatarUrl = p.avatarUrl;
    _sport = _matchOrFirst(AthleteProfileOptions.sports, p.sport);
    _level = _matchOrFirst(AthleteProfileOptions.levels, p.level);
    _useBiometric = p.useBiometric;
  }

  Future<void> _onUseBiometricChanged(bool value) async {
    if (value) {
      final svc = ref.read(biometricServiceProvider);
      final supported = await svc.isDeviceSupported();
      final enrolled = await svc.hasEnrolledBiometrics();
      if (!supported || !enrolled) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Cadastre Face ID ou impressão digital nas configurações do aparelho.',
            ),
          ),
        );
        return;
      }
    }
    setState(() => _useBiometric = value);
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
    final picker = ImagePicker();
    final x = await picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 1600,
      imageQuality: 88,
    );
    if (x == null) return;
    final bytes = await x.readAsBytes();
    final path = x.path.toLowerCase();
    String contentType = 'image/jpeg';
    if (path.endsWith('.png')) {
      contentType = 'image/png';
    } else if (path.endsWith('.webp')) {
      contentType = 'image/webp';
    }
    setState(() {
      _pickedBytes = bytes;
      _pickedContentType = contentType;
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

      final profile = AthleteProfile(
        id: user.uid,
        name: _nameCtrl.text.trim(),
        avatarUrl: avatarUrl,
        sport: _sport,
        level: _level,
        phoneNumber: _phoneCtrl.text.trim().isEmpty ? null : _phoneCtrl.text.trim(),
        city: _cityCtrl.text.trim(),
        bio: _bioCtrl.text.trim().isEmpty ? null : _bioCtrl.text.trim(),
        useBiometric: _useBiometric,
      );

      await repo.saveProfile(profile);

      if (!mounted) return;
      context.go(AppRoutes.athleteProfileUpdateSuccess);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Erro ao salvar: $e')),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final user = ref.watch(authProvider).valueOrNull;
    final profileAsync = ref.watch(athleteProfileProvider);

    if (user == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Editar perfil')),
        body: const Center(child: Text('Faça login para editar o perfil.')),
      );
    }

    return Scaffold(
      backgroundColor: theme.colorScheme.surfaceContainerLowest,
      appBar: AppBar(
        title: const Text('Editar perfil'),
      ),
      body: profileAsync.when(
        data: (doc) {
          if (!_initialized) {
            final p = doc ?? AthleteProfile.draft(user);
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (!mounted || _initialized) return;
              setState(() {
                _applyProfile(p);
                _initialized = true;
              });
            });
          }

          if (!_initialized) {
            return const Center(child: CircularProgressIndicator());
          }

          return AbsorbPointer(
            absorbing: _saving,
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 420),
                  child: Form(
                    key: _formKey,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Center(child: _EditAvatar(
                          existingUrl: _pickedBytes == null
                              ? _existingAvatarUrl
                              : null,
                          pickedBytes: _pickedBytes,
                          name: _nameCtrl.text,
                          onTap: _pickAvatar,
                        )),
                        const SizedBox(height: 28),
                        TextFormField(
                          controller: _nameCtrl,
                          textCapitalization: TextCapitalization.words,
                          decoration: const InputDecoration(
                            labelText: 'Nome',
                            border: OutlineInputBorder(),
                          ),
                          validator: (v) {
                            if (v == null || v.trim().isEmpty) {
                              return 'Informe seu nome';
                            }
                            return null;
                          },
                          onChanged: (_) => setState(() {}),
                        ),
                        const SizedBox(height: 16),
                        DropdownButtonFormField<String>(
                          key: ValueKey<String>('sport_$_sport'),
                          initialValue: _sport,
                          decoration: const InputDecoration(
                            labelText: 'Esporte',
                            border: OutlineInputBorder(),
                          ),
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
                        const SizedBox(height: 16),
                        DropdownButtonFormField<String>(
                          key: ValueKey<String>('level_$_level'),
                          initialValue: _level,
                          decoration: const InputDecoration(
                            labelText: 'Nível',
                            border: OutlineInputBorder(),
                          ),
                          items: AthleteProfileOptions.levels
                              .map(
                                (e) => DropdownMenuItem(
                                  value: e,
                                  child: Text(e),
                                ),
                              )
                              .toList(),
                          onChanged: (v) {
                            if (v == null) return;
                            setState(() => _level = v);
                          },
                        ),
                        const SizedBox(height: 16),
                        TextFormField(
                          controller: _phoneCtrl,
                          keyboardType: TextInputType.phone,
                          decoration: const InputDecoration(
                            labelText: 'Telefone',
                            hintText: '(11) 99999-9999',
                            border: OutlineInputBorder(),
                          ),
                        ),
                        const SizedBox(height: 16),
                        TextFormField(
                          controller: _cityCtrl,
                          textCapitalization: TextCapitalization.words,
                          decoration: const InputDecoration(
                            labelText: 'Cidade',
                            border: OutlineInputBorder(),
                          ),
                          validator: (v) {
                            if (v == null || v.trim().isEmpty) {
                              return 'Informe sua cidade';
                            }
                            return null;
                          },
                        ),
                        const SizedBox(height: 16),
                        TextFormField(
                          controller: _bioCtrl,
                          maxLines: 4,
                          decoration: const InputDecoration(
                            labelText: 'Bio (opcional)',
                            alignLabelWithHint: true,
                            border: OutlineInputBorder(),
                          ),
                        ),
                        if (!kIsWeb) ...[
                          const SizedBox(height: 20),
                          SwitchListTile.adaptive(
                            value: _useBiometric,
                            onChanged: _saving ? null : _onUseBiometricChanged,
                            title: const Text('Usar Face ID'),
                            subtitle: const Text(
                              'Pedir biometria ao abrir o app. Você pode usar a senha se preferir.',
                            ),
                            contentPadding: EdgeInsets.zero,
                          ),
                        ],
                        const SizedBox(height: 32),
                        FilledButton(
                          onPressed: _saving ? null : _save,
                          style: FilledButton.styleFrom(
                            backgroundColor: AppColors.brand,
                            foregroundColor: AppColors.white,
                            padding: const EdgeInsets.symmetric(vertical: 16),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                          child: _saving
                              ? const SizedBox(
                                  height: 22,
                                  width: 22,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: AppColors.white,
                                  ),
                                )
                              : const Text('Salvar alterações'),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              'Não foi possível carregar.\n$e',
              textAlign: TextAlign.center,
            ),
          ),
        ),
      ),
    );
  }
}

class _EditAvatar extends StatelessWidget {
  const _EditAvatar({
    required this.existingUrl,
    required this.pickedBytes,
    required this.name,
    required this.onTap,
  });

  final String? existingUrl;
  final Uint8List? pickedBytes;
  final String name;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    const size = 120.0;
    final theme = Theme.of(context);

    Widget child;
    if (pickedBytes != null) {
      child = Image.memory(
        pickedBytes!,
        fit: BoxFit.cover,
        width: size,
        height: size,
      );
    } else if (existingUrl != null && existingUrl!.isNotEmpty) {
      child = CachedNetworkImage(
        imageUrl: existingUrl!,
        fit: BoxFit.cover,
        width: size,
        height: size,
        placeholder: (_, __) => const Center(
          child: SizedBox(
            width: 28,
            height: 28,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        ),
      );
    } else {
      final initial = _initialLetter(name);
      child = Container(
        color: theme.colorScheme.surfaceContainerHigh,
        alignment: Alignment.center,
        child: Text(
          initial,
          style: theme.textTheme.headlineMedium?.copyWith(
            fontWeight: FontWeight.w600,
          ),
        ),
      );
    }

    return Column(
      children: [
        Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: onTap,
            customBorder: const CircleBorder(),
            child: Ink(
              width: size,
              height: size,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(
                  color: theme.colorScheme.outline.withValues(alpha: 0.2),
                ),
                boxShadow: [
                  BoxShadow(
                    color: theme.colorScheme.shadow.withValues(alpha: 0.08),
                    blurRadius: 20,
                    offset: const Offset(0, 6),
                  ),
                ],
              ),
              child: ClipOval(child: child),
            ),
          ),
        ),
        const SizedBox(height: 10),
        TextButton.icon(
          onPressed: onTap,
          icon: const Icon(Icons.photo_camera_back_outlined, size: 20),
          label: const Text('Alterar foto'),
        ),
      ],
    );
  }
}

String _initialLetter(String name) {
  final t = name.trim();
  if (t.isEmpty) return '?';
  final it = t.runes.iterator;
  if (!it.moveNext()) return '?';
  return String.fromCharCode(it.current).toUpperCase();
}
