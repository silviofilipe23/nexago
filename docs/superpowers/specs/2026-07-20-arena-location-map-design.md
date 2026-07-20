# Mapa de localização — tela da arena e detalhe da reserva

## Contexto

O painel do atleta (`frontend/projects/athlete`) já tem, em duas telas, um card
"Localização" com o endereço textual e um botão "Ver rotas" que abre o Google
Maps externamente (`mapsUrl()`, calculado a partir de `ArenaListItem.lat/lng`):

- `arena-detail.component` (tela da arena) — card sem nenhuma caixa de mapa.
- `agenda/booking-detail/athlete-booking-detail.component` (detalhe da reserva)
  — já tem uma caixa placeholder (`.bd-map-placeholder`) só com texto decorativo
  ("Mapa · rota até a arena"), sem tiles reais.

Nenhuma integração de mapa real existe hoje no repo (nem Google Maps JS/Embed,
nem Mapbox/Leaflet) — não há API key configurada em `environment.ts`. O app
Flutter usa um placeholder puramente visual (grid + pin), também sem mapa real.

## Decisão

Mapa real embutido via **OpenStreetMap embed** (`openstreetmap.org/export/embed.html`),
gratuito e sem API key/billing. Trade-off aceito: os tiles do OSM têm estilo
visual próprio (claro), não seguem o tema claro/escuro do app.

## Componente novo

`src/app/shared/location-map/location-map.component.ts` — standalone,
`ChangeDetectionStrategy.OnPush`, sem lógica de negócio.

- Inputs (`input()`): `lat: number | null`, `lng: number | null`, `label: string`
  (usado como `title` acessível do iframe).
- `computed()` interno gera a bbox (±0,006° em torno do ponto, ~600m) e monta a
  URL: `https://www.openstreetmap.org/export/embed.html?bbox=<w>,<s>,<e>,<n>&layer=mapnik&marker=<lat>,<lng>`.
- Se `lat` ou `lng` forem `null`: não renderiza `<iframe>`; mostra um bloco de
  texto simples ("Localização não disponível no mapa") — nunca um iframe quebrado.
- Sem CSS de card próprio (sem sombra/borda/padding de container) — cada tela
  controla a moldura; o componente só ocupa `width: 100%; height: 100%` do slot.

## Onde entra

- `arena-detail.component.html`: dentro do card "Localização" existente, acima
  do parágrafo de endereço. Nova caixa com altura fixa (~160px, consistente com
  as demais caixas de card dessa tela).
- `athlete-booking-detail.component.html`: substitui o conteúdo de
  `.bd-map-placeholder` (mantendo a classe/dimensões do container) pelo
  componente novo.

## Fora de escopo

- Tema escuro para os tiles do mapa (exigiria tile server custom).
- Interatividade além do zoom/pan padrão do iframe do OSM.
- Qualquer alteração de dados (`ArenaListItem` já tem `lat`/`lng`).
