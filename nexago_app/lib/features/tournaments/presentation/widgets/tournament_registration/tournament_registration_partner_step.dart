import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/auth/auth_providers.dart';
import '../../../../../core/search/search_keywords.dart';
import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../data/partner_search_service.dart';
import '../../../data/recent_partners_repository.dart';
import '../../../domain/app_user_profile.dart';
import '../../../domain/partner_search_logic.dart';
import '../../../domain/tournament_discovery_models.dart';
import '../../../domain/tournament_registration_logic.dart';
import 'tournament_registration_partner_candidate_tile.dart';
import 'tournament_registration_partner_phone_card.dart';
import 'tournament_registration_recent_partners_chips.dart';

class TournamentRegistrationPartnerStep extends ConsumerStatefulWidget {
  const TournamentRegistrationPartnerStep({
    super.key,
    required this.category,
    required this.selectedUserId,
    required this.onSelected,
    required this.onInviteByPhone,
  });

  final TournamentCategoryOffer category;
  final String? selectedUserId;
  final ValueChanged<TournamentRegistrationPartnerCandidate> onSelected;
  final VoidCallback onInviteByPhone;

  @override
  ConsumerState<TournamentRegistrationPartnerStep> createState() =>
      _TournamentRegistrationPartnerStepState();
}

class _TournamentRegistrationPartnerStepState
    extends ConsumerState<TournamentRegistrationPartnerStep> {
  final _searchController = TextEditingController();
  final _focusNode = FocusNode();

  List<AppUserProfile> _displayPartners = const [];
  List<AppUserProfile> _recentPartners = const [];
  bool _loadingPartners = true;
  bool _focused = false;
  Timer? _searchDebounce;

  @override
  void initState() {
    super.initState();
    _focusNode.addListener(() => setState(() => _focused = _focusNode.hasFocus));
    _searchController.addListener(_onSearchChanged);
    _loadInitialPartners();
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _searchController.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _onSearchChanged() {
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 300), _runPartnerSearch);
    setState(() {});
  }

  Future<void> _loadInitialPartners() async {
    final uid = ref.read(authProvider).valueOrNull?.uid ?? '';
    if (uid.isEmpty) {
      if (mounted) setState(() => _loadingPartners = false);
      return;
    }

    try {
      final service = ref.read(partnerSearchServiceProvider);
      final recentRepo = ref.read(recentPartnersRepositoryProvider);
      final partnersFuture = service.listPartners(
        currentUserId: uid,
        categoryGenderType: widget.category.genderType,
      );
      final recentFuture = recentRepo.loadRecentPartners(
        currentUserId: uid,
        categoryGenderType: widget.category.genderType,
      );
      final partners = await partnersFuture;
      final recent = await recentFuture;

      if (!mounted) return;
      setState(() {
        _displayPartners = partners;
        _recentPartners =
            recent.where((profile) => profile.uid != uid).toList();
        _loadingPartners = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loadingPartners = false);
    }
  }

  Future<void> _runPartnerSearch() async {
    final uid = ref.read(authProvider).valueOrNull?.uid ?? '';
    if (uid.isEmpty || !mounted) return;

    final query = _searchController.text.trim();
    if (!isSearchTermLongEnough(query)) {
      await _loadInitialPartners();
      return;
    }

    setState(() => _loadingPartners = true);

    try {
      final service = ref.read(partnerSearchServiceProvider);
      final results = await service.searchPartners(
        currentUserId: uid,
        categoryGenderType: widget.category.genderType,
        query: query,
      );
      if (!mounted) return;
      setState(() {
        _displayPartners = results;
        _loadingPartners = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loadingPartners = false);
    }
  }

  void _selectProfile(AppUserProfile profile, {String? tagLabel}) {
    widget.onSelected(
      partnerCandidateFromProfile(profile, tagLabel: tagLabel),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final query = _searchController.text.trim();
    final isFiltering = isSearchTermLongEnough(query);
    final displayProfiles = _displayPartners;
    final resultsHeader = isFiltering
        ? partnerResultsHeader(
            count: displayProfiles.length,
            category: widget.category,
          )
        : displayProfiles.isEmpty
            ? ''
            : '${displayProfiles.length} ATLETAS · ${categoryBadgeLabel(widget.category)}';

    final borderColor = _focused || query.isNotEmpty
        ? AppColors.brand
        : context.themeColors.onSurfaceMuted.withValues(alpha: 0.12);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Quem joga\ncom você?',
          style: AppTypography.soraRegular(
            fontSize: 26,
            fontWeight: FontWeight.w800,
            color: context.themeColors.onSurface,
            height: 1.05,
            letterSpacing: -0.4,
          ),
        ),
        SizedBox(height: 18),
        TextField(
          controller: _searchController,
          focusNode: _focusNode,
          cursorColor: AppColors.brand,
          style: theme.textTheme.bodyLarge?.copyWith(
            color: context.themeColors.onSurface,
            fontWeight: FontWeight.w500,
          ),
          decoration: InputDecoration(
            hintText: 'Buscar por nome, apelido ou e-mail',
            hintStyle: theme.textTheme.bodyMedium?.copyWith(
              color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.6),
            ),
            prefixIcon: Icon(
              Icons.search_rounded,
              color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.62),
            ),
            filled: true,
            fillColor: context.themeColors.surfaceRaised,
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: BorderSide(color: borderColor),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: BorderSide(color: AppColors.brand),
            ),
            contentPadding: const EdgeInsets.symmetric(vertical: 14),
          ),
        ),
        if (!isFiltering && !_loadingPartners && _recentPartners.isNotEmpty) ...[
          SizedBox(height: 16),
          TournamentRegistrationRecentPartnersChips(
            partners: _recentPartners,
            selectedUserId: widget.selectedUserId,
            onSelected: (p) => _selectProfile(p, tagLabel: 'Jogou com você'),
          ),
        ],
        if (resultsHeader.isNotEmpty) ...[
          SizedBox(height: 22),
          Text(
            resultsHeader,
            style: AppTypography.mono(
              color: context.themeColors.onSurfaceMuted,
              fontWeight: FontWeight.w600,
              fontSize: 10,
              letterSpacing: 1.4,
            ),
          ),
        ],
        SizedBox(height: 12),
        if (_loadingPartners)
          Padding(
            padding: EdgeInsets.symmetric(vertical: 24),
            child: Center(
              child: CircularProgressIndicator(
                color: AppColors.brand,
                strokeWidth: 2,
              ),
            ),
          )
        else if (displayProfiles.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 24),
            child: Text(
              isFiltering
                  ? 'Nenhum atleta encontrado.'
                  : 'Nenhum atleta cadastrado no momento.',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: context.themeColors.onSurfaceMuted,
              ),
            ),
          )
        else
          ...displayProfiles.map(
            (profile) {
              final candidate = partnerCandidateFromProfile(
                profile,
                tagLabel: !isFiltering &&
                        _recentPartners.any((p) => p.uid == profile.uid)
                    ? 'Jogou com você'
                    : null,
              );
              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: TournamentRegistrationPartnerCandidateTile(
                  candidate: candidate,
                  selected: widget.selectedUserId == profile.uid,
                  onTap: () => _selectProfile(
                    profile,
                    tagLabel: candidate.tagLabel,
                  ),
                ),
              );
            },
          ),
        SizedBox(height: 8),
        TournamentRegistrationPartnerPhoneCard(onTap: widget.onInviteByPhone),
      ],
    );
  }
}
