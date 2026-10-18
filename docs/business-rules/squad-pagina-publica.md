# NexaSquad · Página pública "Conheça o Squad"

Rota: site institucional `nexago.com.br/squad` (o desenho dizia `nexago.app/squad`; o domínio
`nexago.app` não existe). Aberta, sem login. Item "Squad" no menu do site e no rodapé.

## Dados

O contrato (`squadAmbassadors/{uid}`) leva comissão, % de desconto do seguidor e versão das regras,
e o perfil (`users/{uid}`) é gravado pelo atleta — nenhum dos dois abre para leitura pública. A
página lê um **espelho público**, recalculado pelos gatilhos de `functions/src/squad-public-sync.ts`.

| Caminho | Quem lê | Quem grava | O quê |
|---|---|---|---|
| `squadPublic/{uid}` | qualquer um | só gatilho | embaixador com contrato **ativo** |

```
name, photoUrl|null, tier: 'ath'|'amb'|'pro'|'cap', code,
city|null, state|null, arenaName|null, sport|null,
elo|null ("Elite II"), eloIndex|null (0–15, ordena), tournaments|null, updatedAt
```
Nenhum número de dinheiro, Score, ROI ou ranking interno. Nem o % de desconto: o desconto real tem
teto na taxa da plataforma (`squad-fee-cap.ts`), então um % publicado seria promessa errada — o
card diz só "Desconto na 1ª inscrição".

### Quem aparece
- Só `status: active` com nível e código válidos. Pausado ("Código indisponível.") e encerrado saem.
- Conta apagada sai.
- Perfil privado (`privacyPreferences.profileVisibility: private`): fica nome, nível, cidade/arena e
  código (o papel público de embaixador); saem foto, esporte, Elo e torneios.
- "Mostrar conquistas e nível" desligado (`showOthers.achievementsAndLevel: false`): saem Elo e torneios.
- Cidade e arena vêm do perfil de hoje e caem para o retrato do contrato.

### Gatilhos
| Fonte | Gatilho | Quando recalcula |
|---|---|---|
| `squadAmbassadors/{uid}` | `onSquadAmbassadorWrittenSyncPublic` | sempre (grava ou apaga) |
| `users/{uid}` | `onUserWrittenSyncSquadPublic` | só se mudou nome, foto, cidade, arena, esporte, elo ou privacidade — e só para quem tem contrato ativo |
| `artifacts/{appId}/public/data/athleteRankings/{uid}` | `onAthleteRankingWrittenSyncSquadPublic` | só se mudou `tournamentsCount` — e só para quem tem contrato ativo |

Backfill (contratos de antes dos gatilhos, e espelho órfão):
`cd functions && npm run build && node scripts/sync-squad-public.js --project <id> [--yes]`.

## Página
- Código vira o link `https://atleta.nexago.com.br/?squad=CODIGO` (o portal guarda o clique e grava
  pela `recordSquadAttribution` quando houver sessão). "Copiar" leva só o código.
- "Quero ser embaixador" / "Quero ser Captain" → `https://atleta.nexago.com.br/squad` ("Entrar no
  Squad" do portal; enquanto a rota não existir, o portal cai no painel).
- Ordem: Pro → Captain → Ambassador → Athlete; dentro do nível, Elo, torneios e nome.
- Desktop: Captains em seção própria + grade dos outros (8 e "Ver mais N"). Celular: lista única.
- Filtros: nível (chips com contagem), cidade (desktop, com 2+ cidades) e busca por nome, cidade,
  arena ou código (sem acento/caixa).
- Estados: carregando, erro com "Tentar de novo", sem embaixador ("chegam em breve"), sem resultado.
