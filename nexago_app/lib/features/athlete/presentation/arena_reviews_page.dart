import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../arena/domain/review_reply_providers.dart';
import '../../arenas/domain/arena_list_item.dart';
import '../../arenas/domain/arenas_providers.dart';
import '../domain/athlete_profile_providers.dart';
import '../domain/arena_reputation.dart';
import '../domain/arena_review.dart';
import '../domain/arena_review_providers.dart';

enum _ReviewSortMode { recent, useful }

enum _ReviewRatingFilter { all, five, four, threeOrLess }

class ArenaReviewsPage extends ConsumerStatefulWidget {
  const ArenaReviewsPage({
    super.key,
    required this.arenaId,
    this.arenaName,
    this.arenaCity,
  });

  final String arenaId;
  final String? arenaName;
  final String? arenaCity;

  @override
  ConsumerState<ArenaReviewsPage> createState() => _ArenaReviewsPageState();
}

class _ArenaReviewsPageState extends ConsumerState<ArenaReviewsPage> {
  static const int _pageSize = 10;

  final List<ArenaReview> _reviews = <ArenaReview>[];
  DocumentSnapshot<Map<String, dynamic>>? _lastDoc;
  bool _loadingInitial = true;
  bool _loadingMore = false;
  bool _hasMore = true;
  String? _errorMessage;
  final Set<String> _busyLikes = <String>{};
  final Set<String> _busyReports = <String>{};
  _ReviewSortMode _sortMode = _ReviewSortMode.recent;
  _ReviewRatingFilter _ratingFilter = _ReviewRatingFilter.all;

  @override
  void initState() {
    super.initState();
    Future.microtask(() => _loadPage(reset: true));
  }

  Future<void> _toggleLike(ArenaReview review, bool likedByMe) async {
    final userId = ref.read(authProvider).valueOrNull?.uid.trim() ?? '';
    if (userId.isEmpty || _busyLikes.contains(review.id)) return;
    setState(() => _busyLikes.add(review.id));
    try {
      final service = ref.read(arenaReviewServiceProvider);
      if (likedByMe) {
        await service.unlikeReview(reviewId: review.id, userId: userId);
      } else {
        await service.likeReview(reviewId: review.id, userId: userId);
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Não foi possível atualizar curtida: $e')),
      );
    } finally {
      if (mounted) setState(() => _busyLikes.remove(review.id));
    }
  }

  Future<void> _reportReview(ArenaReview review) async {
    final userId = ref.read(authProvider).valueOrNull?.uid.trim() ?? '';
    if (userId.isEmpty || _busyReports.contains(review.id)) return;
    final controller = TextEditingController();
    final reason = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Denunciar avaliação'),
        content: TextField(
          controller: controller,
          autofocus: true,
          maxLength: 280,
          minLines: 2,
          maxLines: 4,
          decoration: InputDecoration(
            border: OutlineInputBorder(),
            hintText: 'Descreva o motivo da denúncia',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(controller.text.trim()),
            child: Text('Denunciar'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (reason == null || reason.trim().length < 5) return;
    setState(() => _busyReports.add(review.id));
    try {
      await ref
          .read(arenaReviewServiceProvider)
          .reportReview(reviewId: review.id, userId: userId, reason: reason);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Avaliação denunciada com sucesso')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Erro ao denunciar: $e')));
    } finally {
      if (mounted) setState(() => _busyReports.remove(review.id));
    }
  }

  Future<List<ArenaReview>> _enrichAthleteNames(
    FirebaseFirestore firestore,
    List<ArenaReview> reviews,
  ) async {
    final ids = reviews
        .map((e) => e.userId.trim())
        .where((e) => e.isNotEmpty)
        .toSet()
        .toList(growable: false);
    if (ids.isEmpty) return reviews;

    final names = <String, String>{};
    final avatars = <String, String>{};
    for (var i = 0; i < ids.length; i += 10) {
      final chunk = ids.sublist(i, i + 10 > ids.length ? ids.length : i + 10);
      final usersSnap = await firestore
          .collection('users')
          .where(FieldPath.documentId, whereIn: chunk)
          .get();
      for (final doc in usersSnap.docs) {
        final data = doc.data();
        final name = (data['name'] as String?)?.trim();
        if (name != null && name.isNotEmpty) {
          names[doc.id] = name;
        }
        final avatar = ArenaReview.avatarUrlFromUserData(data);
        if (avatar != null) {
          avatars[doc.id] = avatar;
        }
      }
    }

    return reviews
        .map(
          (r) => r.copyWith(
            athleteName: names[r.userId],
            athleteAvatarUrl: avatars[r.userId],
          ),
        )
        .toList(growable: false);
  }

  Future<void> _loadPage({required bool reset}) async {
    if (_loadingMore) return;
    final firestore = ref.read(firestoreProvider);
    if (reset) {
      setState(() {
        _loadingInitial = true;
        _errorMessage = null;
        _hasMore = true;
        _lastDoc = null;
        _reviews.clear();
      });
    } else {
      if (!_hasMore) return;
      setState(() {
        _loadingMore = true;
        _errorMessage = null;
      });
    }

    try {
      Query<Map<String, dynamic>> query = firestore
          .collection('arena_reviews')
          .where('arenaId', isEqualTo: widget.arenaId.trim())
          .limit(_pageSize);

      if (!reset && _lastDoc != null) {
        query = query.startAfterDocument(_lastDoc!);
      }

      final snap = await query.get();
      final page = snap.docs
          .map(ArenaReview.fromFirestore)
          .toList(growable: false);
      final enriched = await _enrichAthleteNames(firestore, page);

      if (!mounted) return;
      setState(() {
        _lastDoc = snap.docs.isNotEmpty ? snap.docs.last : _lastDoc;
        _hasMore = snap.docs.length == _pageSize;
        _reviews.addAll(enriched);
        _reviews.sort((a, b) {
          final aMs = a.createdAt?.millisecondsSinceEpoch ?? 0;
          final bMs = b.createdAt?.millisecondsSinceEpoch ?? 0;
          return bMs.compareTo(aMs);
        });
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _errorMessage = 'Não foi possível carregar avaliações.\n$e';
      });
    } finally {
      if (mounted) {
        setState(() {
          _loadingInitial = false;
          _loadingMore = false;
        });
      }
    }
  }

  List<ArenaReview> _filteredReviews() {
    final list = _reviews
        .where((review) {
          switch (_ratingFilter) {
            case _ReviewRatingFilter.all:
              return true;
            case _ReviewRatingFilter.five:
              return review.rating >= 5;
            case _ReviewRatingFilter.four:
              return review.rating >= 4;
            case _ReviewRatingFilter.threeOrLess:
              return review.rating <= 3;
          }
        })
        .toList(growable: false);

    final sorted = [...list];
    sorted.sort((a, b) {
      if (_sortMode == _ReviewSortMode.useful) {
        final likesCmp = b.likesCount.compareTo(a.likesCount);
        if (likesCmp != 0) return likesCmp;
      }
      final aMs = a.createdAt?.millisecondsSinceEpoch ?? 0;
      final bMs = b.createdAt?.millisecondsSinceEpoch ?? 0;
      return bMs.compareTo(aMs);
    });
    return sorted;
  }

  int _countByRatingFilter(_ReviewRatingFilter filter) {
    return _reviews.where((review) {
      switch (filter) {
        case _ReviewRatingFilter.all:
          return true;
        case _ReviewRatingFilter.five:
          return review.rating >= 5;
        case _ReviewRatingFilter.four:
          return review.rating >= 4;
        case _ReviewRatingFilter.threeOrLess:
          return review.rating <= 3;
      }
    }).length;
  }

  double _averageRating(Iterable<ArenaReview> reviews) {
    final list = reviews.toList(growable: false);
    if (list.isEmpty) return 0;
    final sum = list.fold<int>(0, (acc, item) => acc + item.rating);
    return sum / list.length;
  }

  Map<int, int> _ratingDistribution() {
    final distribution = <int, int>{1: 0, 2: 0, 3: 0, 4: 0, 5: 0};
    for (final review in _reviews) {
      final clamped = review.rating.clamp(1, 5);
      distribution[clamped] = (distribution[clamped] ?? 0) + 1;
    }
    return distribution;
  }

  int _totalReviewsCount(ArenaListItem? arena, ArenaReputation? reputation) {
    final fromAggregate = reputation?.reviewsCount ?? arena?.reviewsCount ?? 0;
    if (fromAggregate > 0) return fromAggregate;
    return _reviews.length;
  }

  double _summaryAverageRating(
    ArenaListItem? arena,
    ArenaReputation? reputation,
  ) {
    if (reputation != null &&
        reputation.reviewsCount > 0 &&
        reputation.ratingAverage > 0) {
      return reputation.ratingAverage;
    }
    if (arena != null && arena.reviewsCount > 0 && arena.ratingAverage > 0) {
      return arena.ratingAverage;
    }
    return _averageRating(_reviews);
  }

  Map<int, int> _summaryRatingDistribution(ArenaReputation? reputation) {
    if (reputation != null && reputation.reviewsCount > 0) {
      return {
        1: reputation.star1,
        2: reputation.star2,
        3: reputation.star3,
        4: reputation.star4,
        5: reputation.star5,
      };
    }
    return _ratingDistribution();
  }

  String _initials(String name) {
    final tokens = name.trim().split(RegExp(r'\s+')).where((e) => e.isNotEmpty);
    if (tokens.isEmpty) return 'AT';
    final list = tokens.toList(growable: false);
    if (list.length == 1) return list.first.substring(0, 1).toUpperCase();
    return '${list.first[0]}${list[1][0]}'.toUpperCase();
  }

  String _reviewsHeaderSubtitle(ArenaListItem? arena) {
    final name = widget.arenaName?.trim().isNotEmpty == true
        ? widget.arenaName!.trim()
        : (arena?.name.trim().isNotEmpty == true
              ? arena!.name.trim()
              : 'Arena');
    final city = widget.arenaCity?.trim().isNotEmpty == true
        ? widget.arenaCity!.trim()
        : (arena?.city?.trim() ?? '');
    final upperName = name.toUpperCase();
    if (city.isNotEmpty) return '$upperName · ${city.toUpperCase()}';
    return upperName;
  }

  Widget _buildTopSummaryCard(
    ArenaListItem? arena,
    ArenaReputation? reputation,
  ) {
    final total = _totalReviewsCount(arena, reputation);
    final avg = _summaryAverageRating(arena, reputation);
    final distribution = _summaryRatingDistribution(reputation);
    final maxCount = distribution.values.fold<int>(1, (a, b) => a > b ? a : b);
    final replied = _reviews
        .where((r) => r.reply != null)
        .toList(growable: false);
    final withComment = _reviews
        .where((r) => (r.comment?.isNotEmpty ?? false))
        .toList(growable: false);
    final recent = [..._reviews]
      ..sort((a, b) {
        final aMs = a.createdAt?.millisecondsSinceEpoch ?? 0;
        final bMs = b.createdAt?.millisecondsSinceEpoch ?? 0;
        return bMs.compareTo(aMs);
      });
    final recentSlice = recent.take(5);
    final metricQuadra = avg;
    final metricAtendimento = replied.isEmpty ? avg : _averageRating(replied);
    final metricEstrutura = withComment.isEmpty
        ? avg
        : _averageRating(withComment);
    final metricLocalizacao = _averageRating(recentSlice);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF141010),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(
                width: 88,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      avg.toStringAsFixed(1),
                      style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                        fontSize: 48,
                        height: 0.95,
                      ),
                    ),
                    SizedBox(height: 6),
                    Row(
                      children: List.generate(5, (i) {
                        final filled = i < avg.round().clamp(0, 5);
                        return Icon(
                          filled
                              ? Icons.star_rounded
                              : Icons.star_outline_rounded,
                          size: 16,
                          color: filled
                              ? const Color(0xFFFF7A1B)
                              : Colors.white24,
                        );
                      }),
                    ),
                    SizedBox(height: 8),
                    Text(
                      '$total avaliações',
                      style: TextStyle(
                        color: context.themeColors.onSurfaceMuted,
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
              SizedBox(width: 12),
              Expanded(
                child: Column(
                  children: List.generate(5, (index) {
                    final stars = 5 - index;
                    final count = distribution[stars] ?? 0;
                    final ratio = maxCount == 0 ? 0.0 : count / maxCount;
                    return Padding(
                      padding: const EdgeInsets.symmetric(vertical: 3),
                      child: Row(
                        children: [
                          SizedBox(
                            width: 14,
                            child: Text(
                              '$stars',
                              style: TextStyle(
                                color: context.themeColors.onSurfaceMuted,
                                fontSize: 11,
                              ),
                            ),
                          ),
                          SizedBox(width: 6),
                          Expanded(
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(99),
                              child: LinearProgressIndicator(
                                value: ratio,
                                minHeight: 6,
                                backgroundColor: Colors.white.withValues(
                                  alpha: 0.08,
                                ),
                                color: const Color(0xFFFF7A1B),
                              ),
                            ),
                          ),
                          SizedBox(width: 8),
                          Text(
                            '$count',
                            style: TextStyle(
                              color: context.themeColors.onSurfaceMuted,
                              fontSize: 11,
                            ),
                          ),
                        ],
                      ),
                    );
                  }),
                ),
              ),
            ],
          ),
          SizedBox(height: 14),
          Row(
            children: [
              _MetricChip(label: 'Quadra', value: metricQuadra),
              SizedBox(width: 8),
              _MetricChip(label: 'Atendimento', value: metricAtendimento),
              SizedBox(width: 8),
              _MetricChip(label: 'Estrutura', value: metricEstrutura),
              SizedBox(width: 8),
              _MetricChip(label: 'Localização', value: metricLocalizacao),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildReviewPromptCard(PendingArenaReview? pendingReview) {
    final dayLabel = pendingReview?.dateRaw.trim() ?? 'recentemente';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: const Color(0xFF0F1014),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
      ),
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: const Color(0xFF6C7CFF),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              'VP',
              style: TextStyle(
                color: Colors.black,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
          SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Você jogou aqui dia $dayLabel',
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                SizedBox(height: 2),
                Text(
                  'Avalie sua experiência',
                  style: TextStyle(
                    color: context.themeColors.onSurfaceMuted,
                    fontSize: 13,
                  ),
                ),
              ],
            ),
          ),
          Row(
            children: List.generate(
              5,
              (_) => Padding(
                padding: EdgeInsets.only(left: 1.5),
                child: Icon(
                  Icons.star_outline_rounded,
                  color: Color(0xFFFF7A1B),
                  size: 18,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFiltersBar() {
    final allCount = _countByRatingFilter(_ReviewRatingFilter.all);
    final fiveCount = _countByRatingFilter(_ReviewRatingFilter.five);
    final fourCount = _countByRatingFilter(_ReviewRatingFilter.four);
    final lowCount = _countByRatingFilter(_ReviewRatingFilter.threeOrLess);
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          _FilterChip(
            label: 'Todas',
            count: allCount,
            selected:
                _sortMode == _ReviewSortMode.recent &&
                _ratingFilter == _ReviewRatingFilter.all,
            onTap: () {
              setState(() {
                _sortMode = _ReviewSortMode.recent;
                _ratingFilter = _ReviewRatingFilter.all;
              });
            },
          ),
          SizedBox(width: 8),
          _FilterChip(
            label: 'Recentes',
            selected:
                _sortMode == _ReviewSortMode.recent &&
                _ratingFilter != _ReviewRatingFilter.all,
            onTap: () => setState(() => _sortMode = _ReviewSortMode.recent),
          ),
          SizedBox(width: 8),
          _FilterChip(
            label: 'Mais úteis',
            selected: _sortMode == _ReviewSortMode.useful,
            onTap: () => setState(() => _sortMode = _ReviewSortMode.useful),
          ),
          SizedBox(width: 8),
          _FilterChip(
            label: '5★',
            count: fiveCount,
            selected: _ratingFilter == _ReviewRatingFilter.five,
            onTap: () =>
                setState(() => _ratingFilter = _ReviewRatingFilter.five),
          ),
          SizedBox(width: 8),
          _FilterChip(
            label: '4★',
            count: fourCount,
            selected: _ratingFilter == _ReviewRatingFilter.four,
            onTap: () =>
                setState(() => _ratingFilter = _ReviewRatingFilter.four),
          ),
          SizedBox(width: 8),
          _FilterChip(
            label: '3★ ou menos',
            count: lowCount,
            selected: _ratingFilter == _ReviewRatingFilter.threeOrLess,
            onTap: () =>
                setState(() => _ratingFilter = _ReviewRatingFilter.threeOrLess),
          ),
        ],
      ),
    );
  }

  Widget _buildReviewCard(ArenaReview review, String currentUserId) {
    final date = review.createdAt;
    final profile = ref.watch(athleteProfileProvider).valueOrNull;
    final athleteName = (review.athleteName?.trim().isNotEmpty == true)
        ? review.athleteName!.trim()
        : 'Atleta';
    final isMine = currentUserId.isNotEmpty && currentUserId == review.userId;
    final avatarUrl = isMine
        ? (review.athleteAvatarUrl ?? profile?.avatarUrl)
        : review.athleteAvatarUrl;
    final likes =
        ref.watch(reviewLikesProvider(review.id)).valueOrNull ??
        review.likesCount;
    final likedByMe =
        ref.watch(reviewLikedByMeProvider(review.id)).valueOrNull ?? false;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFF0B0B0C),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _ReviewAuthorAvatar(
                size: 50,
                initials: _initials(athleteName),
                imageUrl: avatarUrl,
                backgroundColor: isMine
                    ? const Color(0xFF7E78FF)
                    : const Color(0xFF3DB7FF),
              ),
              SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            athleteName,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w800,
                              fontSize: 18,
                            ),
                          ),
                        ),
                        if (isMine) ...[
                          SizedBox(width: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 6,
                              vertical: 2,
                            ),
                            decoration: BoxDecoration(
                              color: const Color(0xFF3A2100),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Text(
                              'VOCÊ',
                              style: TextStyle(
                                color: Color(0xFFFF7A1B),
                                fontSize: 10,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                    SizedBox(height: 2),
                    Text(
                      date != null
                          ? DateFormat('dd/MM/yyyy', 'pt_BR').format(date)
                          : 'data indisponível',
                      style: AppTypography.mono(
                        color: context.themeColors.onSurfaceMuted,
                        fontSize: 12,
                        letterSpacing: 0.25,
                      ),
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Row(
                    children: List.generate(5, (starIndex) {
                      final filled = starIndex < review.rating;
                      return Icon(
                        filled
                            ? Icons.star_rounded
                            : Icons.star_outline_rounded,
                        size: 18,
                        color: filled
                            ? const Color(0xFFFF7A1B)
                            : Colors.white24,
                      );
                    }),
                  ),
                  SizedBox(height: 3),
                  Text(
                    review.rating.toStringAsFixed(1),
                    style: AppTypography.mono(
                      fontSize: 12,
                      color: Color(0xFFFF7A1B),
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ],
          ),
          if (review.comment != null) ...[
            SizedBox(height: 12),
            Text(
              review.comment!,
              style: AppTypography.soraRegular(
                fontSize: 14,
                fontWeight: FontWeight.w400,
                color: Color(0xFFE6E6E6),
              ),
            ),
          ],
          SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            children: [
              _TagPill(
                label: review.rating >= 4 ? 'Quadra impecável' : 'Estrutura',
              ),
              _TagPill(
                label: review.reply != null ? 'Atendimento' : 'Localização',
              ),
            ],
          ),
          if (review.reply != null) ...[
            SizedBox(height: 12),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFF141518),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(
                        'ARENA',
                        style: TextStyle(
                          color: context.themeColors.onSurfaceMuted,
                          fontSize: 10,
                          letterSpacing: 0.6,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      SizedBox(width: 8),
                      _VerifiedBadge(),
                    ],
                  ),
                  SizedBox(height: 8),
                  Text(
                    review.reply!.message,
                    style: TextStyle(
                      color: Color(0xFFD0D3D8),
                      height: 1.35,
                    ),
                  ),
                ],
              ),
            ),
          ],
          SizedBox(height: 12),
          Divider(height: 1, color: Color(0x22FFFFFF)),
          SizedBox(height: 10),
          Row(
            children: [
              _ReviewHelpfulButton(
                likes: likes,
                likedByMe: likedByMe,
                enabled: !_busyLikes.contains(review.id),
                onTap: () => _toggleLike(review, likedByMe),
              ),
              Spacer(),
              // if (isMine)
              //   TextButton.icon(
              //     onPressed: () {
              //       ScaffoldMessenger.of(context).showSnackBar(
              //         const SnackBar(content: Text('Edição em breve.')),
              //       );
              //     },
              //     icon: Icon(Icons.edit_outlined, size: 17),
              //     label: Text('Editar'),
              //   )
              // else
              //   TextButton.icon(
              //     onPressed: _busyReports.contains(review.id)
              //         ? null
              //         : () => _reportReview(review),
              //     icon: Icon(Icons.flag_outlined, size: 17),
              //     label: Text('Reportar'),
              //   ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildPaginationFooter() {
    if (_loadingMore) {
      return Padding(
        padding: EdgeInsets.symmetric(vertical: 8),
        child: Center(child: CircularProgressIndicator()),
      );
    }
    if (!_hasMore) {
      return Padding(
        padding: EdgeInsets.symmetric(vertical: 8),
        child: Center(
          child: Text(
            'Você chegou ao fim das avaliações.',
            style: TextStyle(color: context.themeColors.onSurfaceMuted),
          ),
        ),
      );
    }
    return Center(
      child: OutlinedButton(
        onPressed: () => _loadPage(reset: false),
        child: Text('Carregar mais'),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final socialProof = ref
        .watch(arenaRespondsFastSocialProofProvider(widget.arenaId))
        .valueOrNull;
    final pendingReview = ref.watch(pendingReviewProvider).valueOrNull;
    final currentUserId = ref.watch(authProvider).valueOrNull?.uid.trim() ?? '';
    final filtered = _filteredReviews();
    final arena = ref.watch(arenaByIdProvider(widget.arenaId)).valueOrNull;
    final reputation =
        ref.watch(arenaReputationProvider(widget.arenaId)).valueOrNull;
    final headerSubtitle = _reviewsHeaderSubtitle(arena);
    return Scaffold(
      backgroundColor: const Color(0xFF050506),
      appBar: AppBar(
        backgroundColor: const Color(0xFF050506),
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        surfaceTintColor: Colors.transparent,
        toolbarHeight: 64,
        titleSpacing: 0,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.center,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'Avaliações',
              style: AppTypography.soraRegular(
                fontSize: 26,
                fontWeight: FontWeight.w800,
                color: Colors.white,
                letterSpacing: -0.5,
                height: 1.05,
              ),
            ),
            SizedBox(height: 4),
            Text(
              headerSubtitle,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.mono(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: context.themeColors.onSurfaceMuted,
                letterSpacing: 0.7,
                height: 1.2,
              ),
            ),
          ],
        ),
        actions: [
          // IconButton(
          //   onPressed: () {},
          //   icon: Icon(Icons.ios_share_outlined),
          //   tooltip: 'Em breve',
          // ),
          // IconButton(
          //   onPressed: () {},
          //   icon: Icon(Icons.tune_rounded),
          //   tooltip: 'Em breve',
          // ),
          // SizedBox(width: 4),
        ],
      ),
      body: _loadingInitial
          ? Center(child: CircularProgressIndicator())
          : _errorMessage != null && _reviews.isEmpty
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(_errorMessage!, textAlign: TextAlign.center),
                    SizedBox(height: 12),
                    FilledButton(
                      onPressed: () => _loadPage(reset: true),
                      child: Text('Tentar novamente'),
                    ),
                  ],
                ),
              ),
            )
          : _reviews.isEmpty
          ? Center(child: Text('Ainda não há avaliações.'))
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 24),
              children: [
                _buildTopSummaryCard(arena, reputation),
                SizedBox(height: 12),
                // _buildReviewPromptCard(pendingReview),
                if (socialProof != null) ...[
                  SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 10,
                    ),
                    decoration: BoxDecoration(
                      color: const Color(0xFF112616),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: const Color(0xFF2E7D32).withValues(alpha: 0.5),
                      ),
                    ),
                    child: Text(
                      socialProof,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: const Color(0xFF81C784),
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
                SizedBox(height: 12),
                _buildFiltersBar(),
                SizedBox(height: 14),
                if (filtered.isEmpty)
                  Padding(
                    padding: EdgeInsets.symmetric(vertical: 16),
                    child: Center(
                      child: Text(
                        'Nenhuma avaliação encontrada para este filtro.',
                        style: TextStyle(color: context.themeColors.onSurfaceMuted),
                      ),
                    ),
                  ),
                ...filtered.map(
                  (review) => Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: _buildReviewCard(review, currentUserId),
                  ),
                ),
                _buildPaginationFooter(),
              ],
            ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.label,
    required this.selected,
    required this.onTap,
    this.count,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;
  final int? count;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? AppColors.brand : Colors.transparent,
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(999),
            border: Border.all(
              color: selected
                  ? AppColors.brand
                  : Colors.white.withValues(alpha: 0.16),
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                label,
                style: TextStyle(
                  color: selected ? Colors.black : Colors.white,
                  fontWeight: FontWeight.w700,
                ),
              ),
              if (count != null) ...[
                SizedBox(width: 6),
                Text(
                  '$count',
                  style: TextStyle(
                    color: selected
                        ? Colors.black.withValues(alpha: 0.6)
                        : context.themeColors.onSurfaceMuted,
                    fontWeight: FontWeight.w600,
                    fontSize: 12,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _MetricChip extends StatelessWidget {
  const _MetricChip({required this.label, required this.value});

  final String label;
  final double value;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        children: [
          Text(
            value.toStringAsFixed(1),
            style: TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w800,
              fontSize: 21,
            ),
          ),
          SizedBox(height: 2),
          Text(
            label,
            textAlign: TextAlign.center,
            style: TextStyle(
              color: context.themeColors.onSurfaceMuted,
              fontSize: 11,
            ),
          ),
        ],
      ),
    );
  }
}

class _ReviewHelpfulButton extends StatelessWidget {
  const _ReviewHelpfulButton({
    required this.likes,
    required this.likedByMe,
    required this.enabled,
    required this.onTap,
  });

  final int likes;
  final bool likedByMe;
  final bool enabled;
  final VoidCallback onTap;

  static const _radius = 10.0;

  @override
  Widget build(BuildContext context) {
    final accent = likedByMe ? AppColors.brand : const Color(0xFFB8BDC6);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: enabled ? onTap : null,
        borderRadius: BorderRadius.circular(_radius),
        child: Ink(
          decoration: BoxDecoration(
            color: const Color(0xFF141518),
            borderRadius: BorderRadius.circular(_radius),
            border: Border.all(
              color: likedByMe
                  ? AppColors.brand.withValues(alpha: 0.45)
                  : Colors.white.withValues(alpha: 0.12),
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  likedByMe
                      ? Icons.thumb_up_alt_rounded
                      : Icons.thumb_up_alt_outlined,
                  size: 17,
                  color: accent,
                ),
                SizedBox(width: 6),
                Text(
                  'Útil',
                  style: TextStyle(
                    color: accent,
                    fontWeight: FontWeight.w600,
                    fontSize: 13,
                  ),
                ),
                SizedBox(width: 6),
                Text(
                  '$likes',
                  style: TextStyle(
                    color: accent,
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ReviewAuthorAvatar extends StatelessWidget {
  const _ReviewAuthorAvatar({
    required this.size,
    required this.initials,
    required this.backgroundColor,
    this.imageUrl,
  });

  final double size;
  final String initials;
  final Color backgroundColor;
  final String? imageUrl;

  @override
  Widget build(BuildContext context) {
    final url = imageUrl?.trim();

    return ClipOval(
      child: SizedBox(
        width: size,
        height: size,
        child: url != null && url.isNotEmpty
            ? CachedNetworkImage(
                imageUrl: url,
                width: size,
                height: size,
                fit: BoxFit.cover,
                errorWidget: (_, __, ___) => _initialsFallback(),
                placeholder: (_, __) => _initialsFallback(),
              )
            : _initialsFallback(),
      ),
    );
  }

  Widget _initialsFallback() {
    return ColoredBox(
      color: backgroundColor,
      child: Center(
        child: Text(
          initials,
          style: TextStyle(
            color: Colors.black,
            fontWeight: FontWeight.w900,
            fontSize: 14,
          ),
        ),
      ),
    );
  }
}

class _TagPill extends StatelessWidget {
  const _TagPill({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: const Color(0xFF26180F),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: const Color(0xFF66381D)),
      ),
      child: Text(
        '+ $label',
        style: TextStyle(
          color: Color(0xFFFF7A1B),
          fontWeight: FontWeight.w700,
          fontSize: 12,
        ),
      ),
    );
  }
}

class _VerifiedBadge extends StatelessWidget {
  const _VerifiedBadge();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: const Color(0xFF0B3A22),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        'VERIFICADO',
        style: TextStyle(
          color: Color(0xFF59D98A),
          fontSize: 9,
          letterSpacing: 0.5,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}
