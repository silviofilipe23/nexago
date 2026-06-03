import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../../../core/auth/auth_providers.dart';
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

  List<AppUserProfile> _recentPartners = const [];
  List<AppUserProfile> _searchResults = const [];
  bool _loadingRecent = true;
  bool _loadingSearch = false;
  bool _focused = false;
  Timer? _debounce;
  int _searchGeneration = 0;

  @override
  void initState() {
    super.initState();
    _focusNode.addListener(() => setState(() => _focused = _focusNode.hasFocus));
    _loadRecentPartners();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchController.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  Future<void> _loadRecentPartners() async {
    final uid = ref.read(authProvider).valueOrNull?.uid ?? '';
    if (uid.isEmpty) {
      if (mounted) setState(() => _loadingRecent = false);
      return;
    }

    try {
      final list = await ref.read(recentPartnersRepositoryProvider).loadRecentPartners(
            currentUserId: uid,
            categoryGenderType: widget.category.genderType,
          );
      if (mounted) {
        setState(() {
          _recentPartners = list;
          _loadingRecent = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loadingRecent = false);
    }
  }

  void _onSearchChanged(String value) {
    setState(() {});
    _debounce?.cancel();
    if (value.trim().length < 2) {
      setState(() {
        _searchResults = const [];
        _loadingSearch = false;
      });
      return;
    }

    _debounce = Timer(const Duration(milliseconds: 300), () {
      _runSearch(value);
    });
  }

  Future<void> _runSearch(String term) async {
    final generation = ++_searchGeneration;
    setState(() => _loadingSearch = true);

    final uid = ref.read(authProvider).valueOrNull?.uid ?? '';
    try {
      final results = await ref.read(partnerSearchServiceProvider).searchPartner(
            term: term,
            currentUserId: uid,
            categoryGenderType: widget.category.genderType,
          );
      if (!mounted || generation != _searchGeneration) return;
      setState(() {
        _searchResults = results;
        _loadingSearch = false;
      });
    } catch (_) {
      if (!mounted || generation != _searchGeneration) return;
      setState(() {
        _searchResults = const [];
        _loadingSearch = false;
      });
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
    final isSearching = query.length >= 2;

    final displayProfiles = isSearching ? _searchResults : _recentPartners;
    final resultsHeader = isSearching
        ? partnerResultsHeader(count: _searchResults.length, category: widget.category)
        : _recentPartners.isEmpty
            ? ''
            : '${_recentPartners.length} RECENTES · ${categoryBadgeLabel(widget.category)}';

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
          onChanged: _onSearchChanged,
        ),
        if (!isSearching && !_loadingRecent && _recentPartners.isNotEmpty) ...[
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
        if (_loadingRecent && !isSearching)
          Padding(
            padding: EdgeInsets.symmetric(vertical: 24),
            child: Center(
              child: CircularProgressIndicator(
                color: AppColors.brand,
                strokeWidth: 2,
              ),
            ),
          )
        else if (_loadingSearch && isSearching)
          Padding(
            padding: EdgeInsets.symmetric(vertical: 24),
            child: Center(
              child: CircularProgressIndicator(
                color: AppColors.brand,
                strokeWidth: 2,
              ),
            ),
          )
        else if (isSearching && query.length >= 2 && _searchResults.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 24),
            child: Text(
              'Nenhum atleta encontrado.',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: context.themeColors.onSurfaceMuted,
              ),
            ),
          )
        else if (!isSearching && !_loadingRecent && _recentPartners.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 16),
            child: Text(
              'Digite pelo menos 2 caracteres para buscar um parceiro.',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: context.themeColors.onSurfaceMuted,
                fontWeight: FontWeight.w500,
              ),
            ),
          )
        else
          ...displayProfiles.map(
            (profile) {
              final candidate = partnerCandidateFromProfile(
                profile,
                tagLabel: !isSearching &&
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
