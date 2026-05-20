# Descoberta de arenas e slots (NexaGO)

Módulo **agnóstico de framework** (TypeScript) que replica a lógica do app Flutter (`arena_list_page.dart` + `SlotsRepository` + `VirtualSlotGenerator`).

Use em qualquer front (Angular, React, Next.js) desde que aponte para o **mesmo Firestore** do NexaGO.

## Coleções Firestore

| Coleção / path | Uso |
|----------------|-----|
| `arenas/{arenaId}` | Lista e detalhe da arena |
| `arenas/{arenaId}/courts/{courtId}` | Quadras, agenda (`availabilitySchedule`), preço horário |
| `arenas/{arenaId}/promotions/{promoId}` | Promoções (`active == true`) |
| `arenaSlots` | Slots persistidos (reservado/bloqueado); query por `arenaId` |

**Regras:** leitura pública em `arenas`, `courts`, `promotions` e `arenaSlots` (ver `firestore.rules`).

## Fluxo da busca (lista do atleta)

```
1. Listar todas as arenas (collection `arenas`)
2. Para cada arena (em paralelo):
   a. Carregar quadras (`arenas/{id}/courts`)
   b. Para cada quadra:
      - Buscar docs em `arenaSlots` where arenaId == id
      - Carregar arena + promoções ativas
      - Gerar slots virtuais (grade da quadra) e mesclar com persistidos
   c. Filtrar slots: status available + não passados (se dia = hoje)
   d. Escolher slot para o horário pedido:
      - Exato (startTime == HH:mm pedido)
      - Senão o mais próximo (prefere horário depois do pedido)
3. Ordenar arenas:
   - Match exato primeiro
   - Depois com disponibilidade
   - Depois sem vaga
   - Dentro do grupo: menor distância em minutos ao horário pedido
```

## Fluxo da agenda (detalhe / uma arena)

Use `fetchArenaDaySlotsMerged(firestore, arenaId, date)` — um fetch de slots por `arenaId` + todas as quadras + merge virtual (igual `watchArenaDaySlotsMerged` no Flutter).

## Uso rápido

```typescript
import { getFirestore } from 'firebase/firestore';
import {
  fetchAllArenas,
  searchArenas,
  fetchArenaDaySlotsMerged,
  type ArenaSearchFilters,
} from '@nexago/arena-discovery';

const db = getFirestore(app);

const filters: ArenaSearchFilters = {
  date: new Date(2026, 4, 18), // só calendário
  requestedTime: '18:00',
};

const results = await searchArenas(db, filters);
// results[].hasAvailability, selectedSlot, isExactMatch, displayPricePerHourReais

const daySlots = await fetchArenaDaySlotsMerged(db, 'ARENA_ID', filters.date);
```

## Copiar para outro repositório

1. Copie a pasta `frontend/shared/arena-discovery/` inteira.
2. Instale `firebase` (v12+).
3. Ajuste imports ou publique como pacote interno.
4. **Não** duplique a lógica de preço/agenda — altere só aqui e sincronize com o Flutter se mudar regras.

## Paridade com Flutter

| Flutter | Este módulo |
|---------|-------------|
| `ArenasRepository.watchArenas` | `fetchAllArenas` |
| `SlotsRepository.watchSlots` | `fetchCourtDaySlots` |
| `SlotsRepository.watchArenaDaySlotsMerged` | `fetchArenaDaySlotsMerged` |
| `arenaSearchResultsProvider` | `searchArenas` |
| `VirtualSlotGenerator` | `virtual-slot-generator.ts` |
| `CourtPricing` | `court-pricing.ts` |

## Campos importantes no documento da arena

- `name`, `city`, `state`, `address`
- `pricePerHourReais` ou `basePriceReais` (fallback de preço)
- `coverUrl` / `imageUrl`
- `ratingAverage`, `reviewsCount`
- Opcional mapa: `lat`+`lng` ou `geo`

## Campos da quadra

- `availabilitySchedule` — mapa por dia (`monday`…`sunday`) ou lista com `weekday`
- `slotDurationMinutes` — padrão 60
- `basePricePerHourReais` — sobrescreve preço da arena

## Status do slot

- `available` — reservável
- `booked` / `occupied` / `reservado` — ocupado
- `blocked` / `bloqueado` — bloqueio manual

Slots sem documento em `arenaSlots` são **gerados virtualmente** como `available` nos horários da agenda da quadra.
