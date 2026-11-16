import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/friendly_error_message.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/app_status_views.dart';
import '../../../core/ui/nexa_icon_square_button.dart';
import '../../athlete/domain/athlete_profile.dart';
import '../../athlete/domain/athlete_profile_providers.dart';
import '../../athlete/domain/athlete_public_profile_models.dart';
import '../application/benefits_club_providers.dart';
import '../domain/benefit_event.dart';
import '../domain/benefits_club_logic.dart';
import '../domain/benefits_club_premium_logic.dart';
import '../domain/my_benefits.dart';
import '../domain/partner.dart';
import 'benefits_club_entry_sheets.dart';
import 'benefits_club_navigation.dart';
import 'widgets/benefits_club_parts.dart';
import 'widgets/benefits_member_card.dart';
import 'widgets/benefits_partner_cards.dart';
import 'widgets/benefits_skeleton.dart';
import 'widgets/partner_visuals.dart';

/// Tela do Clube de Vantagens: carteirinha, banner do patrocinador oficial,
/// "Destaque da semana", chips das categorias presentes, a lista e o aviso do
/// pé. Com 8+ parceiros, o header ganha o botão de busca, que abre a tela de
/// busca e mapa (`BenefitsSearchPage`). Grava `club_view` com a origem da visita, que segue para as
/// telas de parceiro. Na 1ª visita de cada conta mostra "Como funciona o
/// clube"; com uso pendente, a pergunta "Conseguiu usar?" (uma vez por
/// sessão).
class BenefitsClubPage extends ConsumerStatefulWidget {
  const BenefitsClubPage({super.key, required this.source});

  final BenefitSource source;

  @override
  ConsumerState<BenefitsClubPage> createState() => _BenefitsClubPageState();
}

class _BenefitsClubPageState extends ConsumerState<BenefitsClubPage> {
  PartnerCategory? _category;
  bool _entryStarted = false;

  @override
  void initState() {
    super.initState();
    ref
        .read(benefitsClubTrackerProvider)
        .track(BenefitEventType.clubView, source: widget.source);
  }

  void _openPartner(Partner partner, BenefitSource source) =>
      openBenefitsPartner(context, partner.id, source);

  /// Folhas de entrada depois que a lista apareceu (uma vez por tela).
  void _scheduleEntrySheets() {
    if (_entryStarted) return;
    _entryStarted = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) runBenefitsEntrySheets(context, ref);
    });
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final visible = ref.watch(benefitsVisiblePartnersProvider).valueOrNull;
    final sponsor = visible == null ? null : masterSponsor(visible);
    return Scaffold(
      backgroundColor: colors.canvas,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            BenefitsTitleHeader(
              title: 'Clube de Vantagens',
              subtitle: sponsor == null
                  ? 'Descontos dos parceiros NexaGO'
                  : 'Oferecido por ${sponsor.name}',
              subtitleLeading: sponsor == null
                  ? null
                  : PartnerLogo(
                      partner: sponsor,
                      size: 18,
                      borderRadius: AppRadii.smAll,
                    ),
              onBack: () => benefitsBack(context, AppRoutes.home),
              trailing: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (visible != null && discoveryEnabled(visible.length)) ...[
                    NexaIconSquareButton(
                      key: const Key('benefits-open-search'),
                      icon: Icons.search_rounded,
                      size: benefitsTapTarget,
                      tooltip: 'Buscar parceiros',
                      onTap: () => openBenefitsSearch(context),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                  ],
                  NexaIconSquareButton(
                    key: const Key('benefits-open-mine'),
                    icon: Icons.confirmation_number_outlined,
                    size: benefitsTapTarget,
                    tooltip: 'Meus benefícios',
                    onTap: () => openMyBenefits(context),
                  ),
                ],
              ),
            ),
            Expanded(child: _body()),
          ],
        ),
      ),
    );
  }

  Widget _body() {
    final partners = ref.watch(benefitsVisiblePartnersProvider);
    final visible = partners.valueOrNull;
    if (visible == null) {
      final error = partners.error;
      if (error == null) return const BenefitsClubSkeleton();
      return AppErrorView(
        title: 'Não deu para abrir o clube',
        message: friendlyErrorMessage(
          error,
          action: 'Não foi possível carregar os parceiros',
          logReason: 'clube:parceiros',
        ),
        onRetry: () => ref.invalidate(benefitsActivePartnersProvider),
      );
    }
    _scheduleEntrySheets();
    return _content(visible);
  }

  Widget _content(List<Partner> visible) {
    final now = ref.watch(benefitsClockProvider)();
    final eligible = ref.watch(benefitsEligibleIdsProvider);
    final categories = categoriesOf(visible);
    // Categoria que sumiu da lista (parceiro desligado) volta para Todos.
    final selected = categories.contains(_category) ? _category : null;
    final shown = partnersInCategory(visible, selected);

    // Patrocinador oficial no topo, como na v1 (vitrine do master): fica
    // fixo com qualquer filtro. O destaque só aparece navegando sem filtro.
    final sponsor = masterSponsor(visible);
    final browsing = selected == null;
    // Master que também é o destaque: só o banner (sem duplicar).
    final featuredCandidate = browsing ? featuredPartner(visible) : null;
    final featured = featuredCandidate?.id == sponsor?.id
        ? null
        : featuredCandidate;
    final listed = featured == null
        ? shown
        : shown.where((p) => p.id != featured.id).toList();
    PartnerCardBadges badgesOf(Partner p) => PartnerCardBadges(
      isNew: isNewPartner(p, now),
      ending: endingBadge(p, now),
      locked: isPartnerLocked(p, eligible),
    );

    return ListView(
      padding: EdgeInsets.only(
        top: AppSpacing.xs,
        bottom: MediaQuery.paddingOf(context).bottom + AppSpacing.xxxl,
      ),
      children: [
        ..._memberCard(),
        if (sponsor != null) ...[
          _padded(
            BenefitsSponsorBanner(
              key: const Key('benefits-sponsor-banner'),
              partner: sponsor,
              onTap: () => _openPartner(sponsor, widget.source),
            ),
          ),
          const SizedBox(height: AppSpacing.md),
        ],
        if (featured != null) ...[
          _padded(
            BenefitsFeaturedCard(
              key: Key('benefits-featured-${featured.id}'),
              partner: featured,
              badges: badgesOf(featured),
              onTap: () => _openPartner(featured, BenefitSource.featured),
            ),
          ),
          const SizedBox(height: AppSpacing.md),
        ],
        if (visible.isEmpty)
          const AppEmptyView(
            icon: Icons.card_giftcard_rounded,
            title: 'Nenhum parceiro por aqui ainda',
            subtitle: 'Novos descontos chegam em breve. Volte para conferir.',
          )
        else ...[
          BenefitsCategoryChips(
            categories: categories,
            selected: selected,
            onSelected: (category) => setState(() => _category = category),
          ),
          const SizedBox(height: AppSpacing.md),
          _padded(
            BenefitsEyebrow(
              partnersCountLabel(
                shown.length,
                city: ref.watch(athleteProfileProvider).valueOrNull?.city,
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          for (final partner in listed) ...[
            _padded(
              BenefitsPartnerCard(
                key: Key('benefits-partner-${partner.id}'),
                partner: partner,
                badges: badgesOf(partner),
                onTap: () => _openPartner(partner, widget.source),
              ),
            ),
            const SizedBox(height: 10),
          ],
          const SizedBox(height: AppSpacing.xs),
          _padded(const BenefitsClubNote()),
        ],
      ],
    );
  }

  List<Widget> _memberCard() {
    final data = benefitsMemberCardData(ref);
    if (data == null) return const [];
    return [
      _padded(
        BenefitsMemberCard(
          data: data,
          onShowQr: () => showBenefitsQrSheet(
            context,
            data: data,
            onCopy: () => _copyMemberCode(data.code),
          ),
        ),
      ),
      const SizedBox(height: AppSpacing.md),
    ];
  }

  Future<void> _copyMemberCode(String code) async {
    await Clipboard.setData(ClipboardData(text: code));
    HapticFeedback.lightImpact();
    if (!mounted) return;
    showAppSnackBar(context, 'Código $code copiado');
  }

  Widget _padded(Widget child) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenH),
    child: child,
  );
}

/// Carteirinha a partir do perfil, da conta e da economia confirmada;
/// `null` sem perfil ou deslogado.
MemberCardData? benefitsMemberCardData(WidgetRef ref) {
  final uid = ref.watch(benefitsClubUidProvider);
  final AthleteProfile? profile = ref.watch(athleteProfileProvider).valueOrNull;
  if (uid.isEmpty || profile == null) return null;
  final hasLevel =
      profile.level.trim().isNotEmpty ||
      profile.levelsBySportFirestore.isNotEmpty;
  return MemberCardData(
    name: profile.name,
    code: athleteCode(uid),
    photoUrl: profile.avatarUrl,
    memberSince: ref.watch(benefitsMemberSinceProvider),
    sportLevel: memberSportLevelLabel(
      sport: profile.sport,
      level: hasLevel ? resolveAthleteLevelLabel(profile) : '',
    ),
    savings:
        ref.watch(benefitsMyBenefitsProvider).valueOrNull?.savings ??
        BenefitSavings.none,
  );
}
