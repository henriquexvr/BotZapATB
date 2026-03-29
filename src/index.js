const axios = require('axios');

const RIOT_API_KEY = process.env.RIOT_API_KEY;
const REGION = 'americas';
const PLATFORM = 'br1';

// Cache para evitar requisições repetidas
const matchCache = new Map();
const MAX_CACHE_SIZE = 500;

// Função de delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Função para limpar cache quando ficar muito grande
function cleanCache() {
  if (matchCache.size > MAX_CACHE_SIZE) {
    const firstKey = matchCache.keys().next().value;
    matchCache.delete(firstKey);
  }
}

// Função com retry e backoff exponencial
async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await delay(1200); // Delay de 1.2s antes de cada requisição
      
      const response = await axios.get(url, {
        headers: { 'X-Riot-Token': RIOT_API_KEY },
        timeout: 10000
      });
      return response.data;
    } catch (error) {
      if (error.response?.status === 429) {
        const waitTime = Math.pow(2, i) * 3000; // 3s, 6s, 12s
        console.log(`⏳ Rate limit atingido. Aguardando ${waitTime/1000}s antes de tentar novamente...`);
        await delay(waitTime);
        continue;
      }
      
      if (error.response?.status === 503 || error.response?.status === 500) {
        const waitTime = 2000 * (i + 1);
        console.log(`⚠️ Servidor indisponível. Aguardando ${waitTime/1000}s...`);
        await delay(waitTime);
        continue;
      }
      
      throw error;
    }
  }
  throw new Error('❌ Máximo de tentativas atingido');
}

async function getPuuid(gameName, tagLine) {
  try {
    const url = `https://${REGION}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
    const data = await fetchWithRetry(url);
    return data.puuid;
  } catch (error) {
    console.error(`Erro ao buscar PUUID para ${gameName}#${tagLine}:`, error.message);
    return null;
  }
}

async function getLatestMatchId(puuid) {
  try {
    const url = `https://${REGION}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=1&queue=420`; // ARAM removido, mantém apenas Solo/Duo
    const matches = await fetchWithRetry(url);
    return matches.length > 0 ? matches[0] : null;
  } catch (error) {
    console.error('Erro ao buscar última partida:', error.message);
    return null;
  }
}

async function getMatchHistoryIds(puuid, count = 15) {
  try {
    const url = `https://${REGION}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=${count}&queue=420`; // Apenas Solo/Duo
    const matches = await fetchWithRetry(url);
    return matches || [];
  } catch (error) {
    console.error('Erro ao buscar histórico de partidas:', error.message);
    return [];
  }
}

async function getMatchDetails(matchId, puuid) {
  try {
    // Verifica cache primeiro
    if (matchCache.has(matchId)) {
      const cached = matchCache.get(matchId);
      return cached[puuid] || null;
    }

    const url = `https://${REGION}.api.riotgames.com/lol/match/v5/matches/${matchId}`;
    const data = await fetchWithRetry(url);

    if (!data || !data.info || !data.info.participants) {
      return null;
    }

    const participant = data.info.participants.find(p => p.puuid === puuid);
    if (!participant) return null;

    const result = {
      win: participant.win,
      champion: participant.championName,
      kills: participant.kills,
      deaths: participant.deaths,
      assists: participant.assists,
      kda: participant.challenges?.kda || 0,
      cs: participant.totalMinionsKilled + participant.neutralMinionsKilled,
      gold: participant.goldEarned,
      damage: participant.totalDamageDealtToChampions,
      gameMode: data.info.gameMode,
      gameDuration: Math.floor(data.info.gameDuration / 60)
    };

    // Salva no cache
    cleanCache();
    if (!matchCache.has(matchId)) {
      matchCache.set(matchId, {});
    }
    matchCache.get(matchId)[puuid] = result;

    return result;
  } catch (error) {
    console.error(`Erro ao buscar detalhes da partida ${matchId}:`, error.message);
    return null;
  }
}

async function getWinRateStats(puuid, matchIds) {
  let wins = 0;
  let losses = 0;
  const champStats = {};

  console.log(`📊 Analisando ${matchIds.length} partidas...`);

  for (let i = 0; i < matchIds.length; i++) {
    const matchId = matchIds[i];
    try {
      const match = await getMatchDetails(matchId, puuid);
      if (!match) continue;

      if (match.win) wins++;
      else losses++;

      if (!champStats[match.champion]) {
        champStats[match.champion] = { wins: 0, losses: 0, games: 0 };
      }
      champStats[match.champion].games++;
      if (match.win) champStats[match.champion].wins++;
      else champStats[match.champion].losses++;

      // Mostra progresso
      if ((i + 1) % 5 === 0) {
        console.log(`   ✓ ${i + 1}/${matchIds.length} partidas analisadas`);
      }
    } catch (err) {
      console.error(`Erro ao processar partida ${matchId}:`, err.message);
    }
  }

  console.log(`✅ Análise completa: ${wins}V ${losses}D`);

  return { wins, losses, champStats };
}

async function getSummonerRank(puuid) {
  try {
    // Primeiro pega o summonerId
    const accountUrl = `https://${PLATFORM}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`;
    const accountData = await fetchWithRetry(accountUrl);
    
    if (!accountData || !accountData.id) {
      return null;
    }

    // Depois pega o rank
    const rankUrl = `https://${PLATFORM}.api.riotgames.com/lol/league/v4/entries/by-summoner/${accountData.id}`;
    const rankData = await fetchWithRetry(rankUrl);

    if (!rankData || rankData.length === 0) {
      return null;
    }

    // Procura rank de Solo/Duo
    const soloRank = rankData.find(r => r.queueType === 'RANKED_SOLO_5x5');
    if (soloRank) {
      return {
        tier: soloRank.tier,
        rank: soloRank.rank,
        lp: soloRank.leaguePoints,
        wins: soloRank.wins,
        losses: soloRank.losses
      };
    }

    return null;
  } catch (error) {
    console.error('Erro ao buscar rank:', error.message);
    return null;
  }
}

module.exports = {
  getPuuid,
  getLatestMatchId,
  getMatchDetails,
  getMatchHistoryIds,
  getWinRateStats,
  getSummonerRank
};