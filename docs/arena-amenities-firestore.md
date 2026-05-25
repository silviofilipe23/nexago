# Arenas — comodidades (Firestore)

Campo opcional em `arenas/{arenaId}`:

```json
{
  "amenities": {
    "parking": true,
    "lockerRoom": true,
    "coveredCourt": false,
    "bar": true,
    "racketRental": false
  }
}
```

| Campo | Descrição |
|-------|-----------|
| `parking` | Estacionamento |
| `lockerRoom` | Vestiário |
| `coveredCourt` | Quadra coberta / indoor |
| `bar` | Bar no local |
| `racketRental` | Aluguel de raquetes |

Editável pelo gestor em **Perfil da arena** (app Flutter).
