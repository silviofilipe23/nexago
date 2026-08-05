import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/media/profile_image_crop_config.dart';
import '../../../../../core/media/profile_image_picker.dart';
import '../../../../../core/router/app_router.dart';
import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/ui/app_snackbar.dart';
import '../../../../auth/widgets/auth_form_widgets.dart';
import '../../../domain/athlete_profile_options.dart';
import '../../../phone_verification/presentation/phone_verification_field.dart';
import '../../domain/athlete_onboarding_draft.dart';
import '../../domain/athlete_onboarding_options.dart';
import '../../domain/athlete_onboarding_providers.dart';
import '../utils/onboarding_input_formatters.dart';
import '../widgets/onboarding_progress_header.dart';
import '../widgets/onboarding_scaffold.dart';
import '../widgets/onboarding_step_header.dart';

class AthleteOnboardingProfileStep extends ConsumerStatefulWidget {
  const AthleteOnboardingProfileStep({super.key});

  @override
  ConsumerState<AthleteOnboardingProfileStep> createState() =>
      _AthleteOnboardingProfileStepState();
}

class _AthleteOnboardingProfileStepState
    extends ConsumerState<AthleteOnboardingProfileStep> {
  final _nameCtrl = TextEditingController();
  final _nicknameCtrl = TextEditingController();
  final _birthCtrl = TextEditingController();
  final _referralCodeCtrl = TextEditingController();
  bool _submitting = false;
  String? _nameError;
  String? _phoneError;
  String? _birthError;
  bool _genderMissing = false;

  @override
  void initState() {
    super.initState();
    final draft = ref.read(athleteOnboardingDraftProvider);
    _nameCtrl.text = draft.name;
    _nicknameCtrl.text = draft.nickname;
    _birthCtrl.text = draft.birthDate;
    _referralCodeCtrl.text = draft.referralCode;
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _nicknameCtrl.dispose();
    _birthCtrl.dispose();
    _referralCodeCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickPhoto() async {
    final result = await pickProfileImage(
      context: context,
      target: ProfileImageCropTarget.avatar,
    );
    if (result == null || !mounted) return;
    ref
        .read(athleteOnboardingDraftProvider.notifier)
        .setAvatar(bytes: result.bytes, contentType: result.contentType);
  }

  void _syncDraftFromControllers() {
    final notifier = ref.read(athleteOnboardingDraftProvider.notifier);
    notifier.setName(_nameCtrl.text);
    notifier.setNickname(_nicknameCtrl.text);
    notifier.setBirthDate(_birthCtrl.text);
    notifier.setReferralCode(_referralCodeCtrl.text);
  }

  Future<void> _submit() async {
    if (_submitting) return;
    _syncDraftFromControllers();
    final draft = ref.read(athleteOnboardingDraftProvider);
    if (!draft.isProfileValid) {
      // Erro inline por campo: o usuário vê exatamente o que falta, em vez de
      // um botão desabilitado mudo ou um aviso genérico.
      setState(() {
        _nameError = draft.isNameValid ? null : 'Informe seu nome';
        _phoneError = draft.isPhoneValid
            ? null
            : 'Verifique seu WhatsApp por SMS';
        _birthError = draft.isBirthDateValid
            ? null
            : 'Data inválida (dd/mm/aaaa)';
        _genderMissing = !draft.isGenderValid;
      });
      return;
    }

    setState(() => _submitting = true);
    try {
      final photoWarning = await ref
          .read(athleteOnboardingDraftProvider.notifier)
          .submit();
      if (!mounted) return;
      ref.read(goRouterProvider).go(AppRoutes.discover);
      if (photoWarning != null) {
        showAppSnackBar(context, photoWarning);
      }
    } on FirebaseException catch (e) {
      if (kDebugMode) {
        debugPrint('onboarding profile submit FirebaseException: $e');
      }
      if (!mounted) return;
      showAppSnackBar(context, _submitErrorMessage(e), isError: true);
    } catch (e, st) {
      if (kDebugMode) {
        debugPrint('onboarding profile submit: $e\n$st');
      }
      if (!mounted) return;
      showAppSnackBar(
        context,
        'Não foi possível salvar o perfil. Tente novamente.',
        isError: true,
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  String _submitErrorMessage(FirebaseException e) {
    if (e.code == 'permission-denied') {
      return 'Sem permissão para salvar o perfil. Entre novamente e tente outra vez.';
    }
    return 'Não foi possível salvar o perfil. Tente novamente.';
  }

  @override
  Widget build(BuildContext context) {
    final draft = ref.watch(athleteOnboardingDraftProvider);
    final notifier = ref.read(athleteOnboardingDraftProvider.notifier);
    final step = AthleteOnboardingStep.profile;
    final theme = Theme.of(context);

    return OnboardingScaffold(
      topBar: OnboardingProgressHeader(
        currentStep: step.stepIndex,
        totalSteps: AthleteOnboardingOptions.totalSteps,
        onBack: () => context.go(AppRoutes.athleteOnboardingLevel),
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const OnboardingStepHeader(
            stepIndex: 3,
            totalSteps: AthleteOnboardingOptions.totalSteps,
            title: 'Perfil básico',
            subtitle: 'Preenche o essencial pra liberar sua conta.',
          ),
          SizedBox(height: 20),
          _PhotoPickerCard(avatarBytes: draft.avatarBytes, onPick: _pickPhoto),
          SizedBox(height: 20),
          const AuthFieldLabel(label: 'NOME *'),
          AuthTextField(
            controller: _nameCtrl,
            hintText: 'Seu nome completo',
            textInputAction: TextInputAction.next,
            errorText: _nameError,
            onChanged: (v) {
              notifier.setName(v);
              if (_nameError != null) setState(() => _nameError = null);
            },
          ),
          SizedBox(height: 16),
          const AuthFieldLabel(label: 'APELIDO (OPCIONAL)'),
          AuthTextField(
            controller: _nicknameCtrl,
            hintText: 'Como prefere ser chamado',
            textInputAction: TextInputAction.next,
            onChanged: notifier.setNickname,
          ),
          SizedBox(height: 16),
          const AuthFieldLabel(label: 'NÚMERO DE TELEFONE *'),
          PhoneVerificationField(
            phoneNumber: draft.verifiedPhoneNumber.isEmpty
                ? null
                : draft.verifiedPhoneNumber,
            verified: draft.verifiedPhoneNumber.isNotEmpty,
            errorText: _phoneError,
            onVerified: (phoneNumber) {
              notifier.setVerifiedPhoneNumber(phoneNumber);
              if (_phoneError != null) setState(() => _phoneError = null);
            },
          ),
          SizedBox(height: 16),
          const AuthFieldLabel(label: 'DATA DE NASCIMENTO *'),
          AuthTextField(
            controller: _birthCtrl,
            hintText: 'dd/mm/aaaa',
            keyboardType: TextInputType.number,
            inputFormatters: [BrDateInputFormatter()],
            errorText: _birthError,
            prefixIcon: Icon(
              Icons.calendar_today_outlined,
              size: 20,
              color: context.themeColors.onSurfaceMuted,
            ),
            onChanged: (v) {
              notifier.setBirthDate(v);
              if (_birthError != null) setState(() => _birthError = null);
            },
          ),
          SizedBox(height: 16),
          const AuthFieldLabel(label: 'GÊNERO *'),
          SizedBox(height: 8),
          Row(
            children: AthleteProfileOptions.genders.map((g) {
              final selected = draft.gender == g;
              return Expanded(
                child: Padding(
                  padding: EdgeInsets.only(
                    right: g != AthleteProfileOptions.genders.last ? 8 : 0,
                  ),
                  child: OutlinedButton(
                    onPressed: () {
                      notifier.setGender(g);
                      if (_genderMissing)
                        setState(() => _genderMissing = false);
                    },
                    style: OutlinedButton.styleFrom(
                      foregroundColor: selected
                          ? AppColors.brand
                          : context.themeColors.onSurface,
                      backgroundColor: Colors.transparent,
                      side: BorderSide(
                        color: selected
                            ? AppColors.brand
                            : context.themeColors.onSurfaceMuted.withValues(
                                alpha: 0.35,
                              ),
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                      padding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                    child: Text(
                      g,
                      style: theme.textTheme.labelLarge?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ),
              );
            }).toList(),
          ),
          if (_genderMissing) ...[
            const SizedBox(height: 8),
            Text(
              'Selecione o gênero',
              style: theme.textTheme.bodySmall?.copyWith(color: AppColors.live),
            ),
          ],
          SizedBox(height: 16),
          const AuthFieldLabel(label: 'CÓDIGO DE INDICAÇÃO (OPCIONAL)'),
          AuthTextField(
            controller: _referralCodeCtrl,
            hintText: 'Código de quem te indicou',
            textInputAction: TextInputAction.done,
            prefixIcon: Icon(
              Icons.card_giftcard_rounded,
              size: 20,
              color: context.themeColors.onSurfaceMuted,
            ),
            onChanged: notifier.setReferralCode,
          ),
        ],
      ),
      primaryLabel: 'Concluir cadastro',
      primaryLoading: _submitting,
      onPrimary: _submit,
    );
  }
}

class _PhotoPickerCard extends StatelessWidget {
  const _PhotoPickerCard({required this.avatarBytes, required this.onPick});

  final Uint8List? avatarBytes;
  final VoidCallback onPick;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final hasPhoto = avatarBytes != null;

    return DecoratedBox(
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised.withValues(alpha: 0.65),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.25),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            CircleAvatar(
              radius: 28,
              backgroundColor: context.themeColors.surfaceRaised,
              backgroundImage: hasPhoto ? MemoryImage(avatarBytes!) : null,
              child: hasPhoto
                  ? null
                  : Icon(
                      Icons.person_outline_rounded,
                      color: context.themeColors.onSurfaceMuted,
                    ),
            ),
            SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Foto de perfil (opcional)',
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  Text(
                    hasPhoto
                        ? 'Toque em ajustar para recortar de novo'
                        : 'JPG ou PNG · recorte circular',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: context.themeColors.onSurfaceMuted,
                    ),
                  ),
                ],
              ),
            ),
            OutlinedButton.icon(
              onPressed: onPick,
              icon: Icon(
                hasPhoto ? Icons.crop_rounded : Icons.photo_camera_outlined,
                size: 18,
              ),
              label: Text(hasPhoto ? 'Ajustar' : 'Escolher'),
              style: OutlinedButton.styleFrom(
                foregroundColor: context.themeColors.onSurface,
                side: BorderSide(
                  color: context.themeColors.onSurfaceMuted.withValues(
                    alpha: 0.35,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
