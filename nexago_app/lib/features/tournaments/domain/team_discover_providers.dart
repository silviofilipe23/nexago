import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../athlete/domain/athlete_follow_providers.dart';
import '../../athlete/domain/athlete_profile.dart';
import '../../athlete/domain/athlete_profile_providers.dart';
import '../data/team_discover_repository.dart';
import 'team_discover_logic.dart';
import 'team_discover_models.dart';
import '../../../core/auth/auth_providers.dart';

class TeamDiscoverState {
  const TeamDiscoverState({
    this.rawEntries = const [],
    this.displayEntries = const [],
    this.filters = TeamDiscoverFilters.defaults,
    this.sort = TeamDiscoverSort.ranking,
    this.searchQuery = '',
    this.isLoading = false,
    this.isLoadingMore = false,
    this.hasMore = true,
    this.lastDocumentId,
    this.errorMessage,
    this.viewerTeamPoints,
  });

  final List<TeamDiscoverEntry> rawEntries;
  final List<TeamDiscoverEntry> displayEntries;
  final TeamDiscoverFilters filters;
  final TeamDiscoverSort sort;
  final String searchQuery;
  final bool isLoading;
  final bool isLoadingMore;
  final bool hasMore;
  final String? lastDocumentId;
  final String? errorMessage;
  final int? viewerTeamPoints;

  int get totalCount => displayEntries.length;

  int onlineCount(DateTime now) => countOnlineTeams(displayEntries, now: now);

  bool get supportsOnlineFilter =>
      rawEntries.any((e) => e.supportsOnlineStatus);

  TeamDiscoverState copyWith({
    List<TeamDiscoverEntry>? rawEntries,
    List<TeamDiscoverEntry>? displayEntries,
    TeamDiscoverFilters? filters,
    TeamDiscoverSort? sort,
    String? searchQuery,
    bool? isLoading,
    bool? isLoadingMore,
    bool? hasMore,
    Object? lastDocumentId = _unset,
    Object? errorMessage = _unset,
    int? viewerTeamPoints,
  }) {
    return TeamDiscoverState(
      rawEntries: rawEntries ?? this.rawEntries,
      displayEntries: displayEntries ?? this.displayEntries,
      filters: filters ?? this.filters,
      sort: sort ?? this.sort,
      searchQuery: searchQuery ?? this.searchQuery,
      isLoading: isLoading ?? this.isLoading,
      isLoadingMore: isLoadingMore ?? this.isLoadingMore,
      hasMore: hasMore ?? this.hasMore,
      lastDocumentId: identical(lastDocumentId, _unset)
          ? this.lastDocumentId
          : lastDocumentId as String?,
      errorMessage: identical(errorMessage, _unset)
          ? this.errorMessage
          : errorMessage as String?,
      viewerTeamPoints: viewerTeamPoints ?? this.viewerTeamPoints,
    );
  }

  static const _unset = Object();
}

class TeamDiscoverNotifier extends AutoDisposeNotifier<TeamDiscoverState> {
  @override
  TeamDiscoverState build() {
    Future.microtask(loadInitial);
    return const TeamDiscoverState(isLoading: true);
  }

  TeamDiscoverRepository get _repo => ref.read(teamDiscoverRepositoryProvider);

  String? get _currentUid => ref.read(authProvider).valueOrNull?.uid.trim();

  AthleteProfile? get _viewerProfile =>
      ref.read(athleteProfileProvider).valueOrNull;

  Future<Set<String>> _followingIds() async {
    final uid = _currentUid;
    if (uid == null || uid.isEmpty) return {};
    return ref.read(athleteFollowServiceProvider).fetchFollowingIds(uid);
  }

  List<TeamDiscoverEntry> _applyPipeline(List<TeamDiscoverEntry> source) {
    final filtered = applyTeamDiscoverFilters(
      entries: source,
      filters: state.filters,
      viewerProfile: _viewerProfile,
      searchQuery: state.searchQuery,
      viewerTeamPoints: state.viewerTeamPoints,
    );
    return sortTeamDiscoverEntries(
      entries: filtered,
      sort: state.sort,
      viewerProfile: _viewerProfile,
    );
  }

  void _publishDisplay(List<TeamDiscoverEntry> raw) {
    state = state.copyWith(
      rawEntries: raw,
      displayEntries: _applyPipeline(raw),
      errorMessage: null,
    );
  }

  Future<void> loadInitial() async {
    state = state.copyWith(isLoading: true, errorMessage: null);
    _repo.clearCaches();
    try {
      final following = await _followingIds();
      final viewerPts = await _repo.viewerTeamPoints(_currentUid);
      final page = await _repo.fetchPage();
      final enriched = await _repo.enrichEntries(
        teams: page.teams,
        currentUserId: _currentUid,
        followingIds: following,
      );
      state = state.copyWith(
        rawEntries: enriched,
        displayEntries: _applyPipeline(enriched),
        isLoading: false,
        hasMore: page.hasMore,
        lastDocumentId: page.lastDocumentId,
        viewerTeamPoints: viewerPts,
        errorMessage: null,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, errorMessage: '$e');
    }
  }

  Future<void> refresh() => loadInitial();

  Future<void> loadMore() async {
    if (!state.hasMore || state.isLoadingMore) return;
    final cursor = state.lastDocumentId;
    if (cursor == null || cursor.isEmpty) return;

    state = state.copyWith(isLoadingMore: true);
    try {
      final following = await _followingIds();
      final page = await _repo.fetchPage(startAfterDocumentId: cursor);
      final enriched = await _repo.enrichEntries(
        teams: page.teams,
        currentUserId: _currentUid,
        followingIds: following,
      );
      final merged = [...state.rawEntries, ...enriched];
      state = state.copyWith(
        rawEntries: merged,
        displayEntries: _applyPipeline(merged),
        isLoadingMore: false,
        hasMore: page.hasMore,
        lastDocumentId: page.lastDocumentId,
      );
    } catch (e) {
      state = state.copyWith(isLoadingMore: false, errorMessage: '$e');
    }
  }

  void setSearchQuery(String query) {
    state = state.copyWith(searchQuery: query);
    _publishDisplay(state.rawEntries);
  }

  void setSort(TeamDiscoverSort sort) {
    state = state.copyWith(sort: sort);
    _publishDisplay(state.rawEntries);
  }

  void setQuickCategory(TeamDiscoverQuickCategory category) {
    final filters = state.filters.copyWith(quickCategory: category);
    state = state.copyWith(filters: filters);
    _publishDisplay(state.rawEntries);
  }

  void applyFilters(TeamDiscoverFilters filters) {
    state = state.copyWith(filters: filters);
    _publishDisplay(state.rawEntries);
  }

  void updateFollowing(String athleteId, bool isFollowing) {
    final raw = state.rawEntries
        .map(
          (e) => e.followTargetUserId == athleteId
              ? TeamDiscoverEntry(
                  teamId: e.teamId,
                  team: e.team,
                  player1: e.player1,
                  player2: e.player2,
                  ranking: e.ranking,
                  isFollowing: isFollowing,
                  isCurrentUserTeam: e.isCurrentUserTeam,
                )
              : e,
        )
        .toList();
    _publishDisplay(raw);
  }

  List<TeamDiscoverEntry> previewForFilters(TeamDiscoverFilters draft) {
    final filtered = applyTeamDiscoverFilters(
      entries: state.rawEntries,
      filters: draft,
      viewerProfile: _viewerProfile,
      searchQuery: state.searchQuery,
      viewerTeamPoints: state.viewerTeamPoints,
    );
    return sortTeamDiscoverEntries(
      entries: filtered,
      sort: state.sort,
      viewerProfile: _viewerProfile,
    );
  }
}

final teamDiscoverProvider =
    AutoDisposeNotifierProvider<TeamDiscoverNotifier, TeamDiscoverState>(
  TeamDiscoverNotifier.new,
);
