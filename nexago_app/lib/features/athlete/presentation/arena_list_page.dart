import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/map/mapbox_config.dart';
import '../../../core/router/routes.dart';
import '../../../core/location/location_permission_status.dart';
import '../../../core/location/user_location_providers.dart';
import '../../../core/location/user_location_snapshot.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/app_status_views.dart';
import '../../arenas/data/arena_contact_service.dart';
import '../../arenas/domain/arena_contact_message.dart';
import '../../arenas/domain/arena_map_opening_camera.dart';
import '../../arenas/domain/arena_map_pins_logic.dart';
import '../../arenas/domain/arena_search_filter_logic.dart';
import '../../arenas/domain/arena_search_providers.dart';
import '../../arenas/domain/slots_page_logic.dart';
import '../../arenas/presentation/arena_booking_navigation.dart';
import '../../arenas/presentation/widgets/arena_map/arena_map_view.dart';
import '../domain/athlete_profile.dart';
import '../domain/athlete_profile_providers.dart';
import '../domain/athlete_shell_providers.dart';
import '../domain/favorites_providers.dart';
import 'favorite_success_page.dart';
import 'widgets/arena_search/arena_location_permission_banner.dart';
import 'widgets/arena_search/arena_map_controls.dart';
import 'widgets/arena_search/arena_map_sheet.dart';
import 'widgets/arena_search/arena_map_top_bar.dart';
import 'widgets/arena_search/arena_search_date_time_row.dart';
import 'widgets/arena_search/arena_search_filters_sheet.dart';
import 'widgets/arena_search/arena_search_location_sheet.dart';
import 'widgets/arena_search/arena_search_sort_sheet.dart';

/// Fração da tela que o sheet ocupa ao abrir. Compartilhada com o
/// posicionamento dos controles flutuantes, que precisam ficar acima dele.
const double _sheetInitialSize = 0.32;

/// Aba Reservar — mapa de arenas com a lista num sheet arrastável.
class ArenaListPage extends ConsumerStatefulWidget {
  const ArenaListPage({super.key});

  @override
  ConsumerState<ArenaListPage> createState() => _ArenaListPageState();
}

class _ArenaListPageState extends ConsumerState<ArenaListPage>
    with WidgetsBindingObserver {
  late ArenaSearchFilters _filters;
  final Map<String, bool> _favoriteOverrides = <String, bool>{};
  final Set<String> _favoritePendingArenaIds = <String>{};
  Timer? _searchDebounce;
  bool _sportChipUserSelected = false;

  final ArenaMapController _mapController = ArenaMapController();
  String? _focusedArenaId;
  bool _isLocating = false;

  /// Última situação conhecida da permissão de localização.
  ///
  /// Nulo até a primeira checagem. Guardado aqui, e não num provider, porque
  /// muda por fora do app — o atleta vai aos Ajustes e volta — e quem precisa
  /// reagir é esta tela: acender o marcador do mapa e mostrar (ou tirar) o
  /// aviso com o atalho.
  LocationPermissionStatus? _permissionStatus;

  /// Impede dois pedidos ao mesmo tempo. O sistema recusa o segundo com erro,
  /// e é fácil chegar duas vezes: abrir na aba já dispara, e o `ref.listen`
  /// dispara de novo se o atleta sair e voltar antes do primeiro terminar.
  bool _askingPermission = false;

  // Memória do último recorte, para os pinos manterem a mesma identidade entre
  // reconstruções. Sem isso o `ArenaMapView` acharia que a lista mudou a cada
  // build e reenviaria o GeoJSON pelo canal nativo à toa.
  List<FilteredArenaSearchResult>? _splitInput;
  ArenaMapSplit? _split;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _filters = _filtersWithProfileSport(
      ref.read(athleteProfileProvider).valueOrNull,
    );
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _syncProfileSportDefault();
      // A aba vive num `IndexedStack`: esta tela é construída no boot, atrás da
      // Início. Só há "entrar" quando ela é a aba da vez — o que pode já ser
      // verdade agora, se o app abriu direto aqui (deep link, ou o atleta
      // voltando para onde estava).
      if (ref.read(athleteShellTabIndexProvider) ==
          athleteShellReservarTabIndex) {
        unawaited(_ensureLocationPermission());
      } else {
        unawaited(_refreshLocationStatus());
      }
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _searchDebounce?.cancel();
    super.dispose();
  }

  /// Reconfere ao voltar dos Ajustes.
  ///
  /// O atleta sai do app pelo atalho do aviso, liga a localização e volta. Nada
  /// disso passa pelo Flutter: sem reconferir aqui, ele encontra o mesmo mapa e
  /// o mesmo aviso de antes, como se não tivesse adiantado.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    super.didChangeAppLifecycleState(state);
    if (state != AppLifecycleState.resumed) return;
    if (ref.read(athleteShellTabIndexProvider) != athleteShellReservarTabIndex) {
      return;
    }
    unawaited(_refreshLocationStatus());
  }

  // ------------------------------------------------------------ localização

  /// Pede a permissão, se ainda houver diálogo do sistema para mostrar.
  Future<void> _ensureLocationPermission() async {
    if (_askingPermission) return;
    _askingPermission = true;
    try {
      final status =
          await ref.read(userLocationServiceProvider).ensurePermission();
      if (!mounted) return;
      _applyPermissionStatus(status);
    } finally {
      _askingPermission = false;
    }
  }

  Future<void> _refreshLocationStatus() async {
    final status = await ref.read(userLocationServiceProvider).checkStatus();
    if (!mounted) return;
    _applyPermissionStatus(status);
  }

  void _applyPermissionStatus(LocationPermissionStatus status) {
    if (_permissionStatus != status) {
      setState(() => _permissionStatus = status);
    }
    if (status != LocationPermissionStatus.granted) return;

    // O provider já resolveu antes da permissão existir, e guardou um snapshot
    // sem coordenada. Sem refazer a conta, conceder não muda nada na tela.
    final atual = ref.read(userLocationProvider).valueOrNull;
    if (atual == null || !atual.hasCoordinates) {
      ref.invalidate(userLocationProvider);
    }
  }

  Future<void> _openLocationSettings(LocationSettingsNudge nudge) async {
    await ref
        .read(userLocationServiceProvider)
        .openSettings(app: nudge.opensAppSettings);
  }

  // ---------------------------------------------------------------- filtros

  ArenaSportChip _sportChipFromProfile(AthleteProfile? profile) {
    if (profile == null) return ArenaSearchFilters.defaultSportChip;
    final hasSport = profile.primarySportFirestoreId?.isNotEmpty == true ||
        profile.sport.trim().isNotEmpty;
    if (!hasSport) return ArenaSearchFilters.defaultSportChip;

    final chip = defaultSportChipFromProfile(
      sport: profile.sport,
      primarySport: profile.primarySportFirestoreId,
    );
    return chip == ArenaSportChip.all
        ? ArenaSearchFilters.defaultSportChip
        : chip;
  }

  ArenaSearchFilters _filtersWithProfileSport(AthleteProfile? profile) {
    return ArenaSearchFilters.defaults().copyWith(
      sportChip: _sportChipFromProfile(profile),
    );
  }

  void _syncProfileSportDefault() {
    if (_sportChipUserSelected) return;
    final chip = _sportChipFromProfile(
      ref.read(athleteProfileProvider).valueOrNull,
    );
    if (_filters.sportChip == chip) return;
    setState(() => _filters = _filters.copyWith(sportChip: chip));
  }

  int _rawSearchResultCount() {
    return ref
            .read(arenaSearchResultsProvider(_filters.slot))
            .valueOrNull
            ?.length ??
        0;
  }

  void _updateFilters(ArenaSearchFilters filters) {
    setState(() {
      _filters = filters;
      // O card em foco pode ter saído do resultado: manter o foco mostraria
      // uma arena que o filtro acabou de excluir.
      _focusedArenaId = null;
    });
  }

  void _showAllArenas() {
    _searchDebounce?.cancel();
    _updateFilters(ArenaSearchFilters.showAll(slot: _filters.slot));
  }

  void _onSearchChanged(String value) {
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 300), () {
      if (!mounted) return;
      _updateFilters(_filters.copyWith(query: value));
      _flyToSearchResults();
    });
  }

  /// Leva o mapa até o que a busca encontrou.
  ///
  /// Roda aqui, e não no `build`, porque mexer na câmera é efeito colateral:
  /// no build ela se moveria em toda reconstrução — exatamente o defeito que
  /// tiramos ao abandonar o `viewport` declarativo do `MapWidget`.
  ///
  /// `_updateFilters` já atualizou `_filters` de forma síncrona, então o
  /// provider abaixo devolve o resultado do texto novo.
  void _flyToSearchResults() {
    if (_filters.query.trim().isEmpty) return;

    final split = _splitFor(ref.read(arenaSearchFilteredProvider(_filters)));
    // Sem pino não há para onde ir: a busca pode ter achado só arenas sem
    // coordenada, que existem apenas na lista.
    if (split.pins.isEmpty) return;

    final melhor = split.pins.first;
    unawaited(
      _mapController.fitPins(
        split.pins,
        // Resultados espalhados por cidades distantes fariam o enquadramento
        // afastar demais. Nesse caso vale ir para o primeiro — a busca já vem
        // ordenada, então ele é o que melhor casou com o texto.
        fallbackCenter: (
          latitude: melhor.latitude,
          longitude: melhor.longitude,
        ),
      ),
    );
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _filters.slot.dateOnly,
      firstDate: DateTime(now.year, now.month, now.day),
      lastDate: DateTime(now.year + 1),
      locale: const Locale('pt', 'BR'),
    );
    if (picked == null) return;
    _updateFilters(
      _filters.copyWith(
        slot: ArenaSearchSlotFilters(
          date: DateTime(picked.year, picked.month, picked.day),
          requestedTime: _filters.slot.requestedTime,
          flexibleTime: _filters.slot.flexibleTime,
        ),
      ),
    );
  }

  Future<void> _pickTime() async {
    final picked = await showTimePicker(
      context: context,
      initialTime: _filters.slot.requestedTime,
    );
    if (picked == null) return;
    _updateFilters(
      _filters.copyWith(
        slot: ArenaSearchSlotFilters(
          date: _filters.slot.dateOnly,
          requestedTime: picked,
          flexibleTime: false,
        ),
      ),
    );
  }

  /// Data e horário num sheet só — sobre o mapa não cabe uma linha fixa para
  /// eles, mas nenhum dos dois pode ficar inalcançável.
  Future<void> _openSlotSheet() async {
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: context.themeColors.surfaceSheet,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (sheetContext) {
        return SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'Quando você quer jogar',
                  style: Theme.of(sheetContext).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w900,
                        color: sheetContext.themeColors.onSurface,
                      ),
                ),
                const SizedBox(height: 16),
                ArenaSearchDateTimeRow(
                  date: _filters.slot.dateOnly,
                  timeLabel: _filters.slot.requestedTimeLabel,
                  flexibleTime: _filters.slot.flexibleTime,
                  onDateTap: () async {
                    Navigator.of(sheetContext).pop();
                    await _pickDate();
                  },
                  onTimeTap: () async {
                    Navigator.of(sheetContext).pop();
                    await _pickTime();
                  },
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  int _previewFilterResultCount(ArenaSearchFilters draft) {
    final slotResults =
        ref.read(arenaSearchResultsProvider(_filters.slot)).valueOrNull ??
            const <ArenaSearchResult>[];
    final location = ref.read(userLocationProvider).valueOrNull ??
        const UserLocationSnapshot(source: UserLocationSource.none);
    final favorites =
        ref.read(favoriteArenaIdsProvider).valueOrNull ?? const <String>[];

    return filterAndSortArenaResults(
      results: slotResults,
      filters: draft,
      userLocation: location,
      favoriteIds: favorites.toSet(),
    ).length;
  }

  Future<void> _openFilters() async {
    final antes = _filters.sportChip;
    final applied = await showArenaSearchFiltersSheet(
      context: context,
      initial: _filters,
      previewResultCount: _previewFilterResultCount,
    );
    if (applied == null) return;

    // Só uma troca de esporte conta como escolha do atleta. Marcar a cada
    // aplicação congelaria o padrão vindo do perfil mesmo quando ele mexeu
    // apenas no raio ou no preço.
    if (applied.sportChip != antes) _sportChipUserSelected = true;
    _updateFilters(applied);
  }

  Future<void> _openSort() async {
    final sort = await showArenaSearchSortSheet(
      context: context,
      current: _filters.sortBy,
    );
    if (sort != null) _updateFilters(_filters.copyWith(sortBy: sort));
  }

  void _openFavoriteArenas() {
    context.pushNamed(AppRouteNames.favoriteArenas, extra: _filters.slot);
  }

  Future<void> _openLocation() async {
    final profile = ref.read(athleteProfileProvider).valueOrNull;
    await showArenaSearchLocationSheet(
      context: context,
      ref: ref,
      profileCity: profile?.city ?? '',
      profileState: profile?.state ?? '',
    );
  }

  // ------------------------------------------------------------------ mapa

  void _onPinTap(String arenaId, ArenaMapSplit split) {
    final pin = split.pins.where((p) => p.arenaId == arenaId).firstOrNull;
    setState(() => _focusedArenaId = arenaId);
    if (pin != null) {
      unawaited(_mapController.flyTo(pin.latitude, pin.longitude));
    }
  }

  Future<void> _locateMe() async {
    if (_isLocating) return;
    setState(() => _isLocating = true);

    try {
      // O pedido tem que sair daqui: `tryCurrentPosition` só usa a permissão
      // que já existe. Sem isto o botão não funcionaria para quem recusou ao
      // entrar na aba e mudou de ideia depois.
      final service = ref.read(userLocationServiceProvider);
      final status = await service.ensurePermission();
      if (!mounted) return;
      _applyPermissionStatus(status);

      final snapshot = await service.tryCurrentPosition();
      if (!mounted) return;

      if (snapshot == null || !snapshot.hasCoordinates) {
        showAppSnackBar(
          context,
          'Não foi possível obter sua localização. '
          'Verifique a permissão nas configurações.',
          isError: true,
        );
        return;
      }

      await _mapController.flyTo(
        snapshot.latitude!,
        snapshot.longitude!,
        zoom: 13,
      );
    } finally {
      if (mounted) setState(() => _isLocating = false);
    }
  }

  // -------------------------------------------------------------- contatos

  /// Abre o canal comercial da nexaGO para quem quer cadastrar a própria arena.
  Future<void> _openArenaSignupContact() async {
    final opened = await launchUrl(
      Uri.parse(buildNexagoArenaSignupContactUrl()),
      mode: LaunchMode.externalApplication,
    );
    if (!opened && mounted) {
      showAppSnackBar(
        context,
        'Não foi possível abrir o contato.',
        isError: true,
      );
    }
  }

  /// Abre o WhatsApp da arena pré-cadastrada e registra o clique.
  ///
  /// O WhatsApp é a prioridade: o registro roda em paralelo e engole o próprio
  /// erro, porque perder a métrica é aceitável e travar o atleta não é.
  Future<void> _contactUnclaimedArena(
    String arenaId,
    String whatsAppUrl,
  ) async {
    unawaited(ArenaContactService().trackContactClick(arenaId));

    final opened = await launchUrl(
      Uri.parse(whatsAppUrl),
      mode: LaunchMode.externalApplication,
    );
    if (!opened && mounted) {
      showAppSnackBar(
        context,
        'Não foi possível abrir o WhatsApp.',
        isError: true,
      );
    }
  }

  Future<void> _toggleFavorite({
    required String? userId,
    required String arenaId,
    required bool isFavorite,
  }) async {
    if (userId == null || userId.isEmpty) {
      showAppSnackBar(context, 'Faça login para seguir arenas.', isError: true);
      return;
    }
    if (_favoritePendingArenaIds.contains(arenaId)) return;

    final next = !isFavorite;
    setState(() {
      _favoriteOverrides[arenaId] = next;
      _favoritePendingArenaIds.add(arenaId);
    });

    try {
      await ref.read(favoritesServiceProvider).toggleFavoriteArena(
            userId: userId,
            arenaId: arenaId,
            isFavorite: isFavorite,
          );
      if (!mounted) return;
      setState(() {
        _favoritePendingArenaIds.remove(arenaId);
        _favoriteOverrides.remove(arenaId);
      });
      if (next) {
        await FavoriteSuccessPage.show(context);
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _favoritePendingArenaIds.remove(arenaId);
        _favoriteOverrides.remove(arenaId);
      });
      showAppSnackBar(
        context,
        'Não foi possível atualizar seguidores agora.',
        isError: true,
      );
    }
  }

  // --------------------------------------------------------------- desenho

  /// Reaproveita o recorte anterior quando nada mudou, para os pinos
  /// preservarem identidade entre reconstruções.
  ///
  /// Favoritas não entram na conta: o pino é o mesmo desenho para todas, e
  /// seguir uma arena não muda nada no mapa.
  ArenaMapSplit _splitFor(List<FilteredArenaSearchResult> filtered) {
    final cached = _split;
    if (cached != null && identical(_splitInput, filtered)) return cached;

    final split = splitArenaMapResults(results: filtered);
    _splitInput = filtered;
    _split = split;
    return split;
  }

  Set<String> _effectiveFavoriteIds(Set<String> stored) {
    if (_favoriteOverrides.isEmpty) return stored;
    final result = stored.toSet();
    _favoriteOverrides.forEach((arenaId, isFavorite) {
      if (isFavorite) {
        result.add(arenaId);
      } else {
        result.remove(arenaId);
      }
    });
    return result;
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(athleteProfileProvider, (previous, next) {
      if (_sportChipUserSelected) return;
      final chip = _sportChipFromProfile(next.valueOrNull);
      if (_filters.sportChip == chip) return;
      setState(() => _filters = _filters.copyWith(sportChip: chip));
    });

    // A localização começa a resolver aqui, fora do `when` das arenas. Pedi-la
    // só depois que a busca carrega garantia que o mapa nasceria antes de
    // sabermos onde o atleta está — e o GPS leva segundos para responder.
    ref.watch(userLocationProvider);

    // Entrar na aba é o momento de pedir a permissão: aqui a localização é o
    // assunto da tela, e o diálogo do sistema chega explicado pelo contexto.
    ref.listen(athleteShellTabIndexProvider, (previous, next) {
      if (next != athleteShellReservarTabIndex || previous == next) return;
      unawaited(_ensureLocationPermission());
    });

    final userId = ref.watch(authProvider).valueOrNull?.uid;
    final storedFavorites =
        (ref.watch(favoriteArenaIdsProvider).valueOrNull ?? const <String>[])
            .toSet();
    final favoriteIds = _effectiveFavoriteIds(storedFavorites);

    final resultsAsync = ref.watch(arenaSearchResultsProvider(_filters.slot));
    final topInset = MediaQuery.paddingOf(context).top;
    final bottomInset = MediaQuery.paddingOf(context).bottom;

    return ColoredBox(
      color: context.themeColors.canvas,
      child: resultsAsync.when(
        loading: () => Padding(
          padding: EdgeInsets.only(top: topInset),
          child: const AppLoadingView(message: 'Carregando arenas...'),
        ),
        error: (e, _) => Padding(
          padding: EdgeInsets.only(top: topInset),
          child: AppErrorView(
            title: 'Não foi possível carregar horários',
            message: e.toString().replaceFirst('Exception: ', ''),
            onRetry: () =>
                ref.invalidate(arenaSearchResultsProvider(_filters.slot)),
          ),
        ),
        data: (_) => _buildContent(
          userId: userId,
          favoriteIds: favoriteIds,
          topInset: topInset,
          bottomInset: bottomInset,
        ),
      ),
    );
  }

  Widget _buildContent({
    required String? userId,
    required Set<String> favoriteIds,
    required double topInset,
    required double bottomInset,
  }) {
    final filtered = ref.watch(arenaSearchFilteredProvider(_filters));
    final split = _splitFor(filtered);

    ArenaSheetItemState stateFor(String arenaId) {
      return ArenaSheetItemState(
        isFavorite: favoriteIds.contains(arenaId),
        isFavoritePending: _favoritePendingArenaIds.contains(arenaId),
        isBestPrice: split.bestPriceArenaIds.contains(arenaId),
      );
    }

    final callbacks = ArenaResultsCallbacks(
      onOpenArena: (item) => openArenaDetail(
        context,
        item.result.arena,
        isBestPrice: split.bestPriceArenaIds.contains(item.result.arena.id),
      ),
      onSortTap: _openSort,
      onSignupTap: _openArenaSignupContact,
      onToggleFavorite: (item) => _toggleFavorite(
        userId: userId,
        arenaId: item.result.arena.id,
        isFavorite: favoriteIds.contains(item.result.arena.id),
      ),
      onReserve: (item) {
        final slot = item.result.selectedSlot;
        if (slot == null) return;
        openArenaBookingSlots(
          context,
          arena: item.result.arena,
          slot: slot,
          date: slotDayOnly(slot.date),
        );
      },
      onContactUnclaimed: _contactUnclaimedArena,
      onShowAllArenas: _showAllArenas,
      onOpenFilters: _openFilters,
    );

    final hiddenByFilters = filtered.isEmpty && !_filters.showOnlyFavorites
        ? _rawSearchResultCount()
        : 0;

    // Sem mapa não existe "sem localização no mapa": a lista é uma só. Separar
    // ali repetiria cada arena em duas seções.
    ArenaResultsList buildList(
      ScrollController? controller, {
      required bool separateOffMap,
    }) {
      return ArenaResultsList(
        items: separateOffMap ? _onMapItems(filtered, split) : filtered,
        offMapItems:
            separateOffMap ? split.offMap : const <FilteredArenaSearchResult>[],
        searchQuery: _filters.query,
        selectedSportChip: _filters.sportChip,
        stateFor: stateFor,
        callbacks: callbacks,
        scrollController: controller,
        showHandle: separateOffMap,
        hiddenByFiltersCount: hiddenByFilters,
        bottomInset: bottomInset,
      );
    }

    if (!isMapboxConfigured) {
      return _MapUnavailableFallback(
        topInset: topInset,
        header: _buildHeaderOverlay(compact: true),
        list: buildList(
          ref
              .watch(athleteShellScrollRegistryProvider)
              .controllerFor(athleteShellReservarTabIndex),
          separateOffMap: false,
        ),
      );
    }

    final focused = _focusedArenaId == null
        ? null
        : filtered
            .where((e) => e.result.arena.id == _focusedArenaId)
            .firstOrNull;

    final mostraLista = shouldShowArenaList(
      query: _filters.query,
      hasFocusedArena: focused != null,
    );

    return Stack(
      children: [
        Positioned.fill(
          child: ArenaMapView(
            pins: split.pins,
            controller: _mapController,
            initialCenter: _initialCenter(filtered),
            logoPadding: EdgeInsets.only(bottom: bottomInset + 16),
            // Só com a permissão na mão. Ligar o marcador antes faria o Mapbox
            // disparar o próprio pedido, por fora do nosso — dois diálogos
            // para a mesma coisa, um deles fora de qualquer ação do atleta.
            showUserLocation: _hasGrantedLocation(),
            onPinTap: (arenaId) => _onPinTap(arenaId, split),
          ),
        ),
        Positioned(
          top: topInset + 8,
          left: 0,
          right: 0,
          child: _buildHeaderOverlay(compact: false),
        ),
        Positioned(
          right: 16,
          // Acima do sheet quando ele existe — um botão atrás dele é um botão
          // que não existe. Sem sheet, descem para perto da borda em vez de
          // flutuarem no meio da tela.
          bottom: mostraLista
              ? MediaQuery.sizeOf(context).height * _sheetInitialSize + 16
              : bottomInset + 16,
          child: ArenaMapControls(
            onFavoritesTap: _openFavoriteArenas,
            onLocationTap: () => unawaited(_openLocation()),
            onResetNorth: () => unawaited(_mapController.resetNorth()),
            onLocateMe: () => unawaited(_locateMe()),
            isLocating: _isLocating,
          ),
        ),
        // Por último de propósito: `Stack` pinta em ordem, e o card da arena
        // precisa cobrir os controles laterais e a barra de busca. A área
        // acima do sheet não intercepta toque, então os controles continuam
        // acessíveis enquanto ele está recolhido.
        if (mostraLista)
          ArenaMapSheet(
            list: (controller) => buildList(controller, separateOffMap: true),
            stateFor: stateFor,
            callbacks: callbacks,
            searchQuery: _filters.query,
            selectedSportChip: _filters.sportChip,
            focusedItem: focused,
            onClearFocus: () => setState(() => _focusedArenaId = null),
            initialSize: _sheetInitialSize,
            bottomInset: bottomInset,
          ),
      ],
    );
  }

  /// Resultados que têm pino, na ordem da busca.
  List<FilteredArenaSearchResult> _onMapItems(
    List<FilteredArenaSearchResult> filtered,
    ArenaMapSplit split,
  ) {
    final offMapIds = split.offMap.map((e) => e.result.arena.id).toSet();
    if (offMapIds.isEmpty) return filtered;
    return filtered
        .where((e) => !offMapIds.contains(e.result.arena.id))
        .toList(growable: false);
  }

  /// A permissão vale a partir do que o sistema respondeu; a coordenada, como
  /// segunda testemunha, para o marcador acender já na primeira montagem —
  /// antes da checagem assíncrona voltar.
  bool _hasGrantedLocation() {
    if (_permissionStatus == LocationPermissionStatus.granted) return true;
    final location = ref.watch(userLocationProvider).valueOrNull;
    return location?.hasCoordinates ?? false;
  }

  ({double latitude, double longitude})? _initialCenter(
    List<FilteredArenaSearchResult> filtered,
  ) {
    final location = ref.watch(userLocationProvider).valueOrNull;
    if (location == null) return null;
    return resolveArenaMapOpeningCenter(user: location, results: filtered);
  }

  Widget _buildHeaderOverlay({required bool compact}) {
    final nudge = _permissionStatus == null
        ? null
        : locationSettingsNudgeFor(_permissionStatus!);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Padding(
        //   padding: const EdgeInsets.symmetric(horizontal: 16),
        //   child: ArenaMapSignupBanner(onTap: _openArenaSignupContact),
        // ),
        // const SizedBox(height: 10),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            children: [
              Expanded(
                child: ArenaMapSearchBar(
                  initialQuery: _filters.query,
                  slotLabel: _slotLabel(),
                  activeFilterCount: countActiveSearchFilters(_filters),
                  onQueryChanged: _onSearchChanged,
                  onSlotTap: () => unawaited(_openSlotSheet()),
                  onFiltersTap: () => unawaited(_openFilters()),
                ),
              ),
            ],
          ),
        ),
        if (nudge != null) ...[
          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: ArenaLocationPermissionBanner(
              nudge: nudge,
              onOpenSettings: () => unawaited(_openLocationSettings(nudge)),
            ),
          ),
        ],
        if (compact) const SizedBox(height: 8),
      ],
    );
  }

  String _slotLabel() {
    final slot = _filters.slot;
    final day = isSearchDateToday(slot.date)
        ? 'Hoje'
        : '${slot.dateOnly.day.toString().padLeft(2, '0')}/'
            '${slot.dateOnly.month.toString().padLeft(2, '0')}';
    if (slot.flexibleTime) return '$day · flexível';
    return '$day · ${slot.requestedTimeLabel}';
  }
}

/// O que a aba mostra quando o mapa não pode subir (build sem token).
///
/// Não é uma tela de erro: é a busca em lista, como sempre foi, com um aviso
/// discreto. A aba nunca fica em branco por falta de configuração.
class _MapUnavailableFallback extends StatelessWidget {
  const _MapUnavailableFallback({
    required this.topInset,
    required this.header,
    required this.list,
  });

  final double topInset;
  final Widget header;
  final Widget list;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        SizedBox(height: topInset + 8),
        header,
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
          child: Row(
            children: [
              Icon(
                Icons.map_outlined,
                size: 14,
                color: context.themeColors.onSurfaceMuted,
              ),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  'Mapa indisponível nesta versão do app.',
                  style: TextStyle(
                    fontSize: 11,
                    color: context.themeColors.onSurfaceMuted,
                  ),
                ),
              ),
            ],
          ),
        ),
        Expanded(child: list),
      ],
    );
  }
}
