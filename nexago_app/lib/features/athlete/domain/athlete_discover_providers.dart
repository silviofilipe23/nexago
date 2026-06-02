import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import '../data/athlete_discover_repository.dart';
import 'athlete_discover_logic.dart';
import 'athlete_follow_providers.dart';
import 'athlete_discover_models.dart';
import 'athlete_profile.dart';
import 'athlete_profile_providers.dart';

class AthleteDiscoverState {
  const AthleteDiscoverState({
    this.rawEntries = const [],
    this.displayEntries = const [],
    this.filters = AthleteDiscoverFilters.defaults,
    this.sort = AthleteDiscoverSort.ranking,
    this.searchQuery = '',
    this.isLoading = false,
    this.isLoadingMore = false,
    this.hasMore = true,
    this.lastDocumentId,
    this.errorMessage,
    this.isSearchMode = false,
  });

  final List<AthleteDiscoverEntry> rawEntries;
  final List<AthleteDiscoverEntry> displayEntries;
  final AthleteDiscoverFilters filters;
  final AthleteDiscoverSort sort;
  final String searchQuery;
  final bool isLoading;
  final bool isLoadingMore;
  final bool hasMore;
  final String? lastDocumentId;
  final String? errorMessage;
  final bool isSearchMode;

  int get totalCount => displayEntries.length;

  int onlineCount(DateTime now) => countOnlineAthletes(displayEntries, now: now);

  bool get supportsOnlineFilter =>
      rawEntries.any((e) => e.supportsOnlineStatus);

  AthleteDiscoverState copyWith({
    List<AthleteDiscoverEntry>? rawEntries,
    List<AthleteDiscoverEntry>? displayEntries,
    AthleteDiscoverFilters? filters,
    AthleteDiscoverSort? sort,
    String? searchQuery,
    bool? isLoading,
    bool? isLoadingMore,
    bool? hasMore,
    Object? lastDocumentId = _unset,
    Object? errorMessage = _unset,
    bool? isSearchMode,
  }) {
    return AthleteDiscoverState(
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
      isSearchMode: isSearchMode ?? this.isSearchMode,
    );
  }

  static const _unset = Object();
}

class AthleteDiscoverNotifier extends AutoDisposeNotifier<AthleteDiscoverState> {
  @override
  AthleteDiscoverState build() {
    Future.microtask(loadInitial);
    return const AthleteDiscoverState(isLoading: true);
  }

  AthleteDiscoverRepository get _repo =>
      ref.read(athleteDiscoverRepositoryProvider);

  String? get _currentUid => ref.read(authProvider).valueOrNull?.uid.trim();

  AthleteProfile? get _viewerProfile =>
      ref.read(athleteProfileProvider).valueOrNull;

  Future<Set<String>> _followingIds() async {
    final uid = _currentUid;
    if (uid == null || uid.isEmpty) return {};
    return ref.read(athleteFollowServiceProvider).fetchFollowingIds(uid);
  }

  List<AthleteDiscoverEntry> _applyPipeline(List<AthleteDiscoverEntry> source) {
    final filtered = applyDiscoverFilters(
      entries: source,
      filters: state.filters,
      viewerProfile: _viewerProfile,
      searchQuery: state.searchQuery,
    );
    return sortDiscoverEntries(
      entries: filtered,
      sort: state.sort,
      viewerProfile: _viewerProfile,
    );
  }

  void _publishDisplay(List<AthleteDiscoverEntry> raw) {
    state = state.copyWith(
      rawEntries: raw,
      displayEntries: _applyPipeline(raw),
      errorMessage: null,
    );
  }

  Future<void> loadInitial() async {
    state = state.copyWith(isLoading: true, errorMessage: null);
    _repo.clearRankingCache();
    try {
      final following = await _followingIds();
      final page = await _repo.fetchPage();
      final enriched = await _repo.enrichEntries(
        profiles: page.profiles,
        currentUserId: _currentUid,
        followingIds: following,
      );
      state = state.copyWith(
        rawEntries: enriched,
        displayEntries: _applyPipeline(enriched),
        isLoading: false,
        hasMore: page.hasMore,
        lastDocumentId: page.lastDocumentId,
        isSearchMode: false,
        errorMessage: null,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: '$e',
      );
    }
  }

  Future<void> refresh() => loadInitial();

  Future<void> loadMore() async {
    if (state.isSearchMode || !state.hasMore || state.isLoadingMore) return;
    final cursor = state.lastDocumentId;
    if (cursor == null || cursor.isEmpty) return;

    state = state.copyWith(isLoadingMore: true);
    try {
      final following = await _followingIds();
      final page = await _repo.fetchPage(startAfterDocumentId: cursor);
      final enriched = await _repo.enrichEntries(
        profiles: page.profiles,
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

  Future<void> search(String query) async {
    final trimmed = query.trim();
    state = state.copyWith(searchQuery: query);
    if (trimmed.length < 2) {
      if (state.isSearchMode) {
        await loadInitial();
      } else {
        _publishDisplay(state.rawEntries);
      }
      return;
    }

    state = state.copyWith(isLoading: true, isSearchMode: true);
    try {
      final following = await _followingIds();
      final profiles = await _repo.searchProfiles(trimmed);
      final enriched = await _repo.enrichEntries(
        profiles: profiles,
        currentUserId: _currentUid,
        followingIds: following,
      );
      state = state.copyWith(
        rawEntries: enriched,
        displayEntries: _applyPipeline(enriched),
        isLoading: false,
        hasMore: false,
        lastDocumentId: null,
        isSearchMode: true,
        errorMessage: null,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, errorMessage: '$e');
    }
  }

  void setSort(AthleteDiscoverSort sort) {
    state = state.copyWith(sort: sort);
    _publishDisplay(state.rawEntries);
  }

  void setQuickCategory(AthleteDiscoverQuickCategory category) {
    final filters = state.filters.copyWith(quickCategory: category);
    state = state.copyWith(filters: filters);
    _publishDisplay(state.rawEntries);
  }

  void applyFilters(AthleteDiscoverFilters filters) {
    state = state.copyWith(filters: filters);
    _publishDisplay(state.rawEntries);
  }

  void updateFollowing(String athleteId, bool isFollowing) {
    final raw = state.rawEntries
        .map(
          (e) => e.userId == athleteId
              ? AthleteDiscoverEntry(
                  userId: e.userId,
                  profile: e.profile,
                  ranking: e.ranking,
                  isFollowing: isFollowing,
                  isCurrentUser: e.isCurrentUser,
                )
              : e,
        )
        .toList();
    _publishDisplay(raw);
  }

  List<AthleteDiscoverEntry> previewForFilters(AthleteDiscoverFilters draft) {
    final filtered = applyDiscoverFilters(
      entries: state.rawEntries,
      filters: draft,
      viewerProfile: _viewerProfile,
      searchQuery: state.searchQuery,
    );
    return sortDiscoverEntries(
      entries: filtered,
      sort: state.sort,
      viewerProfile: _viewerProfile,
    );
  }
}

final athleteDiscoverProvider =
    AutoDisposeNotifierProvider<AthleteDiscoverNotifier, AthleteDiscoverState>(
  AthleteDiscoverNotifier.new,
);
