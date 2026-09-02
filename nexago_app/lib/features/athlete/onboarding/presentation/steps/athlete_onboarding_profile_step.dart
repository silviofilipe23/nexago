import 'dart:typed_data';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/auth/auth_providers.dart';
import '../../../../../core/deep_link/deep_link_providers.dart';
import '../../../../../core/formatting/br_phone_format.dart';
import '../../../../../core/media/profile_image_crop_config.dart';
import '../../../../../core/media/profile_image_picker.dart';
import '../../../../../core/observability/flow_error_log.dart';
import '../../../../../core/router/app_router.dart';
import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/ui/app_snackbar.dart';
import '../../../../auth/widgets/auth_form_widgets.dart';
import '../../../domain/athlete_profile_options.dart';
import '../../../presentation/widgets/br_state_city_fields.dart';
import '../../../phone_verification/presentation/phone_verification_field.dart';
import '../../domain/athlete_onboarding_draft.dart';
import '../../domain/athlete_onboarding_options.dart';
import '../../domain/athlete_onboarding_providers.dart';
import '../utils/onboarding_input_formatters.dart';
import '../widgets/onboarding_logout_button.dart';
import '../widgets/onboarding_progress_header.dart';
import '../widgets/onboarding_scaffold.dart';
import '../widgets/onboarding_step_header.dart';
import '../../../../tournaments/domain/tournament_invite_links.dart';

const String kOnboardingPhotoUploadFailedMessage =
    'Não foi possível enviar sua foto. Verifique a conexão e tente de novo.';

const String kOnboardingSaveNetworkFailedMessage =
    'A conexão falhou ao salvar o perfil. Verifique a internet e toque em '
    'Concluir de novo: a foto já foi enviada.';

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
  final _referralCodeCtrl = TextEditingController();
  /// Só o par UF/cidade vive num Form: `BrStateCityFields` traz os próprios
  /// validators e, sem um Form em volta, eles nunca rodariam — o erro apareceria
  /// solto embaixo do bloco em vez de no campo que falta.
  final _locationFormKey = GlobalKey<FormState>();
  bool _submitting = false;
  AthleteOnboardingSubmitStage? _stage;
  String? _nameError;
  String? _phoneError;
  String? _birthError;
  bool _genderMissing = false;
  bool _photoMissing = false;

  @override
  void initState() {
    super.initState();
    final draft = ref.read(athleteOnboardingDraftProvider);
    _nameCtrl.text = draft.name;
    _nicknameCtrl.text = draft.nickname;
    _phoneCtrl.text =
        formatPhoneBrDisplay(draft.phoneNumber) ?? draft.phoneNumber;
    _birthCtrl.text = draft.birthDate;
    // Quem chegou por um convite de dupla já trouxe o código de indicação no
    // link; digitar de novo seria pedir algo que o app já sabe. O que o atleta
    // tiver escrito manda — só preenche campo vazio.
    _referralCodeCtrl.text = draft.referralCode.trim().isNotEmpty
        ? draft.referralCode
        : referralCodeFromDeepLinkPath(ref.read(pendingDeepLinkPathProvider)) ??
            '';
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _nicknameCtrl.dispose();
    _phoneCtrl.dispose();
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
    if (_photoMissing) setState(() => _photoMissing = false);
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
            : 'Informe um WhatsApp válido com DDD';
        _birthError = draft.isBirthDateValid
            ? null
            : 'Data inválida (dd/mm/aaaa)';
        _genderMissing = !draft.isGenderValid;
        _photoMissing = !draft.isPhotoValid;
      });
      _locationFormKey.currentState?.validate();
      return;
    }

    setState(() {
      _submitting = true;
      _stage = null;
    });
    // Capturados antes dos awaits: a navegação para a home não pode depender
    // deste State continuar vivo (o gate acima do router troca a árvore
    // quando o perfil é invalidado).
    final router = ref.read(goRouterProvider);
    // Deep link pendente (ex.: convite de dupla que trouxe o atleta pro
    // cadastro) é retomado no fim — concluir o onboarding e cair na home
    // perderia o convite que motivou tudo.
    final pendingDeepLink = ref.read(pendingDeepLinkPathProvider);
    final stopwatch = Stopwatch()..start();
    try {
      await ref.read(athleteOnboardingDraftProvider.notifier).submit(
        onStage: (stage) {
          if (mounted) setState(() => _stage = stage);
        },
      );
      if (mounted) {
        ref.read(pendingDeepLinkPathProvider.notifier).state = null;
      }
      router.go(
        (pendingDeepLink == null || pendingDeepLink.isEmpty)
            ? AppRoutes.discover
            : pendingDeepLink,
      );
    } on AthleteOnboardingSubmitException catch (e) {
      recordFlowError(
        'onboarding:${e.stage.name}',
        e.cause,
        e.stackTrace ?? StackTrace.current,
        information: [
          'elapsedMs=${stopwatch.elapsedMilliseconds}',
          'network=${e.isNetwork}',
        ],
      );
      if (!mounted) return;
      final cause = e.cause;
      showAppSnackBar(context, _submitErrorMessage(e), isError: true);
      if (cause is FirebaseException && cause.code == 'unauthenticated') {
        // Sessão sem conta por trás (token ainda válido, mas o usuário foi
        // apagado) — tentar de novo nunca vai funcionar. O GoRouter já manda
        // pro login sozinho assim que o auth zera (ver app_router.dart), daí
        // só disparar o signOut em vez de navegar na mão.
        await ref.read(appSignOutProvider)();
      }
    } catch (e, st) {
      recordFlowError(
        'onboarding:submit',
        e,
        st,
        information: ['elapsedMs=${stopwatch.elapsedMilliseconds}'],
      );
      if (!mounted) return;
      showAppSnackBar(
        context,
        'Não foi possível salvar o perfil. Tente novamente.',
        isError: true,
      );
    } finally {
      if (mounted) {
        setState(() {
          _submitting = false;
          _stage = null;
        });
      }
    }
  }

  String _submitErrorMessage(AthleteOnboardingSubmitException e) {
    if (e.stage == AthleteOnboardingSubmitStage.uploadAvatar) {
      return kOnboardingPhotoUploadFailedMessage;
    }
    final cause = e.cause;
    if (cause is FirebaseException) {
      if (cause.code == 'permission-denied') {
        return 'Sem permissão para salvar o perfil. Entre novamente e tente outra vez.';
      }
      if (cause.code == 'unauthenticated') {
        return 'Sua sessão expirou. Entre novamente para concluir o cadastro.';
      }
    }
    if (e.isNetwork) return kOnboardingSaveNetworkFailedMessage;
    return 'Não foi possível salvar o perfil. Tente novamente.';
  }

  String? get _stageLabel => switch (_stage) {
        null => null,
        AthleteOnboardingSubmitStage.uploadAvatar => 'Enviando foto…',
        AthleteOnboardingSubmitStage.grantAthleteRole =>
          'Liberando seu perfil de atleta…',
        AthleteOnboardingSubmitStage.saveProfile => 'Salvando perfil…',
      };

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
        trailing: const OnboardingLogoutButton(),
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
          _PhotoPickerCard(
            avatarBytes: draft.avatarBytes,
            onPick: _pickPhoto,
            missing: _photoMissing,
          ),
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
          const AuthFieldLabel(label: 'WHATSAPP *'),
          PhoneVerificationField(
            controller: _phoneCtrl,
            verified: draft.phoneVerified,
            errorText: _phoneError,
            onChanged: (v) {
              notifier.setPhoneNumber(v);
              if (_phoneError != null) setState(() => _phoneError = null);
            },
            onVerified: (phone) {
              notifier.setVerifiedPhoneNumber(phone);
              _phoneCtrl.text = formatPhoneBrDisplay(phone) ?? phone;
              if (_phoneError != null) setState(() => _phoneError = null);
            },
          ),
          SizedBox(height: 6),
          Text(
            'É por aqui que o organizador fala com você sobre a inscrição.',
            style: theme.textTheme.bodySmall?.copyWith(
              color: context.themeColors.onSurfaceMuted,
            ),
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
          Form(
            key: _locationFormKey,
            // Sem isto o erro só sairia da tela no próximo envio: com o modo
            // padrão o campo revalida apenas em `validate()`, e escolher a UF
            // deixaria o "Selecione o estado" vermelho embaixo do campo já
            // preenchido — os outros campos do passo limpam o erro na hora.
            autovalidateMode: AutovalidateMode.onUserInteraction,
            child: BrStateCityFields(
              selectedState: draft.state.isEmpty ? null : draft.state,
              selectedCity: draft.city.isEmpty ? null : draft.city,
              onStateChanged: notifier.setUf,
              onCityChanged: notifier.setCity,
              useEditProfileStyle: true,
            ),
          ),
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
      statusLabel: _submitting ? _stageLabel : null,
      onPrimary: _submit,
    );
  }
}

class _PhotoPickerCard extends StatelessWidget {
  const _PhotoPickerCard({
    required this.avatarBytes,
    required this.onPick,
    this.missing = false,
  });

  final Uint8List? avatarBytes;
  final VoidCallback onPick;

  /// Submeteu sem foto: a borda e o subtítulo viram erro, no mesmo padrão dos
  /// outros campos obrigatórios do passo.
  final bool missing;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final hasPhoto = avatarBytes != null;

    return DecoratedBox(
      decoration: BoxDecoration(
        color: context.themeColors.surfaceRaised.withValues(alpha: 0.65),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: missing
              ? AppColors.live
              : context.themeColors.onSurfaceMuted.withValues(alpha: 0.25),
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
                    'Foto de perfil *',
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  Text(
                    missing
                        ? 'Escolha uma foto pra concluir'
                        : hasPhoto
                            ? 'Toque em ajustar para recortar de novo'
                            : 'JPG ou PNG · recorte circular',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: missing
                          ? AppColors.live
                          : context.themeColors.onSurfaceMuted,
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
