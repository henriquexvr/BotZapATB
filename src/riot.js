const axios = require('axios');
require('dotenv').config();

const API_KEY = process.env.RIOT_API_KEY;
const REGION = 'americas'; // Adjust based on your region: americas, europe, asia, sea

const riotApi = axios.create({
  headers: { 'X-Riot-Token': API_KEY }
});

async function getPuuid(gameName, tagLine) {
  try {
    const url = `https://${REGION}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
    const response = await riotApi.get(url);
    return response.data.puuid;
  } catch (error) {
    console.error(`Error getting PUUID for ${gameName}#${tagLine}:`, error.message);
    return null;
  }
}

async function getLatestMatchId(puuid) {
  try {
    // Busca a partida mais recente entre Solo/Duo (420) e ARAM (450)
    const [soloRes, aramRes] = await Promise.all([
      riotApi.get(`https://${REGION}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=1&queue=420`),
      riotApi.get(`https://${REGION}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=1&queue=450`)
    ]);

    const soloMatch = soloRes.data[0];
    const aramMatch = aramRes.data[0];

    // Retorna o ID com o número mais alto (partida mais recente)
    if (!soloMatch) return aramMatch;
    if (!aramMatch) return soloMatch;

    // IDs do formato BR1_XXXXXXXXXX — compara numericamente o sufixo
    const soloNum = parseInt(soloMatch.split('_')[1]);
    const aramNum = parseInt(aramMatch.split('_')[1]);

    return soloNum > aramNum ? soloMatch : aramMatch;
  } catch (error) {
    console.error(`Error getting latest match for ${puuid}:`, error.message);
    return null;
  }
}

async function getMatchDetails(matchId, puuid) {
  try {
    const url = `https://${REGION}.api.riotgames.com/lol/match/v5/matches/${matchId}`;
    const response = await riotApi.get(url);
    const info = response.data.info;
    const participant = info.participants.find(p => p.puuid === puuid);

    if (!participant) return null;

    // Encontrar o oponente direto (mesma posição no time oposto)
    const opponent = info.participants.find(p => p.teamId !== participant.teamId && p.teamPosition === participant.teamPosition) || 
                     info.participants.find(p => p.teamId !== participant.teamId); // Fallback se não achar posição exata

    return {
      matchId: matchId,
      win: participant.win,
      champion: participant.championName,
      kda: `${participant.kills}/${participant.deaths}/${participant.assists}`,
      lane: participant.individualPosition || participant.lane,
      items: [participant.item0, participant.item1, participant.item2, participant.item3, participant.item4, participant.item5].filter(id => id !== 0),
      opponentChampion: opponent ? opponent.championName : 'Desconhecido',
      gold: participant.goldEarned,
      damage: participant.totalDamageDealtToChampions,
      gameMode: info.gameMode,
      timestamp: info.gameEndTimestamp
    };
  } catch (error) {
    console.error(`Error getting match details for ${matchId}:`, error.message);
    return null;
  }
}

async function getMatchHistoryIds(puuid, count = 30) {
  try {
    // Busca metade de cada modo para totalizar ~count partidas
    const half = Math.ceil(count / 2);
    const [soloRes, aramRes] = await Promise.all([
      riotApi.get(`https://${REGION}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=${half}&queue=420`),
      riotApi.get(`https://${REGION}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=${half}&queue=450`)
    ]);

    // Junta e ordena pelo número do ID (mais recente primeiro)
    const all = [...soloRes.data, ...aramRes.data];
    all.sort((a, b) => parseInt(b.split('_')[1]) - parseInt(a.split('_')[1]));
    return all.slice(0, count);
  } catch (error) {
    console.error(`Error getting match history for ${puuid}:`, error.message);
    return [];
  }
}

async function getWinRateStats(puuid, matchIds) {
  let wins = 0;
  let losses = 0;
  const champions = {};

  try {
    const details = await Promise.all(matchIds.map(async (id) => {
      const url = `https://${REGION}.api.riotgames.com/lol/match/v5/matches/${id}`;
      const resp = await riotApi.get(url);
      const p = resp.data.info.participants.find(part => part.puuid === puuid);
      if (p) {
        if (p.win) wins++; else losses++;
        champions[p.championName] = (champions[p.championName] || 0) + 1;
      }
    }));

    const topChampion = Object.entries(champions).sort((a, b) => b[1] - a[1])[0];

    return {
      total: matchIds.length,
      wins,
      losses,
      winRate: ((wins / matchIds.length) * 100).toFixed(1),
      topChampion: topChampion ? topChampion[0] : 'Desconhecido'
    };
  } catch (error) {
    console.error("Error calculating winrate stats:", error.message);
    return null;
  }
}

async function getSummonerRank(puuid) {
  try {
    const PLATFORM = 'br1'; 
    // Tentando passar a chave direto na URL para evitar problemas de header em diferentes subdomínios
    const summonerUrl = `https://${PLATFORM}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}?api_key=${API_KEY}`;
    const summonerResp = await axios.get(summonerUrl);
    const summonerId = summonerResp.data.id;

    const leagueUrl = `https://${PLATFORM}.api.riotgames.com/lol/league/v4/entries/by-summoner/${summonerId}?api_key=${API_KEY}`;
    const leagueResp = await axios.get(leagueUrl);
    
    const soloEntry = leagueResp.data.find(entry => entry.queueType === 'RANKED_SOLO_5x5');
    
    if (soloEntry) {
      return {
        tier: soloEntry.tier,
        rank: soloEntry.rank,
        lp: soloEntry.leaguePoints,
        wins: soloEntry.wins,
        losses: soloEntry.losses
      };
    }
    return null;
  } catch (error) {
    // Silenciando o erro 403 para não poluir o log, já que é uma restrição de chave da Riot
    if (error.response?.status !== 403) {
      console.error(`Error getting rank for ${puuid}:`, error.message);
    }
    return null;
  }
}

module.exports = { getPuuid, getLatestMatchId, getMatchDetails, getMatchHistoryIds, getWinRateStats, getSummonerRank };