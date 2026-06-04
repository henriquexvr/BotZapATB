const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  delay
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const fs = require('fs-extra');
const path = require('path');
const express = require('express');
require('dotenv').config();

const { getPuuid, getLatestMatchIds, getMatchDetails, getMatchHistoryIds, getWinRateStats, getSummonerRank } = require('./riot');
const { generateRoast, generateWinRateSummary, generateMultiRoast } = require('./gemini');

let currentSock = null;
let currentQR = null;
let isShuttingDown = false;
let pollingTimer = null;
let httpServer = null;

const port = parseInt(process.env.PORT, 10) || 3000;
const app = express();

app.get('/', (req, res) => res.send('ATBLoLBot is running! PM2 + Baileys.'));
app.get('/ping', (req, res) => res.send('pong'));
app.get('/qr', (req, res) => {
  if (!currentQR) {
    return res.status(404).send('QR Code nao disponivel. Conecte-se ao processo (pm2 logs) para ver o QR no terminal.');
  }
  res.setHeader('Content-Type', 'text/html');
  res.send(`<html><body style="display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#111"><img src="${currentQR}" /></body></html>`);
});

httpServer = app.listen(port, () => {
  console.log(`[HTTP] Health check server ouvindo em :${port}`);
});

const PERSIST_PATH = process.env.NODE_ENV === 'production' ? '/app/persist' : path.join(__dirname, '../persist');
if (!fs.existsSync(PERSIST_PATH)) fs.mkdirSync(PERSIST_PATH, { recursive: true });
const DATA_PATH = path.join(PERSIST_PATH, 'data.json');

async function loadData() {
  if (await fs.pathExists(DATA_PATH)) {
    return await fs.readJson(DATA_PATH);
  }
  return { players: [], lastMatchIds: {} };
}

async function saveData(data) {
  const tmpPath = DATA_PATH + '.tmp.' + process.pid;
  await fs.writeJson(tmpPath, data, { spaces: 2 });
  await fs.rename(tmpPath, DATA_PATH);
}

function renderQRToTerminal(qr) {
  console.log('\n========================================');
  console.log('  QR CODE PARA AUTENTICACAO WHATSAPP');
  console.log('  Escaneie com o app (Aparelhos conectados)');
  console.log('========================================\n');
  qrcodeTerminal.generate(qr, { small: true });
  console.log('\n========================================\n');
}

async function connectToWhatsApp() {
  if (isShuttingDown) return;

  const authPath = path.join(PERSIST_PATH, 'auth_info_baileys');
  const { state, saveCreds } = await useMultiFileAuthState(authPath);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
  });

  currentSock = sock;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    if (isShuttingDown) return;

    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      currentQR = await QRCode.toDataURL(qr, { width: 400 });
      renderQRToTerminal(qr);
      console.log('[QR] Tambem disponivel em http://localhost:' + port + '/qr');
    }

    if (connection === 'close') {
      currentQR = null;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(`[WS] Conexao fechada (status=${statusCode}). Reconectando: ${shouldReconnect}`);
      if (shouldReconnect && !isShuttingDown) {
        setTimeout(() => connectToWhatsApp(), 5000);
      } else {
        console.log('[WS] Sessao deslogada. Apague persist/auth_info_baileys/ para novo QR.');
      }
    } else if (connection === 'open') {
      currentQR = null;
      console.log('[WS] WhatsApp Bot conectado (Baileys)!');
      startPolling(sock);
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    if (isShuttingDown) return;
    const msg = m.messages[0];
    if (!msg.message) return;

    const from = msg.key.remoteJid;

    const text = msg.message.conversation ||
                 msg.message.extendedTextMessage?.text ||
                 msg.message.imageMessage?.caption ||
                 msg.message.videoMessage?.caption ||
                 msg.message.buttonsResponseMessage?.selectedButtonId ||
                 msg.message.listResponseMessage?.singleSelectReply?.selectedRowId ||
                 '';

    const msgBody = text.toLowerCase().trim();

    if (text) {
      console.log(`\n[NOVA MENSAGEM] De: ${from} | Texto: ${text}\n`);
    }

    if (msgBody.startsWith('!player ')) {
      const input = text.replace(/!player /i, '').trim();
      const parts = input.split('#');
      const gameName = parts[0];
      const tagLine = parts[1];

      if (!gameName || !tagLine) {
        await sock.sendMessage(from, { text: 'Formato invalido! Use: !player Nick#Tag\nExemplo: !player Faker#KR1' });
        return;
      }

      try {
        await sock.sendMessage(from, { text: `Buscando jogador ${gameName}#${tagLine}...` });
        const puuid = await getPuuid(gameName, tagLine);

        if (puuid) {
          const data = await loadData();
          if (data.players.some(p => p.puuid === puuid)) {
            await sock.sendMessage(from, { text: `Ja estou acompanhando ${gameName}#${tagLine}!` });
            return;
          }
          data.players.push({ name: gameName, tag: tagLine, puuid });
          await saveData(data);
          await sock.sendMessage(from, { text: `Agora estou vigiando as derrotas de ${gameName}#${tagLine}!` });
        } else {
          await sock.sendMessage(from, { text: `Nao encontrei esse jogador. Verifique Nick#Tag.` });
        }
      } catch (e) {
        console.error('[!player] Erro:', e.message);
      }
    }

    if (msgBody === '!meu_id') {
      await sock.sendMessage(from, { text: `O ID desta conversa/grupo e: ${from}` });
    }

    if (msgBody === '!roast_ultimo') {
      const data = await loadData();
      if (data.players.length === 0) {
        await sock.sendMessage(from, { text: "Nenhum jogador esta sendo vigiado ainda. Use !player Nick#Tag para adicionar." });
        return;
      }

      await sock.sendMessage(from, { text: "Buscando as ultimas partidas de todos os modos..." });

      const losses = [];
      const winners = [];

      for (const player of data.players) {
        try {
          const latestIds = await getLatestMatchIds(player.puuid);
          let rank = null;
          try {
            rank = await getSummonerRank(player.puuid);
          } catch (e) {
            console.log(`[rank] Nao foi possivel obter rank para ${player.name}, continuando sem elo.`);
          }

          for (const [queueId, matchId] of Object.entries(latestIds)) {
            const match = await getMatchDetails(matchId, player.puuid);
            if (match) {
              if (!match.win) {
                losses.push({ name: player.name, match, rank });
              } else {
                winners.push(player.name);
              }
            }
          }
        } catch (err) {
          console.error(`[!roast_ultimo] Erro para ${player.name}:`, err.message);
        }
      }

      if (losses.length > 0) {
        const roast = await generateMultiRoast(losses);
        await sock.sendMessage(from, { text: `*BOLETIM DA VERGONHA*\n\n${roast}` });
      }

      if (winners.length > 0) {
        await sock.sendMessage(from, { text: `Vencedores do momento (sem graca): ${winners.join(', ')}` });
      }

      if (losses.length === 0 && winners.length === 0) {
        await sock.sendMessage(from, { text: "Nao encontrei partidas recentes para ninguem." });
      }
    }

    if (msgBody === '!stats_30') {
      const data = await loadData();
      if (data.players.length === 0) {
        await sock.sendMessage(from, { text: "Nenhum jogador vigiado." });
        return;
      }

      await sock.sendMessage(from, { text: "Analisando as ultimas 30 partidas de todos... segura o coracao!" });

      for (const player of data.players) {
        try {
          const matchIds = await getMatchHistoryIds(player.puuid, 30);
          if (matchIds.length === 0) continue;

          const stats = await getWinRateStats(player.puuid, matchIds);
          if (stats) {
            const summary = await generateWinRateSummary(player.name, stats);
            await sock.sendMessage(from, { text: `*Relatorio de Performance: ${player.name}*\n\n${summary}` });
          }
        } catch (err) {
          console.error(`[!stats_30] Erro para ${player.name}:`, err.message);
        }
      }
    }
  });
}

async function startPolling(sock) {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }

  console.log('[POLL] Iniciando loop de monitoramento de partidas...');
  pollingTimer = setInterval(async () => {
    if (isShuttingDown) return;

    const data = await loadData();
    const target = process.env.WHATSAPP_TARGET;

    if (!target || target === 'COLOCAR_ID_AQUI') {
      console.log('[POLL] WHATSAPP_TARGET nao definido em .env. Pulando.');
      return;
    }

    for (const player of data.players) {
      try {
        const latestIds = await getLatestMatchIds(player.puuid);
        if (Object.keys(latestIds).length === 0) continue;

        if (!data.lastMatchIds[player.puuid]) {
          console.log(`[POLL] Inicializando match IDs para ${player.name}:`, latestIds);
          data.lastMatchIds[player.puuid] = latestIds;
          await saveData(data);
          continue;
        }

        const lastSeen = data.lastMatchIds[player.puuid];

        if (typeof lastSeen === 'string') {
          const migrated = {};
          for (const [qId, matchId] of Object.entries(latestIds)) {
            migrated[qId] = matchId;
          }
          if (!migrated[420] && lastSeen) migrated[420] = lastSeen;
          data.lastMatchIds[player.puuid] = migrated;
        }

        const currentLastSeen = data.lastMatchIds[player.puuid];

        for (const [queueId, matchId] of Object.entries(latestIds)) {
          const previousId = currentLastSeen[queueId];

          if (!previousId) {
            console.log(`[POLL] Inicializando queue ${queueId} para ${player.name}: ${matchId}`);
            currentLastSeen[queueId] = matchId;
            continue;
          }

          if (matchId !== previousId) {
            console.log(`[POLL] Nova partida para ${player.name} (queue ${queueId}): ${matchId}`);
            const match = await getMatchDetails(matchId, player.puuid);

            if (match && !match.win) {
              console.log(`[POLL] DERROTA detectada para ${player.name}. Gerando roast...`);
              let rank = null;
              try {
                rank = await getSummonerRank(player.puuid);
              } catch (e) {
                console.log('[POLL] Erro ao buscar rank automatico.');
              }

              const roast = await generateRoast(player.name, match, rank);
              await sock.sendMessage(target, { text: roast });
              console.log(`[POLL] Roast automatico enviado para ${target}`);
            }

            currentLastSeen[queueId] = matchId;
          }
        }

        data.lastMatchIds[player.puuid] = currentLastSeen;
        await saveData(data);
      } catch (err) {
        console.error(`[POLL] Erro monitorando ${player.name}:`, err.message);
      }
    }
  }, process.env.POLLING_INTERVAL || 600000);
}

async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n[SHUTDOWN] Sinal ${signal} recebido. Encerrando graciosamente...`);

  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
    console.log('[SHUTDOWN] Polling loop parado.');
  }

  if (httpServer) {
    await new Promise((resolve) => httpServer.close(() => resolve()));
    console.log('[SHUTDOWN] Servidor HTTP fechado.');
  }

  if (currentSock) {
    try {
      currentSock.end();
      console.log('[SHUTDOWN] Socket WhatsApp encerrado (sessao preservada).');
    } catch (e) {
      console.error('[SHUTDOWN] Erro ao encerrar socket:', e.message);
    }
  }

  await delay(500);

  console.log('[SHUTDOWN] Bye! Process exit 0.');
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('uncaughtException', (err) => {
  console.error('[FATAL] uncaughtException:', err);
  console.error('[FATAL] Stack:', err?.stack);
});

process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] unhandledRejection:', reason);
  if (reason instanceof Error) {
    console.error('[FATAL] Stack:', reason.stack);
  }
});

if (global.gc) {
  setInterval(() => {
    try {
      global.gc();
    } catch (e) {
      console.error('[GC] Erro:', e.message);
    }
  }, 5 * 60 * 1000);
}

setInterval(() => {
  const mem = process.memoryUsage();
  console.log(`[MEM] rss=${(mem.rss / 1024 / 1024).toFixed(1)}MB heapUsed=${(mem.heapUsed / 1024 / 1024).toFixed(1)}MB`);
}, 60 * 60 * 1000);

process.on('exit', (code) => {
  console.log(`[EXIT] Processo encerrando com codigo ${code}.`);
});

connectToWhatsApp();
