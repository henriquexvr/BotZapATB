const axios = require('axios');
require('dotenv').config();

const API_KEY = process.env.RIOT_API_KEY;
const REGION = 'americas';

const riotApi = axios.create({
  headers: { 'X-Riot-Token': API_KEY }
});

const LOL_QUEUES = {
  RANKED_SOLO: 420,
  ARAM: 450,
  FLEX_5V5: 440,
  URF: 1900,
  ARENA: 1700
};

const TFT_QUEUES = {
  TFT_NORMAL: 1100,
  TFT_RANKED: 1101
};

const ALL_QUEUES = { ...LOL_QUEUES, ...TFT_QUEUES };

function isTftQueue(queueId) {
  return Object.values(TFT_QUEUES).includes(queueId);
}

function matchListUrl(puuid, queueId, count, start = 0) {
  const base = isTftQueue(queueId) ? 'tft/match/v5' : 'lol/match/v5';
  return `https://${REGION}.api.riotgames.com/${base}/matches/by-puuid/${puuid}/ids?start=${start}&count=${count}&queue=${queueId}`;
}

function matchDetailUrl(matchId, queueId) {
  const base = isTftQueue(queueId) ? 'tft/match/v5' : 'lol/match/v5';
  return `https://${REGION}.api.riotgames.com/${base}/matches/${matchId}`;
}

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
    const queueIds = Object.values(ALL_QUEUES);
    const requests = queueIds.map(q =>
      riotApi.get(matchListUrl(puuid, q, 1, 0))
    );
    const results = await Promise.allSettled(requests);

    const latest = {};
    results.forEach((res, i) => {
      const q = queueIds[i];
      if (res.status === 'fulfilled') {
        if (res.value.data && res.value.data.length > 0) {
          latest[q] = res.value.data[0];
        }
      } else {
        const status = res.reason?.response?.status;
        const msg = res.reason?.message || 'unknown';
        console.warn(`[RIOT] Falha ao buscar queue ${q} para ${puuid}: HTTP ${status || '?'} (${msg})`);
      }
    });

    return latest;
  } catch (error) {
    console.error(`Error getting latest matches for ${puuid}:`, error.message);
    return {};
  }
}

async function getMatchDetails(matchId, puuid, queueId = null) {
  try {
    let response;
    if (queueId) {
      const url = matchDetailUrl(matchId, queueId);
      response = await riotApi.get(url);
    } else {
      try {
        const lolUrl = matchDetailUrl(matchId, 420);
        response = await riotApi.get(lolUrl);
      } catch (e) {
        if (e.response?.status === 404) {
          const tftUrl = matchDetailUrl(matchId, 1100);
          response = await riotApi.get(tftUrl);
        } else {
          throw e;
        }
      }
    }

    const info = response.data.info;
    const participant = info.participants.find(p => p.puuid === puuid);

    if (!participant) return null;

    const effectiveQueueId = queueId || info.queueId;
    const isTft = isTftQueue(effectiveQueueId);

    if (isTft) {
      return {
        matchId,
        win: participant.placement <= 4,
        placement: participant.placement,
        champion: participant.units?.[0]?.character_name || 'Desconhecido',
        augments: participant.augments || [],
        traits: (participant.traits || []).map(t => `${t.name} (${t.num_units})`),
        totalDamage: participant.total_damage_to_players || 0,
        goldLeft: participant.gold_left || 0,
        units: (participant.units || []).map(u => u.character_name),
        gameMode: 'TFT',
        queueId: effectiveQueueId,
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
      queueId: effectiveQueueId,
      timestamp: info.gameEndTimestamp
    };
  } catch (error) {
    console.error(`Error getting match details for ${matchId}:`, error.message);
    return null;
  }
}

async function getMatchHistoryIds(puuid, count = 10) {
  try {
    const perQueue = Math.ceil(count / 7) + 1;
    const queueIds = Object.values(ALL_QUEUES);
    const requests = queueIds.map(q =>
      riotApi.get(matchListUrl(puuid, q, perQueue, 0))
    );
    const results = await Promise.allSettled(requests);

    const all = [];
    results.forEach((res, i) => {
      const q = queueIds[i];
      if (res.status === 'fulfilled') {
        res.value.data.forEach(matchId => all.push({ matchId, queueId: q }));
      } else {
        const status = res.reason?.response?.status;
        const msg = res.reason?.message || 'unknown';
        console.warn(`[RIOT] Falha ao buscar queue ${q} para ${puuid}: HTTP ${status || '?'} (${msg})`);
      }
    });
    all.sort((a, b) => parseInt(b.matchId.split('_').pop()) - parseInt(a.matchId.split('_').pop()));
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
    FLEX: { wins: 0, losses: 0 },
    URF: { wins: 0, losses: 0 },
    ARENA: { wins: 0, losses: 0 },
    TFT: { wins: 0, losses: 0 }
  };

  try {
    const BATCH_SIZE = 10;
    const details = [];
    for (let i = 0; i < matchIds.length; i += BATCH_SIZE) {
      const batch = matchIds.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(batch.map(async ({ matchId, queueId }) => {
        const resp = await riotApi.get(matchDetailUrl(matchId, queueId));
        const info = resp.data.info;
        const participant = info.participants.find(part => part.puuid === puuid);
        return { participant, queueId: info.queueId };
      }));
      details.push(...batchResults);
    }

    details.forEach(({ participant, queueId }) => {
      if (!participant) return;

      const isTft = isTftQueue(queueId);
      const win = isTft ? participant.placement <= 4 : participant.win;
      if (win) wins++; else losses++;

      const displayName = isTft
        ? (participant.units?.[0]?.character_name || 'TFT')
        : participant.championName;
      champions[displayName] = (champions[displayName] || 0) + 1;

      if (queueId === LOL_QUEUES.RANKED_SOLO) {
        if (win) modes.RANKED.wins++; else modes.RANKED.losses++;
      } else if (queueId === LOL_QUEUES.ARAM) {
        if (win) modes.ARAM.wins++; else modes.ARAM.losses++;
      } else if (queueId === LOL_QUEUES.FLEX_5V5) {
        if (win) modes.FLEX.wins++; else modes.FLEX.losses++;
      } else if (queueId === LOL_QUEUES.URF) {
        if (win) modes.URF.wins++; else modes.URF.losses++;
      } else if (queueId === LOL_QUEUES.ARENA) {
        if (win) modes.ARENA.wins++; else modes.ARENA.losses++;
      } else if (isTft) {
        if (win) modes.TFT.wins++; else modes.TFT.losses++;
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
