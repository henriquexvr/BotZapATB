const axios = require('axios');
require('dotenv').config();

const API_KEY = process.env.RIOT_API_KEY;
const REGION = 'americas';

const riotApi = axios.create({
  headers: { 'X-Riot-Token': API_KEY }
});

const QUEUES = {
  RANKED_SOLO: 420,
  ARAM: 450,
  TFT_NORMAL: 1100,
  TFT_RANKED: 1101
};

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

async function getLatestMatchIds(puuid) {
  try {
    const queueIds = Object.values(QUEUES);
    const requests = queueIds.map(q =>
      riotApi.get(`https://${REGION}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=1&queue=${q}`)
    );
    const results = await Promise.all(requests);

    const latest = {};
    results.forEach((res, i) => {
      if (res.data && res.data.length > 0) {
        latest[queueIds[i]] = res.data[0];
      }
    });

    return latest;
  } catch (error) {
    console.error(`Error getting latest matches for ${puuid}:`, error.message);
    return {};
  }
}

async function getMatchDetails(matchId, puuid) {
  try {
    const url = `https://${REGION}.api.riotgames.com/lol/match/v5/matches/${matchId}`;
    const response = await riotApi.get(url);
    const info = response.data.info;
    const participant = info.participants.find(p => p.puuid === puuid);

    if (!participant) return null;

    const queueId = info.queueId;

    if (queueId === QUEUES.TFT_NORMAL || queueId === QUEUES.TFT_RANKED) {
      return {
        matchId,
        win: participant.placement <= 4,
        placement: participant.placement,
        champion: participant.characters?.[0]?.character_name || 'Desconhecido',
        augments: participant.augments || [],
        traits: (participant.traits || []).map(t => `${t.name} (${t.num_units})`),
        totalDamage: participant.total_damage_to_players || 0,
        goldLeft: participant.gold_left || 0,
        units: (participant.units || []).map(u => u.character_name),
        gameMode: 'TFT',
        queueId,
        timestamp: info.gameEndTimestamp
      };
    }

    const opponent = info.participants.find(p => p.teamId !== participant.teamId && p.teamPosition === participant.teamPosition) ||
                     info.participants.find(p => p.teamId !== participant.teamId);

    return {
      matchId,
      win: participant.win,
      champion: participant.championName,
      kda: `${participant.kills}/${participant.deaths}/${participant.assists}`,
      lane: participant.individualPosition || participant.lane,
      items: [participant.item0, participant.item1, participant.item2, participant.item3, participant.item4, participant.item5].filter(id => id !== 0),
      opponentChampion: opponent ? opponent.championName : 'Desconhecido',
      gold: participant.goldEarned,
      damage: participant.totalDamageDealtToChampions,
      gameMode: info.gameMode,
      queueId,
      timestamp: info.gameEndTimestamp
    };
  } catch (error) {
    console.error(`Error getting match details for ${matchId}:`, error.message);
    return null;
  }
}

async function getMatchHistoryIds(puuid, count = 10) {
  try {
    const perQueue = Math.ceil(count / 4) + 1;
    const queueIds = Object.values(QUEUES);
    const requests = queueIds.map(q =>
      riotApi.get(`https://${REGION}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=${perQueue}&queue=${q}`)
    );
    const results = await Promise.all(requests);

    const all = [];
    results.forEach(res => all.push(...res.data));
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
  const modes = {
    RANKED: { wins: 0, losses: 0 },
    ARAM: { wins: 0, losses: 0 },
    TFT: { wins: 0, losses: 0 }
  };

  try {
    const BATCH_SIZE = 10;
    const details = [];
    for (let i = 0; i < matchIds.length; i += BATCH_SIZE) {
      const batch = matchIds.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(batch.map(async (id) => {
        const url = `https://${REGION}.api.riotgames.com/lol/match/v5/matches/${id}`;
        const resp = await riotApi.get(url);
        const participant = resp.data.info.participants.find(part => part.puuid === puuid);
        return { participant, queueId: resp.data.info.queueId };
      }));
      details.push(...batchResults);
    }

    details.forEach(({ participant, queueId }) => {
      if (participant) {
        const win = participant.win;
        if (win) wins++; else losses++;
        champions[participant.championName] = (champions[participant.championName] || 0) + 1;

        if (queueId === QUEUES.RANKED_SOLO) {
          if (win) modes.RANKED.wins++; else modes.RANKED.losses++;
        } else if (queueId === QUEUES.ARAM) {
          if (win) modes.ARAM.wins++; else modes.ARAM.losses++;
        } else if (queueId === QUEUES.TFT_NORMAL || queueId === QUEUES.TFT_RANKED) {
          if (win) modes.TFT.wins++; else modes.TFT.losses++;
        }
      }
    });

    const topChampion = Object.entries(champions).sort((a, b) => b[1] - a[1])[0];

    return {
      total: matchIds.length,
      wins,
      losses,
      winRate: ((wins / matchIds.length) * 100).toFixed(1),
      topChampion: topChampion ? topChampion[0] : 'Desconhecido',
      modes
    };
  } catch (error) {
    console.error("Error calculating winrate stats:", error.message);
    return null;
  }
}

async function getSummonerRank(puuid) {
  try {
    const PLATFORM = 'br1';
    const summonerUrl = `https://${PLATFORM}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`;
    const summonerResp = await riotApi.get(summonerUrl);
    const summonerId = summonerResp.data.id;

    const leagueUrl = `https://${PLATFORM}.api.riotgames.com/lol/league/v4/entries/by-summoner/${summonerId}`;
    const leagueResp = await riotApi.get(leagueUrl);

    const soloEntry = leagueResp.data.find(entry => entry.queueType === 'RANKED_SOLO_5x5');
    const tftEntry = leagueResp.data.find(entry => entry.queueType === 'RANKED_TFT');

    const entry = soloEntry || tftEntry;

    if (entry) {
      return {
        tier: entry.tier,
        rank: entry.rank,
        lp: entry.leaguePoints,
        wins: entry.wins,
        losses: entry.losses,
        queueType: entry.queueType
      };
    }
    return null;
  } catch (error) {
    if (error.response?.status !== 403) {
      console.error(`Error getting rank for ${puuid}:`, error.message);
    }
    return null;
  }
}

module.exports = { getPuuid, getLatestMatchIds, getMatchDetails, getMatchHistoryIds, getWinRateStats, getSummonerRank };
