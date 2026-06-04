# ATBLoLBot

Bot de WhatsApp que monitora partidas de League of Legends dos jogadores registrados e gera mensagens de **roast** automaticas via IA (Google Gemini) quando detecta uma derrota.

Construido com **@whiskeysockets/baileys** (headless, sem Chromium), **Riot API** e **Google Gemini**. Roda em VPS Linux (Oracle Cloud Free Tier) gerenciado por **PM2**.

## Comandos do bot

| Comando | Descricao | Exemplo |
|---|---|---|
| `!player Nick#Tag` | Registra um jogador para monitoramento | `!player Faker#KR1` |
| `!roast_ultimo` | Gera "Boletim da Vergonha" com zoeiras para quem perdeu | `!roast_ultimo` |
| `!stats_10` | Mostra winrate das ultimas 10 partidas por jogador | `!stats_10` |
| `!meu_id` | Retorna o JID do chat/grupo (use para descobrir o `WHATSAPP_TARGET`) | `!meu_id` |

## Modos monitorados

| Modo | ID | Status |
|---|---|---|
| Ranked Solo/Duo | 420 | Monitorado |
| ARAM | 450 | Monitorado |
| Flex 5v5 | 440 | Monitorado |
| URF | 1900 | Monitorado |
| Arena | 1700 | Monitorado |
| TFT Normal | 1100 | Monitorado |
| TFT Ranked | 1101 | Monitorado |

## Como funciona o monitoramento automatico

1. A cada **~10 minutos** (configuravel via `POLLING_INTERVAL`), o bot verifica todos os jogadores
2. Busca a partida mais recente em **7 filas** simultaneamente
3. Compara com o ultimo ID salvo em `persist/data.json`
4. Se o ID mudou -> nova partida detectada
5. Se for **derrota** -> gera roast via Gemini e envia no grupo configurado em `WHATSAPP_TARGET`

**Tempo medio para detectar: ~1 a 10 minutos** apos o fim da partida (Riot API atualiza o historico em poucos segundos).

## Variaveis de ambiente

Copie `.env.example` para `.env` e preencha:

| Variavel | Obrigatoria | Descricao |
|---|---|---|
| `RIOT_API_KEY` | Sim | Chave da API Riot Games |
| `GEMINI_API_KEY` | Sim | Chave da API Google Gemini |
| `WHATSAPP_TARGET` | Sim | JID do grupo WhatsApp destino dos roasts automaticos |
| `POLLING_INTERVAL` | Nao | Intervalo em ms entre checagens (padrao: `600000` = 10 min) |
| `PORT` | Nao | Porta do health check HTTP (padrao: `3000`) |
| `NODE_ENV` | Nao | Apenas informativo (aparece no `pm2 list`) |
| `PERSIST_PATH` | Nao | Caminho customizado para a pasta de persistencia. Se vazio, usa `<projeto>/persist` |

> **Como descobrir o `WHATSAPP_TARGET`:** adicione o bot ao grupo, envie `!meu_id` no grupo e copie o JID retornado (formato `1203630xxxxxxxxx@g.us`).

---

## Deploy na Oracle Cloud com PM2 (recomendado)

### Pre-requisitos

- VPS Ubuntu 22.04+ (Oracle Cloud Free Tier funciona)
- Node.js 20 LTS (`node -v` deve mostrar `v20.x` ou superior)
- Portas 22 (SSH) e 3000 (health check, opcional) liberadas no security list

### Setup inicial

```bash
# 1. Conectar via SSH
ssh ubuntu@<IP_DA_VPS>

# 2. Instalar Node 20 LTS (se ainda nao tiver)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 3. Instalar PM2 globalmente
sudo npm install -g pm2

# 4. Clonar o repositorio
git clone https://github.com/<seu-user>/<seu-repo>.git
cd ATBLoLBot

# 5. Instalar dependencias de producao
npm install --production

# 6. Configurar .env
cp .env.example .env
nano .env   # preencha RIOT_API_KEY, GEMINI_API_KEY, WHATSAPP_TARGET
```

### Subir o bot com PM2

```bash
# Iniciar
npm run pm2:start

# OU direto
pm2 start ecosystem.config.js --env production
```

### Autenticar o WhatsApp (primeira vez)

O bot precisa escanear um QR Code. Como estamos em SSH sem GUI, o QR sera impresso **diretamente no terminal**:

```bash
pm2 logs atb-lol-bot
```

Voce vera algo assim:

```
[QR] QR Code gerado. Escaneie com o app.
[QR] Tambem disponivel em http://localhost:3000/qr

  █▀▀▀▀▀█  ▄▄▄▄▄▄▄  █▀▀▀▀▀█
  █ █▀▀█ █  █   █   █  █ █▀█ █
  ...
```

Escaneie com **WhatsApp > Aparelhos conectados > Conectar um aparelho**.

> **Alternativa:** se voce tiver tunelamento SSH com X11 ou acesso via browser na porta 3000, abra `http://<IP_DA_VPS>:3000/qr` para ver o QR como imagem.

Apos escanear, a sessao fica salva em `persist/auth_info_baileys/` e **nao precisa escanear de novo** (a menos que voce apague a pasta ou faca logout no celular).

### Persistir o PM2 apos reboot

```bash
pm2 save
pm2 startup    # copia e roda o comando que ele imprime (com sudo)
```

A partir de agora o bot volta sozinho se a VPS reiniciar.

### Operacao diaria

```bash
npm run pm2:logs       # ver logs em tempo real
npm run pm2:restart    # reiniciar (ex: apos git pull)
npm run pm2:reload     # reload graceful (zero-downtime, mas so funciona com fork mode)
npm run pm2:stop       # parar
npm run pm2:monit      # dashboard de CPU/RAM
pm2 list               # ver status de todos os processos
```

### Atualizar o bot apos um git push

```bash
cd ~/ATBLoLBot
git pull
npm install --production     # so se package.json mudou
npm run pm2:reload           # OU: pm2 restart atb-lol-bot
```

### Onde ficam os logs

- `logs/out.log` — output padrao (console.log)
- `logs/error.log` — erros (console.error, uncaughtException, etc.)
- Logs do proprio PM2: `~/.pm2/logs/`

Para acompanhar em tempo real: `pm2 logs atb-lol-bot` (Ctrl+C para sair).

---

## Arquitetura

```
src/
  index.js    — Entry point. WhatsApp connection (Baileys), comandos, polling, graceful shutdown
  riot.js     — API Riot: PUUID, match history, match details, winrate, rank
  gemini.js   — Prompts do Gemini: roasts e resumos de winrate (tudo em PT-BR)
ecosystem.config.js   — Config PM2 (max_memory_restart, node_args, logs)
```

## Persistencia

- `persist/data.json` — lista de jogadores + ultimo match ID por jogador/fila
- `persist/auth_info_baileys/` — credenciais WhatsApp (criado no primeiro scan)
- Por padrao, a pasta `persist/` fica na raiz do projeto (mesmo nivel que `package.json`). Para customizar (ex: colocar em `/var/lib/...` ou em um volume Docker), defina `PERSIST_PATH` na `.env`.

## Estabilidade / Ciclo de vida

O bot foi desenhado para sobreviver a:

- **Reinicios do PM2** (SIGTERM): para o polling, fecha HTTP, encerra o socket Baileys com `sock.end()` (preserva sessao), sai com codigo 0.
- **Crashes de API**: `uncaughtException` e `unhandledRejection` logam mas **nao derrubam** o processo. O PM2 detecta o processo vivo e nao reinicia.
- **Out of memory**: `ecosystem.config.js` define `max_memory_restart: 400M` e `node_args: --max-old-space-size=512`. O V8 nunca ultrapassa 512 MB; se chegar a 400 MB de RSS, o PM2 reinicia preventivamente.
- **Garbage collection explicita**: `global.gc()` e chamado a cada 5 min (requer `--expose-gc` que ja esta no `node_args`).
- **Reconexao WhatsApp**: 5s de delay se cair (exceto em logout explicito).

## Troubleshooting

| Sintoma | Causa provavel | Solucao |
|---|---|---|
| Bot reiniciou sozinho | Estourou `max_memory_restart: 400M` | `pm2 logs atb-lol-bot --err` e ver crescimento de RAM. Reduza `POLLING_INTERVAL` ou aumente `max_memory_restart` no `ecosystem.config.js` |
| QR Code nao aparece no terminal | Bot ja autenticado (sessao preservada) | Normal. Se quiser forcar novo QR: `pm2 stop atb-lol-bot && rm -rf persist/auth_info_baileys && pm2 start atb-lol-bot` |
| Roasts nao chegam no grupo | `WHATSAPP_TARGET` errado | Envie `!meu_id` no grupo, copie o JID, atualize `.env`, `pm2 restart` |
| Erro 403 do `getSummonerRank` | Quota da Riot API estourada | **Intencional** — o bot ignora e segue sem mostrar elo |
| Erro 429 do Gemini | Muitas chamadas seguidas | O Gemini.js ja tem fallback com mensagem pre-definida |
| `pm2 startup` falha | Usuario sem sudo | `sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu` |

## Notas

- **Region Riot hardcoded:** `americas` (ver `src/riot.js`). Se precisar de outro servidor, ajustar la.
- **Idioma:** todos os roasts e resumos sao em **portugues brasileiro** (prompts em `src/gemini.js`).
- **Codigo modular:** cada jogador e processado independentemente; falha de um nao derruba os outros.
- **Logs sao gitignored** (pasta `logs/` adicionada ao `.gitignore`).
