import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import './TRMWidget.css';

interface RateData {
  usdCop: number;
  eurCop: number;
  usdEur: number;
  date: string;
}

interface CacheEntry {
  today: RateData;
  yesterday: RateData;
  fetchedAt: number;
}

const CACHE_KEY = 'bc-trm-cache';
const CACHE_TTL = 60 * 60 * 1000;

async function fetchRates(): Promise<RateData> {
  const res = await fetch('/api/exchange-rates');
  if (!res.ok) throw new Error('fetch failed');
  return res.json() as Promise<RateData>;
}

async function loadRates(): Promise<{ today: RateData; yesterday: RateData }> {
  const raw = sessionStorage.getItem(CACHE_KEY);
  if (raw) {
    const parsed: CacheEntry = JSON.parse(raw);
    if (Date.now() - parsed.fetchedAt < CACHE_TTL) {
      return { today: parsed.today, yesterday: parsed.yesterday };
    }
    // Cache stale: previous becomes "yesterday" for comparison
    const today = await fetchRates();
    const entry: CacheEntry = { today, yesterday: parsed.today, fetchedAt: Date.now() };
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(entry));
    return { today, yesterday: parsed.today };
  }
  const today = await fetchRates();
  const entry: CacheEntry = { today, yesterday: today, fetchedAt: Date.now() };
  sessionStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  return { today, yesterday: today };
}

function diff(current: number, previous: number) {
  if (!previous) return 0;
  return ((current - previous) / previous) * 100;
}

function formatRate(value: number, decimals = 2) {
  return value.toLocaleString('es-CO', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

interface RateCardProps {
  label: string;
  value: number;
  prevValue: number;
  decimals?: number;
  prefix?: string;
}

function RateCard({ label, value, prevValue, decimals = 2, prefix = '' }: RateCardProps) {
  const pct = diff(value, prevValue);
  const up = pct > 0;
  const down = pct < 0;

  return (
    <div className="trm-rate-card">
      <span className="trm-rate-label">{label}</span>
      <span className="trm-rate-value">
        {prefix}{formatRate(value, decimals)}
      </span>
      <div className={`trm-rate-change ${up ? 'up' : down ? 'down' : 'neutral'}`}>
        {up ? <TrendingUp size={13} /> : down ? <TrendingDown size={13} /> : <Minus size={13} />}
        <span>{Math.abs(pct).toFixed(2)}%</span>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="trm-rate-card trm-skeleton">
      <div className="trm-sk-line short" />
      <div className="trm-sk-line long" />
      <div className="trm-sk-line medium" />
    </div>
  );
}

export function TRMWidget() {
  const [today, setToday] = useState<RateData | null>(null);
  const [yesterday, setYesterday] = useState<RateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [spinning, setSpinning] = useState(false);

  const load = useCallback(async (bust = false) => {
    if (bust) sessionStorage.removeItem(CACHE_KEY);
    setLoading(true);
    setError(false);
    try {
      const { today: t, yesterday: y } = await loadRates();
      setToday(t);
      setYesterday(y);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRefresh = async () => {
    setSpinning(true);
    await load(true);
    setTimeout(() => setSpinning(false), 600);
  };

  return (
    <div className="trm-widget">
      <div className="trm-header">
        <div className="trm-title-group">
          <span className="trm-title">TRM &amp; Divisas</span>
          {today && (
            <span className="trm-date">Actualizado {today.date}</span>
          )}
        </div>
        <button
          className={`trm-refresh-btn ${spinning ? 'spinning' : ''}`}
          onClick={handleRefresh}
          title="Actualizar tasas"
          disabled={loading}
        >
          <RefreshCw size={15} />
        </button>
      </div>

      {error ? (
        <div className="trm-error">No se pudieron cargar las tasas. Intenta de nuevo.</div>
      ) : (
        <div className="trm-rates">
          {loading || !today || !yesterday ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : (
            <>
              <RateCard
                label="USD → COP (TRM)"
                value={today.usdCop}
                prevValue={yesterday.usdCop}
                decimals={0}
                prefix="$ "
              />
              <RateCard
                label="EUR → COP"
                value={today.eurCop}
                prevValue={yesterday.eurCop}
                decimals={0}
                prefix="$ "
              />
              <RateCard
                label="USD → EUR"
                value={today.usdEur}
                prevValue={yesterday.usdEur}
                decimals={4}
                prefix="€ "
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
