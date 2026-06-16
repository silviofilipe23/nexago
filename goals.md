# Metas nexaGO

## Meta 1 — Lançamento do app
Publicar o nexaGO nas lojas (App Store + Google Play) em versão estável para atletas e organizadores.

**Critérios de done:**
- Build de produção sem erros (iOS + Android)
- Fluxos críticos funcionando: cadastro, busca de arenas, inscrição em torneio
- App aprovado nas lojas e disponível para download

---

## Meta 2 — Criar a Liga nexaGO
Lançar a Liga nexaGO como produto dentro do app: uma competição seriada com etapas, pontuação acumulada e ranking próprio.

**O que precisa existir:**
- Modelo de dados `leagues/{leagueId}` no Firestore com etapas vinculadas
- Tela de Liga no app (atleta vê etapas, pontuação, classificação)
- Painel do organizador para gerenciar a liga
- Registro de pontos por etapa → atualização do ranking da liga

---

## Meta 3 — 1ª Etapa da Liga nexaGO em 24/10
Realizar a primeira etapa presencial da Liga nexaGO no dia **24 de outubro**.

**O que precisa estar pronto antes:**
- Liga criada no Firestore e visível no app
- Inscrições abertas para a 1ª etapa (torneio vinculado à liga)
- Chaveamento e resultados funcionando na etapa
- Comunicação com atletas (notificação push / divulgação)

**Data-limite para inscrições abertas:** idealmente 2 semanas antes (até 10/10)

---

## Próximas ações sugeridas
> Atualizar conforme sprint avança.

- [ ] Mapear o que falta para o build de produção (iOS + Android)
- [ ] Modelar `leagues` no Firestore e criar rules de acesso
- [ ] Criar feature `league/` no Flutter (telas + provider)
- [ ] Vincular torneio `tournaments/{id}` a uma liga via `leagueId`
- [ ] Abrir inscrições da 1ª etapa até 10/10

---

## Roadmap de Funcionalidades — até Dezembro/2026

### Jul–Ago · Preparação para lançamento
> Foco: estabilizar o MVP e fechar o que trava a publicação nas lojas.

**Torneios**
- [ ] Chaveamento automático (simples e duplas) gerado ao fechar inscrições
- [ ] Registro de resultado de partida pelo organizador
- [ ] Tela de acompanhamento da chave para o atleta (bracket view)

**Arenas**
- [ ] Galeria de fotos da arena (upload pelo gestor, visualização pelo atleta)
- [ ] Exibição de horários de funcionamento no perfil da arena

**Perfil do atleta**
- [ ] Foto de perfil (upload + crop)
- [ ] Categoria/nível do atleta (ex.: C, B, A, Open) editável no perfil

---

### Set–Out · Lançamento + 1ª Etapa (deadline: 24/10)
> Foco: publicar nas lojas e entregar a experiência da 1ª etapa da Liga nexaGO.

**Torneios**
- [ ] Notificação push de partida (horário, quadra, adversário)
- [ ] Confirmação de presença pelo atleta
- [ ] Histórico de torneios disputados no perfil

**Arenas**
- [ ] Filtro de busca por esporte e superfície já funcional na aba Reservar
- [ ] Mapa com localização das arenas cadastradas

**Perfil do atleta**
- [ ] Estatísticas básicas: torneios disputados, vitórias, % de aproveitamento
- [ ] Cartão de atleta (nome, categoria, foto, QR code de identificação na etapa)

---

### Nov–Dez · Pós-lançamento
> Foco: retenção de atletas e ferramentas que tornam a liga recorrente.

**Torneios**
- [ ] Avaliação de parceiro após torneio (rating interno)
- [ ] Resultados publicados no feed/home após encerramento da etapa

**Arenas**
- [ ] Avaliação da arena pelo atleta (estrelas + comentário)
- [ ] Reserva de quadra avulsa diretamente pelo app (v1 simples)

**Perfil do atleta**
- [ ] Ranking geral do atleta na Liga nexaGO com histórico de pontos por etapa
- [ ] Histórico de parceiros (com quem jogou, categoria, resultado)
