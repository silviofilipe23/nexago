# Categorias

## Exemplos
- Masculino Iniciante
- Feminino Iniciante
- Masculino Open
- Feminino Open
- Masculino Intermediário
- Feminino Intermediário

## Regras
- Toda inscrição pertence a uma categoria.
- Limite de vagas deve ser respeitado.

## Presets globais
A plataforma oferece **seis presets de nível fechados**, mapeando faixas de degraus a rótulos (piso e teto). O preset é **derivado** (não gravado) — a partir da faixa exata, a função `presetFromRange()` identifica qual preset se aplica. Faixas sem match exato (categorias legadas ou customizadas) permanecem válidas na leitura, mas o wizard cria novas categorias sempre como **Livre**.

| Preset | Faixa (ranks) | Piso (label) | Teto (label) |
|---|---|---|---|
| Iniciante | 0–1 | Iniciante 1 | Iniciante 2 |
| Intermediário | 2–3 | Intermediário 1 | Intermediário 2 |
| Avançado | 4–5 | Avançado 1 | Avançado 2 |
| Open | 4–6 | Avançado 1 | Open |
| Elite | 6 | Open | Open |
| Livre | 0–6 | Iniciante 1 | Open |

## Modelo de armazenamento
- `categories[].level` = **teto** (label; ausente = Open, categoria legada só-teto).
- `categories[].minLevel` = **piso** (label; ausente = sem piso).
- Preset **nunca é armazenado** — derivado sempre na leitura pela faixa exata (piso → teto).
- Categoria **Livre grava piso explícito** (Iniciante 1) para manter a faixa 0–6 diferenciada; categorias legadas sem `minLevel` são preservadas.

## Faixa de nível (elegibilidade)
- Faixa é **regra da plataforma** — o wizard não oferece presets customizados; nova categoria sempre nasce como Livre.
- Elegibilidade: **todos os integrantes da dupla/equipe devem estar dentro da faixa** `[minLevel, level]`.
  - Numa dupla: o piso vale pelo integrante mais fraco, o teto pelo mais forte.
  - Numa equipe (trio+): todo membro deve estar na faixa (ver [Níveis de atleta](levels.md)).
- Um atleta pode liderar o ranking com nível baixo — categoria e nível são eixos independentes.
