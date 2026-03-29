// Prediction Markets — Polymarket + Kalshi
// Both APIs are fully public; no authentication required for market data.

import { safeFetch } from '../utils/fetch.mjs';

const POLYMARKET_URL = 'https://gamma-api.polymarket.com/markets?limit=25&active=true&closed=false&order=volume24hr&ascending=false';
const KALSHI_URL = 'https://api.elections.kalshi.com/trade-api/v2/markets?status=open&limit=25';

function fmtVol(v) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`;
  return `$${Math.round(v)}`;
}

async function fetchPolymarket() {
  const data = await safeFetch(POLYMARKET_URL, { timeout: 10000 });
  if (!Array.isArray(data)) return [];
  return data
    .filter(m => m.question && m.outcomePrices)
    .map(m => {
      const prices = Array.isArray(m.outcomePrices) ? m.outcomePrices : JSON.parse(m.outcomePrices || '[]');
      const yesPct = prices.length ? Math.round(parseFloat(prices[0]) * 100) : null;
      return {
        title: (m.question || '').substring(0, 80),
        yesPct,
        volume24h: parseFloat(m.volume24hr || m.volumeNum || 0),
        endDate: m.endDate || null,
        url: m.slug ? `https://polymarket.com/market/${m.slug}` : null,
        source: 'PM',
      };
    })
    .filter(m => m.yesPct !== null && m.volume24h > 0)
    .sort((a, b) => b.volume24h - a.volume24h)
    .slice(0, 10);
}

async function fetchKalshi() {
  const data = await safeFetch(KALSHI_URL, { timeout: 10000 });
  const markets = data?.markets || (Array.isArray(data) ? data : []);
  return markets
    .filter(m => m.title && m.yes_bid_dollars != null)
    .map(m => {
      const raw = Number(m.yes_bid_dollars);
      const yesPct = Math.round(raw <= 1 ? raw * 100 : raw);
      return {
        title: (m.title || '').substring(0, 80),
        yesPct,
        volume24h: (m.volume_24h_fp || 0) / 100,
        endDate: m.close_time || null,
        url: m.ticker ? `https://kalshi.com/markets/${m.ticker}` : null,
        source: 'KX',
      };
    })
    .filter(m => m.yesPct >= 1 && m.yesPct <= 99 && m.volume24h > 0)
    .sort((a, b) => b.volume24h - a.volume24h)
    .slice(0, 10);
}

export async function briefing() {
  const [polymarket, kalshi] = await Promise.allSettled([fetchPolymarket(), fetchKalshi()]);

  const pm = polymarket.status === 'fulfilled' ? polymarket.value : [];
  const kx = kalshi.status === 'fulfilled' ? kalshi.value : [];

  const all = [...pm, ...kx];
  const signals = all
    .filter(m => m.yesPct >= 90 || m.yesPct <= 10)
    .sort((a, b) => b.volume24h - a.volume24h)
    .slice(0, 3)
    .map(m => `[${m.source}] ${m.title.substring(0, 60)} — ${m.yesPct}% YES (${fmtVol(m.volume24h)} 24h vol)`);

  return {
    source: 'Prediction Markets',
    timestamp: new Date().toISOString(),
    polymarket: pm,
    kalshi: kx,
    signals,
  };
}

// CLI test: node apis/sources/prediction.mjs
if (process.argv[1]?.endsWith('prediction.mjs')) {
  const result = await briefing();
  console.log(JSON.stringify(result, null, 2));
}
