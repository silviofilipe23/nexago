import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/friendly_error_message.dart';
import '../../../core/links/open_external_url.dart';
import '../../../core/location/user_location_providers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/system_ui_overlay_style.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/app_status_views.dart';
import '../../athlete/domain/athlete_profile_providers.dart';
import '../application/benefits_club_providers.dart';
import '../domain/benefit_event.dart';
import '../domain/benefits_club_logic.dart';
import '../domain/benefits_club_premium_logic.dart';
import '../domain/partner.dart';
import 'benefits_club_navigation.dart';
import 'widgets/benefit_partner_extras.dart';
import 'widgets/benefit_partner_level_ladder.dart';
import 'widgets/benefit_partner_parts.dart';
import 'widgets/benefits_club_parts.dart';
import 'widgets/benefits_member_card.dart';
import 'widgets/partner_visuals.dart';

/// Aviso do coração: curto, para não cobrir o botão do pé por muito tempo.
const Duration _saveToastDuration = Duration(seconds: 2);

/// Tela de um parceiro: capa, logo, salvar, benefício, termos em chips,
/// cupom, "Onde usar", "Como usar" e o botão fixo no pé. O botão de link
/// copia o cupom antes de abrir o site. Parceiro com requisito que a pessoa
/// não cumpre aparece bloqueado, com "Como desbloquear". Grava
/// `partner_view`, `code_copy` e `cta_click` com a origem da visita.
class BenefitPartnerPage extends ConsumerStatefulWidget {
  const BenefitPartnerPage({
    super.key,
    required this.partnerId,
    required this.source,
  });

  final String partnerId;
  final BenefitSource source;

  @override
  ConsumerState<BenefitPartnerPage> createState() => _BenefitPartnerPageState();
}

class _BenefitPartnerPageState extends ConsumerState<BenefitPartnerPage> {
  bool _viewTracked = false;

  /// Cupom que veio da `claimBenefit` (requisito ou desconto por elo).
  String? _claimedCoupon;
  bool _claiming = false;
  bool _redeeming = false;

  @override
  void initState() {
    super.initState();
    // `partner_view` uma vez, quando o parceiro carrega (e só se ele existe
    // para este atleta: o backend recusaria o evento de qualquer forma).
    ref.listenManual<AsyncValue<Partner?>>(
      benefitsPartnerProvider(widget.partnerId),
      (_, next) {
        if (_viewTracked || next.valueOrNull == null) return;
        _viewTracked = true;
        _track(BenefitEventType.partnerView);
      },
      fireImmediately: true,
    );
  }

  void _track(BenefitEventType type) => ref
      .read(benefitsClubTrackerProvider)
      .track(type, source: widget.source, partnerId: widget.partnerId);

  void _back() => benefitsBack(context, benefitsClubLocation(widget.source));

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(benefitsPartnerProvider(widget.partnerId));
    final partner = async.valueOrNull;
    if (partner != null) return _partnerView(partner);

    final error = async.error;
    final Widget body;
    if (async.isLoading && error == null) {
      body = const AppLoadingView();
    } else if (error != null) {
      body = AppErrorView(
        title: 'Não deu para abrir o benefício',
        message: friendlyErrorMessage(
          error,
          action: 'Não foi possível carregar o parceiro',
          logReason: 'clube:parceiro',
        ),
        onRetry: () => ref.invalidate(benefitsActivePartnersProvider),
      );
    } else {
      body = AppEmptyView(
        icon: Icons.card_giftcard_rounded,
        title: 'Benefício indisponível',
        subtitle:
            'Este parceiro não está mais no clube ou não atende a sua '
            'cidade.',
        actionLabel: 'Ver o clube',
        onAction: _back,
      );
    }
    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            BenefitsTitleHeader(
              title: 'Clube de Vantagens',
              subtitle: 'Descontos dos parceiros NexaGO',
              onBack: _back,
            ),
            Expanded(child: body),
          ],
        ),
      ),
    );
  }

  /// Cupom que a tela já conhece: o público/do atleta ou o da `claimBenefit`.
  String? _knownCoupon(Partner partner, String uid) =>
      couponViaClaim(partner) ? _claimedCoupon : couponFor(partner, uid);

  Widget _partnerView(Partner partner) {
    final uid = ref.watch(benefitsClubUidProvider);
    final city = ref.watch(athleteProfileProvider).valueOrNull?.city;
    final locked = isPartnerLocked(
      partner,
      ref.watch(benefitsEligibleIdsProvider),
    );
    final saved = ref.watch(benefitsSavedIdsProvider).valueOrNull;
    final now = ref.watch(benefitsClockProvider)();
    final coupon = locked ? null : _knownCoupon(partner, uid);
    final isLead = partner.ctaType == PartnerCtaType.leadForm;
    final ending = endingBadge(partner, now);
    final showClaim =
        !locked &&
        couponViaClaim(partner) &&
        partner.couponMode != PartnerCouponMode.none &&
        _claimedCoupon == null;

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: systemUiOverlayForBrightness(
        BenefitPartnerHero.isDark(
              partner,
              locked: locked,
              themeIsDark: Theme.of(context).brightness == Brightness.dark,
            )
            ? Brightness.dark
            : Brightness.light,
      ),
      child: Scaffold(
        backgroundColor: context.themeColors.canvas,
        body: Column(
          children: [
            Expanded(
              child: ListView(
                padding: EdgeInsets.zero,
                children: [
                  BenefitPartnerHero(
                    partner: partner,
                    onBack: _back,
                    locked: locked,
                    saved: uid.isEmpty ? null : saved?.contains(partner.id),
                    onToggleSaved: () => _toggleSaved(
                      partner,
                      uid,
                      !(saved?.contains(partner.id) ?? false),
                    ),
                    badge: locked ? requirementBadge(partner) : ending,
                    badgeIcon: locked
                        ? Icons.lock_outline_rounded
                        : Icons.schedule_rounded,
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(
                      AppSpacing.screenH,
                      AppSpacing.sm,
                      AppSpacing.screenH,
                      AppSpacing.xl,
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        BenefitPartnerIdentity(
                          partner: partner,
                          locationLabel: partnerLocationLabel(
                            partner,
                            athleteCity: city,
                          ),
                        ),
                        const SizedBox(height: AppSpacing.lg),
                        BenefitDetailsCard(partner: partner),
                        if (partner.levelLadder case final ladder?) ...[
                          const SizedBox(height: AppSpacing.md),
                          BenefitLevelLadder(ladder: ladder),
                        ],
                        if (partner.termsTags.isNotEmpty) ...[
                          const SizedBox(height: AppSpacing.md),
                          BenefitTermsChips(tags: partner.termsTags),
                        ],
                        ..._couponSection(
                          partner,
                          uid,
                          locked,
                          coupon,
                          showClaim,
                        ),
                        if (locked) ...[
                          const SizedBox(height: AppSpacing.md),
                          BenefitUnlockCard(partner: partner),
                        ],
                        if (partner.locations.isNotEmpty) ...[
                          const SizedBox(height: AppSpacing.lg + 2),
                          const BenefitsEyebrow('Onde usar'),
                          const SizedBox(height: 10),
                          ..._locationTiles(partner),
                        ],
                        if (!locked) ...[
                          const SizedBox(height: AppSpacing.lg + 2),
                          BenefitsEyebrow(
                            isLead ? 'Como funciona' : 'Como usar',
                          ),
                          const SizedBox(height: 10),
                          BenefitSteps(
                            steps: howToUseSteps(partner, coupon: coupon),
                            bold: [partner.ctaLabel, ?coupon, 'WhatsApp'],
                          ),
                        ],
                        if (partner.terms.isNotEmpty) ...[
                          const SizedBox(height: AppSpacing.md),
                          BenefitTermsSection(terms: partner.terms),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
            if (locked)
              _lockedBar(partner)
            else if (isLead)
              _leadBar(partner)
            else
              _linkBar(partner, uid),
          ],
        ),
      ),
    );
  }

  List<Widget> _couponSection(
    Partner partner,
    String uid,
    bool locked,
    String? coupon,
    bool showClaim,
  ) {
    if (locked) {
      if (partner.couponMode == PartnerCouponMode.none) return const [];
      return const [SizedBox(height: AppSpacing.md), BenefitMaskedCoupon()];
    }
    if (showClaim) {
      return [
        const SizedBox(height: AppSpacing.md),
        BenefitClaimCouponBox(busy: _claiming, onClaim: () => _claim(partner)),
      ];
    }
    if (coupon == null) return const [];
    return [
      const SizedBox(height: AppSpacing.md),
      BenefitCodeRow(
        label: 'Seu cupom',
        code: coupon,
        copyKey: const Key('benefits-copy-coupon'),
        onCopy: () => _copyCoupon(coupon),
      ),
    ];
  }

  List<Widget> _locationTiles(Partner partner) {
    final location = ref.watch(userLocationProvider).valueOrNull;
    final lat = location?.latitude;
    final lng = location?.longitude;
    return [
      for (final place in partner.locations) ...[
        BenefitLocationTile(
          location: place,
          distance: lat == null || lng == null
              ? null
              : formatDistanceKm(distanceToLocationKm(place, lat, lng)),
        ),
        const SizedBox(height: AppSpacing.sm),
      ],
    ];
  }

  Widget _linkBar(Partner partner, String uid) {
    final url = trackedPartnerUrl(partner.link, athleteCode(uid));
    final copies = partner.couponMode != PartnerCouponMode.none;
    return BenefitCtaBar(
      buttonKey: const Key('benefits-partner-cta'),
      label: partner.ctaLabel,
      icon: Icons.open_in_new_rounded,
      busy: _redeeming,
      hint: url == null
          ? 'O site deste parceiro está indisponível agora.'
          : copies
          ? 'Copia o cupom e abre o site da ${partner.name}'
          : 'Abre o site da ${partner.name}',
      onPressed: url == null ? null : () => _redeem(partner, uid),
    );
  }

  Widget _leadBar(Partner partner) => BenefitCtaBar(
    buttonKey: const Key('benefits-partner-cta'),
    label: partner.ctaLabel,
    hint: 'Seus dados só vão para a ${partner.name} com a sua autorização',
    onPressed: _openLeadForm,
  );

  Widget _lockedBar(Partner partner) {
    final req = partner.requirement;
    const hint = 'Sem botão de resgate enquanto o benefício estiver bloqueado';
    final tournamentId = req.tournamentIds.firstOrNull;
    return switch (req.type) {
      PartnerRequirementType.squad => BenefitCtaBar(
        buttonKey: const Key('benefits-unlock-cta'),
        label: 'Conhecer o Squad',
        icon: Icons.arrow_forward_rounded,
        secondary: true,
        hint: hint,
        onPressed: () => context.pushNamed(AppRouteNames.squad),
      ),
      PartnerRequirementType.tournament when tournamentId != null =>
        BenefitCtaBar(
          buttonKey: const Key('benefits-unlock-cta'),
          label: 'Ver o torneio',
          icon: Icons.arrow_forward_rounded,
          secondary: true,
          hint: hint,
          onPressed: () => context.pushNamed(
            AppRouteNames.tournamentDetail,
            pathParameters: {'tournamentId': tournamentId},
          ),
        ),
      _ => const BenefitCtaBar(label: null, hint: hint, onPressed: null),
    };
  }

  Future<void> _toggleSaved(Partner partner, String uid, bool saved) async {
    if (uid.isEmpty) return;
    HapticFeedback.lightImpact();
    try {
      await ref
          .read(benefitsClubRepositoryProvider)
          .setSaved(uid: uid, partnerId: partner.id, saved: saved);
      if (!mounted) return;
      showAppSnackBar(
        context,
        saved
            ? '${partner.name} salvo em Meus benefícios.'
            : '${partner.name} saiu dos salvos.',
        duration: _saveToastDuration,
      );
    } on Exception catch (error) {
      if (!mounted) return;
      showAppSnackBar(
        context,
        friendlyErrorMessage(
          error,
          action: 'Não foi possível salvar o parceiro',
          logReason: 'clube:salvar',
        ),
        isError: true,
      );
    }
  }

  /// Pede o cupom à `claimBenefit` (requisito ou desconto por elo). `null` em erro
  /// (a mensagem amigável já apareceu).
  Future<String?> _claim(Partner partner) async {
    final known = _claimedCoupon;
    if (known != null) return known;
    setState(() => _claiming = true);
    try {
      final coupon = await ref
          .read(benefitsClubServiceProvider)
          .claimBenefit(partnerId: partner.id, source: widget.source);
      if (mounted) setState(() => _claimedCoupon = coupon);
      return coupon;
    } on Exception catch (error) {
      if (mounted) {
        showAppSnackBar(
          context,
          friendlyErrorMessage(
            error,
            action: 'Não foi possível liberar o cupom',
            logReason: 'clube:claim',
          ),
          isError: true,
        );
      }
      return null;
    } finally {
      if (mounted) setState(() => _claiming = false);
    }
  }

  Future<void> _copyCoupon(String coupon) async {
    await Clipboard.setData(ClipboardData(text: coupon));
    HapticFeedback.lightImpact();
    _track(BenefitEventType.codeCopy);
    if (!mounted) return;
    showAppSnackBar(context, 'Cupom copiado');
  }

  /// Resgate em um toque: copia o cupom (avisando), registra `code_copy` e
  /// `cta_click` e abre o site já com o cupom quando o parceiro aceita.
  Future<void> _redeem(Partner partner, String uid) async {
    if (_redeeming) return;
    setState(() => _redeeming = true);
    try {
      String? coupon = _knownCoupon(partner, uid);
      final needsClaim =
          couponViaClaim(partner) &&
          partner.couponMode != PartnerCouponMode.none &&
          coupon == null;
      if (needsClaim) {
        coupon = await _claim(partner);
        if (coupon == null) return;
      }
      if (coupon != null) {
        await Clipboard.setData(ClipboardData(text: coupon));
        HapticFeedback.lightImpact();
        _track(BenefitEventType.codeCopy);
        if (mounted) {
          showAppSnackBar(
            context,
            'Cupom $coupon copiado. É só colar no fechamento.',
          );
        }
      }
      _track(BenefitEventType.ctaClick);
      final url = trackedPartnerUrl(
        partner.link,
        athleteCode(uid),
        couponParam: partner.couponUrlParam,
        coupon: coupon,
      );
      final opened = url != null && await openExternalUrl(url);
      if (opened || !mounted) return;
      showAppSnackBar(
        context,
        'Não foi possível abrir o site da ${partner.name}.',
        isError: true,
      );
    } finally {
      if (mounted) setState(() => _redeeming = false);
    }
  }

  Future<void> _openLeadForm() async {
    _track(BenefitEventType.ctaClick);
    final sent = await openBenefitsLeadForm(
      context,
      widget.partnerId,
      widget.source,
    );
    // Enviou e tocou em "Voltar ao clube": esta tela sai junto.
    if (sent == true && mounted) _back();
  }
}
