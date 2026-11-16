import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/friendly_error_message.dart';
import '../../../core/location/user_location_providers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
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
import 'widgets/benefits_discovery.dart';
import 'widgets/benefits_member_card.dart';
import 'widgets/benefits_partner_cards.dart';
import 'widgets/benefits_skeleton.dart';
import 'widgets/partner_visuals.dart';

/// Altura do mapa do clube.
const double _mapHeight = 440;

/// Tela do Clube de Vantagens: carteirinha, banner do patrocinador oficial,
/// "Destaque da semana", busca e
/// mapa (com 8+ parceiros), chips das categorias presentes, a lista e o
/// aviso do pé. Grava `club_view` com a origem da visita, que segue para as
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
  final _search = TextEditingController();
  PartnerCategory? _category;
  String _query = '';
  BenefitsView _view = BenefitsView.list;
  bool _near = false;
  bool _entryStarted = false;

  @override
  void initState() {
    super.initState();
    ref
        .read(benefitsClubTrackerProvider)
        .track(BenefitEventType.clubView, source: widget.source);
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
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
              trailing: NexaIconSquareButton(
                key: const Key('benefits-open-mine'),
                icon: Icons.confirmation_number_outlined,
                size: benefitsTapTarget,
                tooltip: 'Meus benefícios',
                onTap: () => openMyBenefits(context),
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
    final discovery = discoveryEnabled(visible.length);
    final coords = discovery ? _coordinates() : null;

    final categories = categoriesOf(visible);
    // Categoria que sumiu da lista (parceiro desligado) volta para Todos.
    final selected = categories.contains(_category) ? _category : null;
    final query = discovery ? _query.trim() : '';
    var shown = searchPartners(partnersInCategory(visible, selected), query);
    final nearOn = _near && coords != null;
    if (nearOn)
      shown = sortByDistance(shown, coords.latitude, coords.longitude);

    // Patrocinador oficial no topo, como na v1 (vitrine do master): fica
    // fixo com qualquer filtro. O destaque só aparece navegando sem filtro.
    final sponsor = masterSponsor(visible);
    final browsing = selected == null && query.isEmpty && !nearOn;
    // Master que também é o destaque: só o banner (sem duplicar).
    final featuredCandidate = browsing ? featuredPartner(visible) : null;
    final featured = featuredCandidate?.id == sponsor?.id
        ? null
        : featuredCandidate;
    final listed = featured == null
        ? shown
        : shown.where((p) => p.id != featured.id).toList();
    final mapOn =
        discovery && _view == BenefitsView.map && benefitsMapAvailable(shown);

    String? distanceOf(Partner p) {
      if (coords == null) return null;
      final km = nearestDistanceKm(p, coords.latitude, coords.longitude);
      return km == null ? null : formatDistanceKm(km);
    }

    PartnerCardBadges badgesOf(Partner p) => PartnerCardBadges(
      isNew: isNewPartner(p, now),
      ending: endingBadge(p, now),
      locked: isPartnerLocked(p, eligible),
      distance: distanceOf(p),
    );

    final listSource = query.isEmpty ? widget.source : BenefitSource.search;

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
        if (discovery) ...[
          _padded(
            BenefitsSearchField(
              controller: _search,
              onChanged: (value) => setState(() => _query = value),
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          _padded(
            BenefitsViewControls(
              view: _view,
              onView: (view) => setState(() => _view = view),
              showMapToggle: benefitsMapAvailable(visible),
              nearAvailable: coords != null,
              near: nearOn,
              onNear: (near) => setState(() => _near = near),
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
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
              nearOn
                  ? '${shown.length == 1 ? '1 parceiro' : '${shown.length} parceiros'} perto de você'
                  : partnersCountLabel(
                      shown.length,
                      city: ref.watch(athleteProfileProvider).valueOrNull?.city,
                    ),
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          if (shown.isEmpty && query.isNotEmpty)
            _padded(_NoResults(query: query))
          else if (mapOn)
            _padded(
              SizedBox(
                height: _mapHeight,
                child: BenefitsPartnerMap(
                  partners: shown,
                  center: coords,
                  showUserLocation: coords != null,
                  distanceOf: distanceOf,
                  onOpenPartner: (p) => _openPartner(p, BenefitSource.map),
                ),
              ),
            )
          else
            for (final partner in listed) ...[
              _padded(
                BenefitsPartnerCard(
                  key: Key('benefits-partner-${partner.id}'),
                  partner: partner,
                  badges: badgesOf(partner),
                  onTap: () => _openPartner(partner, listSource),
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

  /// Coordenadas do GPS só com a permissão JÁ concedida (o provider nunca
  /// pede; ver `userLocationProvider`).
  ({double latitude, double longitude})? _coordinates() {
    final location = ref.watch(userLocationProvider).valueOrNull;
    final lat = location?.latitude;
    final lng = location?.longitude;
    if (lat == null || lng == null || !lat.isFinite || !lng.isFinite) {
      return null;
    }
    return (latitude: lat, longitude: lng);
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

class _NoResults extends StatelessWidget {
  const _NoResults({required this.query});

  final String query;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xl),
      child: Text(
        'Nenhum parceiro encontrado para "$query".',
        textAlign: TextAlign.center,
        style: AppTypography.bodyM.copyWith(color: colors.onSurfaceMuted),
      ),
    );
  }
}
