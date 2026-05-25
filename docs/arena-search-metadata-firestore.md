# Arenas — metadados de busca (atleta)

Campos em `arenas/{arenaId}` usados pelos filtros da aba **Reservar**:

## `courtTypes` (esportes)

Lista de rótulos de esporte. Alinhada a `ArenaSearchMetadata.sportLabels` e aos `type` das quadras.

Exemplo:

```json
{
  "courtTypes": ["Vôlei de praia", "Beach tennis"]
}
```

Atualizado pelo gestor no perfil e **automaticamente** ao criar/editar/remover quadras (`syncFromCourts`).

## Quadras — `courts/{courtId}.types`

Cada quadra pode ter **vários esportes** (ex.: areia com vôlei de praia + beach tennis):

```json
{
  "types": ["Vôlei de praia", "Beach tennis"],
  "type": "Vôlei de praia"
}
```

`type` (string) permanece como primeiro item da lista, por compatibilidade.

## `surfaces` (superfícies)

Lista fixa: **Areia**, **Saibro**, **Sintética**, **Grama**, **Concreto**.

```json
{
  "surfaces": ["Areia", "Sintética"]
}
```

Editável no perfil da arena (seção **Busca do atleta**).

## `amenities`

Ver [arena-amenities-firestore.md](./arena-amenities-firestore.md).

## Pagamento

- `onlinePaymentEnabled` — PIX e cartão online
- `onsitePaymentEnabled` — pagar na arena

## Preço e localização

- `pricePerHourReais` — atualizado com o **menor** `basePricePerHourReais` das quadras ao sincronizar
- `latitude` / `longitude` — necessários para filtro de **raio** (km)

## Score NexaGO

- `reputationScore` — calculado pelo produto (avaliações); não editado no cadastro
