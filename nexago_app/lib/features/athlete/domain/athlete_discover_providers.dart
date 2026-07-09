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
    this.sort = AthleteDiscoverSort.compatibility,
    this.searchQuery = '',
    this.isLoading = false,
    this.isLoadingMore = false,
    this.hasMore = true,
    this.lastDocumentId,
    this.errorMessage,
    this.isSearchMode = false,
    this.catalogIsComplete = false,
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
  /// Verdadeiro quando [rawEntries] contém todos os atletas discoverable.
  final bool catalogIsComplete;

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
    bool? catalogIsComplete,
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
      catalogIsComplete: catalogIsComplete ?? this.catalogIsComplete,
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
      sportFirestoreId: state.filters.sportFirestoreId,
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
        catalogIsComplete: !page.hasMore,
        errorMessage: null,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: '$e',
      );
    }
  }

  Future<void> _loadFullCatalog({bool showLoading = true}) async {
    if (showLoading) {
      state = state.copyWith(isLoading: true, errorMessage: null);
    }
    _repo.clearRankingCache();
    try {
      final following = await _followingIds();
      final profiles = await _repo.fetchProfilesForDiscover(state.filters);
      final enriched = await _repo.enrichEntries(
        profiles: profiles,
        currentUserId: _currentUid,
        followingIds: following,
      );
      state = state.copyWith(
        rawEntries: enriched,
        displayEntries: _applyPipeline(enriched),
        isLoading: false,
        isLoadingMore: false,
        hasMore: false,
        lastDocumentId: null,
        isSearchMode: false,
        catalogIsComplete: true,
        errorMessage: null,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, errorMessage: '$e');
    }
  }

  /// Garante catálogo completo antes de pré-visualizar filtros no sheet.
  Future<void> ensureCatalogForFiltering() async {
    if (state.isSearchMode || state.catalogIsComplete) return;
    await _loadFullCatalog(showLoading: false);
  }

  Future<void> refresh() async {
    if (state.isSearchMode && state.searchQuery.trim().length >= 2) {
      await search(state.searchQuery);
    } else if (state.filters.hasActiveFilters) {
      await _loadFullCatalog();
    } else {
      await loadInitial();
    }
  }

  Future<void> loadMore() async {
    if (state.isSearchMode ||
        state.filters.hasActiveFilters ||
        state.catalogIsComplete ||
        !state.hasMore ||
        state.isLoadingMore) {
      return;
    }
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
      state = state.copyWith(isSearchMode: false);
      if (state.filters.hasActiveFilters) {
        if (state.catalogIsComplete) {
          _publishDisplay(state.rawEntries);
        } else {
          await _loadFullCatalog();
        }
      } else {
        await loadInitial();
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
        catalogIsComplete: false,
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

  Future<void> setQuickLevel(AthleteDiscoverQuickLevel level) async {
    final filters = state.filters.copyWith(quickLevel: level);
    state = state.copyWith(filters: filters);
    if (filters.hasActiveFilters) {
      if (state.catalogIsComplete) {
        _publishDisplay(state.rawEntries);
      } else {
        await _loadFullCatalog();
      }
    } else {
      await loadInitial();
    }
  }

  Future<void> setSportFilter(String? sportFirestoreId) async {
    final filters = state.filters.copyWith(sportFirestoreId: sportFirestoreId);
    state = state.copyWith(filters: filters);
    if (filters.hasActiveFilters) {
      if (state.catalogIsComplete) {
        _publishDisplay(state.rawEntries);
      } else {
        await _loadFullCatalog();
      }
    } else {
      await loadInitial();
    }
  }

  Future<void> applyFilters(AthleteDiscoverFilters filters) async {
    state = state.copyWith(filters: filters);
    if (filters.hasActiveFilters) {
      if (state.catalogIsComplete) {
        _publishDisplay(state.rawEntries);
      } else {
        await _loadFullCatalog();
      }
    } else {
      await loadInitial();
    }
  }

  void updateFollowing(String athleteId, bool isFollowing) {
    final raw = state.rawEntries
        .map(
          (e) {
            if (e.userId != athleteId) return e;

            final wasFollowing = e.isFollowing;
            var followersCount = e.followersCount;
            if (isFollowing && !wasFollowing) {
              followersCount += 1;
            } else if (!isFollowing && wasFollowing && followersCount > 0) {
              followersCount -= 1;
            }

            return AthleteDiscoverEntry(
              userId: e.userId,
              profile: e.profile,
              ranking: e.ranking,
              isFollowing: isFollowing,
              isCurrentUser: e.isCurrentUser,
              followersCount: followersCount,
              mutualFollowersCount: e.mutualFollowersCount,
            );
          },
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
      sportFirestoreId: draft.sportFirestoreId,
    );
  }
}

final athleteDiscoverProvider =
    AutoDisposeNotifierProvider<AthleteDiscoverNotifier, AthleteDiscoverState>(
  AthleteDiscoverNotifier.new,
);
