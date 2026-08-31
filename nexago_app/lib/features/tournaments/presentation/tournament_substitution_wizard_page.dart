import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/features/athlete/presentation/widgets/athlete_profile_avatar.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/formatting/app_currency_format.dart';
import '../../../core/layout/nexa_app_bar.dart';
import '../../../core/profiles/app_user_profile.dart';
import '../../../core/theme/app_borders.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_spacing.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/app_status_views.dart';
import '../../../core/ui/nexa_card.dart';
import '../data/my_tournament_registrations_repository.dart';
import '../domain/substitution_journey_logic.dart';
import '../domain/tournament_discovery_models.dart';
import '../domain/tournament_registration_providers.dart';
import '../domain/tournament_substitution_logic.dart';
import 'tournament_substitution_pick_page.dart';

/// Passo 1 do wizard de substituição: escolher QUEM sai da inscrição, com
/// motivo opcional pro organizador. O passo 2 (buscar/convidar o substituto)
/// é um push interno — ver `tournament_substitution_pick_page.dart`.
///
/// Aposenta `tournament_substitution_sheet.dart` (Task 5 da jornada v2): mesma
/// regra de vagas (`substitutionReplaceableUids`), agora em tela cheia com
/// rolagem própria.
class TournamentSubstitutionWizardPage extends ConsumerStatefulWidget {
  const TournamentSubstitutionWizardPage({
    super.key,
    required this.tournamentId,
    required this.registrationId,
  });

  final String tournamentId;
  final String registrationId;

  @override
  ConsumerState<TournamentSubstitutionWizardPage> createState() =>
      _TournamentSubstitutionWizardPageState();
}

class _TournamentSubstitutionWizardPageState
    extends ConsumerState<TournamentSubstitutionWizardPage> {
  String? _replacedUid;
  String? _reason;
  final _reasonNoteController = TextEditingController();

  @override
  void dispose() {
    _reasonNoteController.dispose();
    super.dispose();
  }

  bool _isTeam(MyTournamentRegistration registration) =>
      (registration.teamSize ?? 2) >= 3;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final registrationsAsync = ref.watch(myTournamentRegistrationsProvider);
    final registrations = registrationsAsync.valueOrNull;

    MyTournamentRegistration? registration;
    if (registrations != null) {
      for (final r in registrations) {
        if (r.registrationId == widget.registrationId) {
          registration = r;
          break;
        }
      }
    }

    if (registration == null) {
      final loading = registrations == null && !registrationsAsync.hasError;
      return Scaffold(
        backgroundColor: colors.canvas,
        appBar: const NexaAppBar(title: Text('Substituir atleta')),
        body: loading
            ? const AppLoadingView()
            : AppEmptyView(
                icon: Icons.event_busy_outlined,
                title: 'Inscrição não encontrada',
                subtitle:
                    'Ela pode ter sido cancelada ou o link está desatualizado.',
                actionLabel: 'Voltar',
                onAction: () => Navigator.of(context).maybePop(),
              ),
      );
    }

    final reg = registration;
    final isTeam = _isTeam(reg);
    final unitWord = isTeam ? 'equipe' : 'dupla';
    final otherWord = isTeam ? 'atleta' : 'parceiro';
    final categoryName = reg.category?.name ?? 'Categoria';
    final uid = ref.watch(authProvider).valueOrNull?.uid ?? '';
    final replaceableUids = substitutionReplaceableUids(
      participantUids: reg.participantUids,
      uid: uid,
      teamSize: reg.teamSize,
      captainUid: reg.captainUid,
      partnerPending: reg.partnerPending,
      bracketPublished: reg.category?.bracketPublished ?? false,
    );
    final profiles = ref
            .watch(registrationRosterProfilesProvider(reg.participantUids))
            .valueOrNull ??
        const <String, AppUserProfile>{};

    String nameFor(String participantUid) {
      if (participantUid == uid) return 'Você';
      final profile = profiles[participantUid];
      if (profile == null) return 'Atleta';
      final name = appUserDisplayName(profile);
      return name.trim().isNotEmpty ? name : 'Atleta';
    }

    /// Nome REAL do participante — para o PAYLOAD (`replacedName`), nunca
    /// pro rótulo do rádio. Esse nome vira o convite, o push do convidado, a
    /// notificação do organizador e o `substitutionHistory` imutável — "Você"
    /// ali seria sem sentido pra qualquer um que não seja o próprio autor da
    /// troca, então mesmo na autossubstituição resolve o nome de verdade no
    /// perfil carregado (`nameFor` continua "Você" só na tela).
    String realNameFor(String participantUid) {
      final profile = profiles[participantUid];
      if (profile == null) return 'Atleta';
      final name = appUserDisplayName(profile);
      return name.trim().isNotEmpty ? name : 'Atleta';
    }

    String roleFor(String participantUid) {
      if (participantUid == uid) {
        return participantUid == reg.captainUid
            ? 'Capitão da inscrição'
            : 'Sua vaga';
      }
      return isTeam ? 'Integrante' : 'Parceiro · confirmado';
    }

    return Scaffold(
      backgroundColor: colors.canvas,
      appBar: NexaAppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('Substituir $otherWord'),
            Text(
              '${reg.tournamentName} · $categoryName',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style:
                  AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted),
            ),
          ],
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenH,
          AppSpacing.lg,
          AppSpacing.screenH,
          AppSpacing.xxl,
        ),
        children: [
          Text(
            'Quem não vai poder jogar?',
            style: AppTypography.titleL.copyWith(color: colors.onSurface),
          ),
          const SizedBox(height: 6),
          Text(
            'A vaga da $unitWord continua sua. Só precisamos saber quem sai '
            'e quem entra no lugar.',
            style: AppTypography.bodyM.copyWith(color: colors.onSurfaceMuted),
          ),
          const SizedBox(height: AppSpacing.xl),
          RadioGroup<String>(
            groupValue: _replacedUid,
            onChanged: (v) => setState(() => _replacedUid = v),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final participantUid in replaceableUids)
                  Padding(
                    padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                    child: _ReplaceableCard(
                      value: participantUid,
                      selected: _replacedUid == participantUid,
                      name: nameFor(participantUid),
                      role: roleFor(participantUid),
                      initials: profiles[participantUid] != null
                          ? appUserInitials(profiles[participantUid]!)
                          : '?',
                      avatarUrl: profiles[participantUid]?.profilePhotoUrl,
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.sectionGap),
          Text(
            'MOTIVO · VAI PRO ORGANIZADOR',
            style: AppTypography.eyebrow.copyWith(color: colors.onSurfaceMuted),
          ),
          const SizedBox(height: AppSpacing.sm),
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            children: [
              for (final entry in substitutionReasonLabels.entries)
                ChoiceChip(
                  label: Text(entry.value),
                  selected: _reason == entry.key,
                  showCheckmark: false,
                  selectedColor: AppColors.brand,
                  backgroundColor: colors.surfaceRaised,
                  labelStyle: AppTypography.soraRegular(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: _reason == entry.key
                        ? AppColors.black
                        : colors.onSurface,
                  ),
                  side: BorderSide(
                    color: _reason == entry.key
                        ? AppColors.brand
                        : colors.onSurfaceMuted.withValues(alpha: 0.2),
                  ),
                  onSelected: (selected) => setState(
                    () => _reason = selected ? entry.key : null,
                  ),
                ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          TextField(
            controller: _reasonNoteController,
            minLines: 2,
            maxLines: 4,
            maxLength: 300,
            cursorColor: AppColors.brand,
            textCapitalization: TextCapitalization.sentences,
            style: AppTypography.bodyM.copyWith(
              color: colors.onSurface,
              fontWeight: FontWeight.w500,
            ),
            decoration: InputDecoration(
              hintText: 'Conte o que aconteceu (opcional)',
              hintStyle: AppTypography.bodyM.copyWith(
                color: colors.onSurfaceMuted.withValues(alpha: 0.6),
              ),
              alignLabelWithHint: true,
              filled: true,
              fillColor: colors.surfaceRaised,
              contentPadding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide(
                  color: colors.onSurfaceMuted.withValues(alpha: 0.25),
                ),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide(
                  color: colors.onSurfaceMuted.withValues(alpha: 0.25),
                ),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide:
                    const BorderSide(color: AppColors.brand, width: 1.5),
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.sectionGap),
          NexaCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'REGRAS DESTE TORNEIO',
                  style: AppTypography.eyebrow
                      .copyWith(color: colors.onSurfaceMuted),
                ),
                const SizedBox(height: AppSpacing.md),
                const _RuleRow(
                  icon: Icons.calendar_today_rounded,
                  iconColor: AppColors.pending,
                  title: 'Troca permitida até a publicação das chaves',
                  subtitle:
                      'Depois de publicadas, não é possível substituir',
                ),
                Divider(
                  height: AppSpacing.xl,
                  color: colors.onSurfaceMuted.withValues(alpha: 0.12),
                ),
                _RuleRow(
                  icon: Icons.emoji_events_outlined,
                  iconColor: colors.onSurfaceMuted,
                  title: 'O substituto precisa caber na categoria',
                  subtitle: 'Nível compatível com $categoryName',
                ),
                if (reg.isPaid || reg.hasPartialPayment) ...[
                  Divider(
                    height: AppSpacing.xl,
                    color: colors.onSurfaceMuted.withValues(alpha: 0.12),
                  ),
                  _RuleRow(
                    icon: Icons.confirmation_number_outlined,
                    iconColor: AppColors.win,
                    title: 'Inscrição já paga é mantida',
                    subtitle: _paymentRuleSubtitle(reg, isTeam: isTeam),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenH,
            AppSpacing.sm,
            AppSpacing.screenH,
            AppSpacing.lg,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              SizedBox(
                height: 52,
                width: double.infinity,
                child: FilledButton(
                  onPressed: _replacedUid == null
                      ? null
                      : () {
                          final replacedUid = _replacedUid!;
                          final note = _reasonNoteController.text.trim();
                          Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) => TournamentSubstitutionPickPage(
                                registration: reg,
                                replacedUid: replacedUid,
                                replacedName: realNameFor(replacedUid),
                                reason: _reason,
                                reasonNote: note.isEmpty ? null : note,
                              ),
                            ),
                          );
                        },
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.brand,
                    foregroundColor: AppColors.black,
                    disabledBackgroundColor: colors.surfaceRaised,
                    shape: RoundedRectangleBorder(
                      borderRadius: AppRadii.lgAll,
                    ),
                  ),
                  child: const Text(
                    'Escolher o substituto →',
                    style:
                        TextStyle(fontWeight: FontWeight.w900, fontSize: 14),
                  ),
                ),
              ),
              const SizedBox(height: 4),
              TextButton(
                onPressed: () => Navigator.of(context).maybePop(),
                child: const Text('Voltar'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

String _paymentRuleSubtitle(
  MyTournamentRegistration registration, {
  required bool isTeam,
}) {
  final fee = registration.category?.entryFee;
  if (fee != null && fee > 0) {
    final splitHint =
        isTeam ? 'o acerto é entre vocês' : 'o acerto da metade é entre vocês';
    return 'Os ${formatBRL(fee)} seguem valendo — $splitHint';
  }
  return 'Nada é cobrado de novo — o acerto é entre vocês';
}

class _ReplaceableCard extends StatelessWidget {
  const _ReplaceableCard({
    required this.value,
    required this.selected,
    required this.name,
    required this.role,
    required this.initials,
    this.avatarUrl,
  });

  final String value;
  final bool selected;
  final String name;
  final String role;
  final String initials;
  final String? avatarUrl;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Material(
      color: colors.surfaceCard,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: AppRadii.lgAll,
        side: BorderSide(
          color: selected
              ? AppColors.brand
              : colors.onSurfaceMuted.withValues(alpha: 0.2),
          width: selected ? 1.5 : 1,
        ),
      ),
      child: RadioListTile<String>(
        value: value,
        activeColor: AppColors.brand,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.md,
          vertical: 4,
        ),
        secondary: AthleteProfileAvatar(
          size: 40,
          initials: initials,
          imageUrl: avatarUrl,
        ),
        title: Text(
          name,
          style: AppTypography.titleS.copyWith(color: colors.onSurface),
        ),
        subtitle: Text(
          role,
          style: AppTypography.bodyS.copyWith(color: colors.onSurfaceMuted),
        ),
      ),
    );
  }
}

class _RuleRow extends StatelessWidget {
  const _RuleRow({
    required this.icon,
    required this.iconColor,
    required this.title,
    required this.subtitle,
  });

  final IconData icon;
  final Color iconColor;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            color: colors.surfaceRaised,
            borderRadius: AppRadii.mdAll,
            border: Border.fromBorderSide(AppBorders.subtleSide(colors)),
          ),
          child: Icon(icon, size: 18, color: iconColor),
        ),
        const SizedBox(width: AppSpacing.md),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: AppTypography.titleS.copyWith(color: colors.onSurface),
              ),
              const SizedBox(height: 2),
              Text(
                subtitle,
                style: AppTypography.bodyS
                    .copyWith(color: colors.onSurfaceMuted),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
