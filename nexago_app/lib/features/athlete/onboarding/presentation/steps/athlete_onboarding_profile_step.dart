import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../../../../core/router/app_router.dart';
import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/ui/app_snackbar.dart';
import '../../../../auth/widgets/auth_form_widgets.dart';
import '../../../domain/athlete_profile_options.dart';
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
  final _phoneCtrl = TextEditingController();
  final _birthCtrl = TextEditingController();
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    final draft = ref.read(athleteOnboardingDraftProvider);
    _nameCtrl.text = draft.name;
    _nicknameCtrl.text = draft.nickname;
    _phoneCtrl.text = draft.phoneDigits;
    _birthCtrl.text = draft.birthDate;
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _nicknameCtrl.dispose();
    _phoneCtrl.dispose();
    _birthCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickPhoto() async {
    final picker = ImagePicker();
    final x = await picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 1600,
      imageQuality: 88,
    );
    if (x == null) return;
    final bytes = await x.readAsBytes();
    final path = x.path.toLowerCase();
    var contentType = 'image/jpeg';
    if (path.endsWith('.png')) {
      contentType = 'image/png';
    } else if (path.endsWith('.webp')) {
      contentType = 'image/webp';
    }
    ref.read(athleteOnboardingDraftProvider.notifier).setAvatar(
          bytes: bytes,
          contentType: contentType,
        );
  }

  void _syncDraftFromControllers() {
    final notifier = ref.read(athleteOnboardingDraftProvider.notifier);
    notifier.setName(_nameCtrl.text);
    notifier.setNickname(_nicknameCtrl.text);
    notifier.setPhoneDigits(_phoneCtrl.text);
    notifier.setBirthDate(_birthCtrl.text);
  }

  Future<void> _submit() async {
    _syncDraftFromControllers();
    final draft = ref.read(athleteOnboardingDraftProvider);
    if (_submitting) return;
    if (!draft.isProfileValid) {
      showAppSnackBar(
        context,
        'Preencha nome, WhatsApp, data de nascimento e gênero.',
        isError: true,
      );
      return;
    }

    setState(() => _submitting = true);
    try {
      final photoWarning =
          await ref.read(athleteOnboardingDraftProvider.notifier).submit();
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
      showAppSnackBar(
        context,
        _submitErrorMessage(e),
        isError: true,
      );
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
        onBack: () => context.go(AppRoutes.athleteOnboardingGoals),
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const OnboardingStepHeader(
            stepIndex: 5,
            totalSteps: AthleteOnboardingOptions.totalSteps,
            title: 'Perfil básico',
            subtitle: 'Preenche o essencial pra liberar sua conta.',
          ),
          const SizedBox(height: 20),
          _PhotoPickerCard(
            hasPhoto: draft.avatarBytes != null,
            onPick: _pickPhoto,
          ),
          const SizedBox(height: 20),
          const AuthFieldLabel(label: 'NOME *'),
          AuthTextField(
            controller: _nameCtrl,
            hintText: 'Seu nome completo',
            textInputAction: TextInputAction.next,
            onChanged: notifier.setName,
          ),
          const SizedBox(height: 16),
          const AuthFieldLabel(label: 'APELIDO (OPCIONAL)'),
          AuthTextField(
            controller: _nicknameCtrl,
            hintText: 'Como prefere ser chamado',
            textInputAction: TextInputAction.next,
            onChanged: notifier.setNickname,
          ),
          const SizedBox(height: 16),
          const AuthFieldLabel(label: 'WHATSAPP *'),
          AuthTextField(
            controller: _phoneCtrl,
            hintText: '(00) 00000-0000',
            keyboardType: TextInputType.phone,
            inputFormatters: [BrPhoneInputFormatter()],
            prefixIcon: const Icon(
              Icons.chat_bubble_outline_rounded,
              size: 20,
              color: AppColors.onSurfaceMuted,
            ),
            onChanged: notifier.setPhoneDigits,
          ),
          const SizedBox(height: 16),
          const AuthFieldLabel(label: 'DATA DE NASCIMENTO *'),
          AuthTextField(
            controller: _birthCtrl,
            hintText: 'dd/mm/aaaa',
            keyboardType: TextInputType.number,
            inputFormatters: [BrDateInputFormatter()],
            prefixIcon: const Icon(
              Icons.calendar_today_outlined,
              size: 20,
              color: AppColors.onSurfaceMuted,
            ),
            onChanged: notifier.setBirthDate,
          ),
          const SizedBox(height: 16),
          const AuthFieldLabel(label: 'GÊNERO *'),
          const SizedBox(height: 8),
          Row(
            children: AthleteProfileOptions.genders.map((g) {
              final selected = draft.gender == g;
              return Expanded(
                child: Padding(
                  padding: EdgeInsets.only(
                    right: g != AthleteProfileOptions.genders.last ? 8 : 0,
                  ),
                  child: OutlinedButton(
                    onPressed: () => notifier.setGender(g),
                    style: OutlinedButton.styleFrom(
                      foregroundColor:
                          selected ? AppColors.brand : AppColors.onSurface,
                      backgroundColor: Colors.transparent,
                      side: BorderSide(
                        color: selected
                            ? AppColors.brand
                            : AppColors.onSurfaceMuted.withValues(alpha: 0.35),
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
        ],
      ),
      primaryLabel: 'Concluir cadastro',
      primaryEnabled: draft.canContinueFrom(step),
      primaryLoading: _submitting,
      onPrimary: _submit,
    );
  }
}

class _PhotoPickerCard extends StatelessWidget {
  const _PhotoPickerCard({
    required this.hasPhoto,
    required this.onPick,
  });

  final bool hasPhoto;
  final VoidCallback onPick;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return DecoratedBox(
      decoration: BoxDecoration(
        color: AppColors.surfaceRaised.withValues(alpha: 0.65),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: AppColors.onSurfaceMuted.withValues(alpha: 0.25),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            CircleAvatar(
              radius: 28,
              backgroundColor: AppColors.surfaceRaised,
              child: Icon(
                hasPhoto ? Icons.check_rounded : Icons.person_outline_rounded,
                color: hasPhoto ? AppColors.win : AppColors.onSurfaceMuted,
              ),
            ),
            const SizedBox(width: 12),
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
                    'JPG ou PNG · até 2 MB',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: AppColors.onSurfaceMuted,
                    ),
                  ),
                ],
              ),
            ),
            OutlinedButton.icon(
              onPressed: onPick,
              icon: const Icon(Icons.photo_camera_outlined, size: 18),
              label: const Text('Escolher'),
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.onSurface,
                side: BorderSide(
                  color: AppColors.onSurfaceMuted.withValues(alpha: 0.35),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
