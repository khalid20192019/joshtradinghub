import React, { useEffect, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Localize } from '@deriv-com/translations';
import './analysis-tool.scss';

type TMarket = {
    symbol: string;
    display_name: string;
    decimals: number;
};

// The 5 classic volatility indices — long-standing, stable symbol codes (unlike the newer
// 1-second variants, whose codes have changed over time and caused "invalid symbol" errors).
const MARKETS: TMarket[] = [
    { symbol: 'R_10', display_name: 'Volatility 10 Index', decimals: 3 },
    { symbol: 'R_25', display_name: 'Volatility 25 Index', decimals: 3 },
    { symbol: 'R_50', display_name: 'Volatility 50 Index', decimals: 4 },
    { symbol: 'R_75', display_name: 'Volatility 75 Index', decimals: 4 },
    { symbol: 'R_100', display_name: 'Volatility 100 Index', decimals: 2 },
];

const APP_ID = 1089; // Deriv's public demo app_id, used for read-only market data.

const getLastDigit = (price: number, decimals: number): number => {
    const fixed = price.toFixed(decimals);
    return Number(fixed[fixed.length - 1]);
};

const AnalysisTool = observer(() => {
    const [selected_symbol, setSelectedSymbol] = useState('R_75');
    const [ticks_window, setTicksWindow] = useState(1000);
    const [ticks_window_input, setTicksWindowInput] = useState('1000');
    const [current_price, setCurrentPrice] = useState<number | null>(null);
    const [digits, setDigits] = useState<number[]>([]);
    const [over_under_barrier, setOverUnderBarrier] = useState(5);
    const [target_digit, setTargetDigit] = useState(0);
    const reconnect_timeout_ref = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [reconnect_tick, setReconnect_tick] = useState(0);
    const [connection_status, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>(
        'connecting'
    );
    const [api_error, setApiError] = useState<string | null>(null);

    const market = MARKETS.find(m => m.symbol === selected_symbol) || MARKETS[0];

    useEffect(() => {
        let is_cancelled = false;
        setDigits([]);
        setCurrentPrice(null);
        setConnectionStatus('connecting');
        setApiError(null);

        const ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`);

        ws.onopen = () => {
            setConnectionStatus('connected');
            ws.send(
                JSON.stringify({
                    ticks_history: selected_symbol,
                    adjust_start_time: 1,
                    count: ticks_window,
                    end: 'latest',
                    start: 1,
                    style: 'ticks',
                    subscribe: 1,
                })
            );
        };

        ws.onmessage = event => {
            if (is_cancelled) return;
            const data = JSON.parse(event.data);

            if (data.error) {
                setApiError(data.error.message || 'Unknown API error');
                return;
            }

            if (data.msg_type === 'history' && data.history) {
                const prices: number[] = data.history.prices.map((p: string | number) => Number(p));
                const last_digits = prices.map(p => getLastDigit(p, market.decimals));
                setDigits(last_digits);
                setCurrentPrice(prices[prices.length - 1]);
            }

            if (data.msg_type === 'tick' && data.tick) {
                const price = Number(data.tick.quote);
                const digit = getLastDigit(price, market.decimals);
                setCurrentPrice(price);
                setDigits(prev => {
                    const next = [...prev, digit];
                    if (next.length > ticks_window) next.shift();
                    return next;
                });
            }
        };

        ws.onerror = () => {
            // Handled via onclose below.
        };

        const ping_interval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ ping: 1 }));
            }
        }, 20000);

        ws.onclose = () => {
            clearInterval(ping_interval);
            setConnectionStatus('disconnected');
            if (!is_cancelled) {
                reconnect_timeout_ref.current = setTimeout(() => {
                    setReconnect_tick(tick => tick + 1);
                }, 3000);
            }
        };

        return () => {
            is_cancelled = true;
            clearInterval(ping_interval);
            if (reconnect_timeout_ref.current) clearTimeout(reconnect_timeout_ref.current);
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ forget_all: 'ticks' }));
            }
            ws.close();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selected_symbol, ticks_window, reconnect_tick]);

    const stats = useMemo(() => {
        const total = digits.length;
        const digit_counts = Array(10).fill(0);
        digits.forEach(d => digit_counts[d]++);

        const even_count = digits.filter(d => d % 2 === 0).length;
        const odd_count = total - even_count;

        const over_count = digits.filter(d => d > over_under_barrier).length;
        const under_count = digits.filter(d => d < over_under_barrier).length;
        const equal_count = total - over_count - under_count;

        const matches_count = digits.filter(d => d === target_digit).length;
        const differs_count = total - matches_count;

        return {
            total,
            digit_counts,
            even_count,
            odd_count,
            over_count,
            under_count,
            equal_count,
            matches_count,
            differs_count,
        };
    }, [digits, over_under_barrier, target_digit]);

    const pct = (count: number) => (stats.total ? ((count / stats.total) * 100).toFixed(1) : '0.0');

    const most_frequent_digit = stats.digit_counts.indexOf(Math.max(...stats.digit_counts));
    const least_frequent_digit = stats.digit_counts.indexOf(Math.min(...stats.digit_counts));

    const handleTicksWindowBlur = () => {
        let value = parseInt(ticks_window_input, 10);
        if (Number.isNaN(value)) value = 1000;
        value = Math.min(5000, Math.max(50, value));
        setTicksWindowInput(String(value));
        setTicksWindow(value);
    };

    const recent_digits = digits.slice(-60);

    return (
        <div className='analysis-tool'>
            <h2>
                <Localize i18n_default_text='Analysis Tool' />
            </h2>

            {api_error && <div className='analysis-tool__error'>⚠ {api_error}</div>}

            <div className='analysis-tool__field'>
                <label>
                    <Localize i18n_default_text='Select Market:' />
                </label>
                <select value={selected_symbol} onChange={e => setSelectedSymbol(e.target.value)}>
                    {MARKETS.map(m => (
                        <option key={m.symbol} value={m.symbol}>
                            {m.display_name}
                        </option>
                    ))}
                </select>
            </div>

            <div className='analysis-tool__price'>
                <span>{current_price !== null ? current_price.toFixed(market.decimals) : '—'}</span>
                <span className={`analysis-tool__status analysis-tool__status--${connection_status}`}>
                    {connection_status === 'connected' && <Localize i18n_default_text='Live' />}
                    {connection_status === 'connecting' && <Localize i18n_default_text='Connecting…' />}
                    {connection_status === 'disconnected' && <Localize i18n_default_text='Reconnecting…' />}
                </span>
                <span className='analysis-tool__price-count'>{stats.total}</span>
            </div>

            <div className='analysis-tool__field'>
                <label>
                    <Localize i18n_default_text='Ticks window:' />
                </label>
                <input
                    type='number'
                    value={ticks_window_input}
                    onChange={e => setTicksWindowInput(e.target.value)}
                    onBlur={handleTicksWindowBlur}
                />
                <span className='analysis-tool__hint'>(50–5000)</span>
            </div>

            <div className='analysis-tool__section-title'>
                <Localize
                    i18n_default_text='Last {{count}} ticks digit distribution'
                    values={{ count: stats.total }}
                />
            </div>
            <div className='analysis-tool__digits'>
                {stats.digit_counts.map((count, digit) => (
                    <div key={digit} className={classNamesForDigit(digit, most_frequent_digit, least_frequent_digit)}>
                        <span className='analysis-tool__digit-value'>{digit}</span>
                        <span className='analysis-tool__digit-pct'>{pct(count)}%</span>
                    </div>
                ))}
            </div>

            <div className='analysis-tool__section-title'>
                <Localize i18n_default_text='Even/Odd' />
            </div>
            <div className='analysis-tool__stat-row'>
                <div className='analysis-tool__stat-card'>
                    <p>
                        <Localize i18n_default_text='Even' />
                    </p>
                    <h3>
                        {stats.even_count} <small>({pct(stats.even_count)}%)</small>
                    </h3>
                    <div className='analysis-tool__bar'>
                        <div
                            className='analysis-tool__bar-fill analysis-tool__bar-fill--even'
                            style={{ width: `${pct(stats.even_count)}%` }}
                        />
                    </div>
                </div>
                <div className='analysis-tool__stat-card'>
                    <p>
                        <Localize i18n_default_text='Odd' />
                    </p>
                    <h3>
                        {stats.odd_count} <small>({pct(stats.odd_count)}%)</small>
                    </h3>
                    <div className='analysis-tool__bar'>
                        <div
                            className='analysis-tool__bar-fill analysis-tool__bar-fill--odd'
                            style={{ width: `${pct(stats.odd_count)}%` }}
                        />
                    </div>
                </div>
            </div>

            <div className='analysis-tool__recent'>
                {recent_digits.map((d, i) => (
                    <span
                        key={i}
                        className={
                            d % 2 === 0
                                ? 'analysis-tool__pill analysis-tool__pill--even'
                                : 'analysis-tool__pill analysis-tool__pill--odd'
                        }
                    >
                        {d % 2 === 0 ? 'E' : 'O'}
                    </span>
                ))}
            </div>

            <div className='analysis-tool__section-title analysis-tool__section-title--with-field'>
                <Localize i18n_default_text='Over/Under:' />
                <select value={over_under_barrier} onChange={e => setOverUnderBarrier(Number(e.target.value))}>
                    {Array.from({ length: 10 }, (_, i) => i).map(n => (
                        <option key={n} value={n}>
                            {n}
                        </option>
                    ))}
                </select>
            </div>
            <div className='analysis-tool__stat-row analysis-tool__stat-row--three'>
                <div className='analysis-tool__stat-card'>
                    <p>
                        <Localize i18n_default_text='Under' />
                    </p>
                    <h3>
                        {stats.under_count} <small>({pct(stats.under_count)}%)</small>
                    </h3>
                    <div className='analysis-tool__bar'>
                        <div
                            className='analysis-tool__bar-fill analysis-tool__bar-fill--even'
                            style={{ width: `${pct(stats.under_count)}%` }}
                        />
                    </div>
                </div>
                <div className='analysis-tool__stat-card'>
                    <p>
                        <Localize i18n_default_text='Equal' />
                    </p>
                    <h3>
                        {stats.equal_count} <small>({pct(stats.equal_count)}%)</small>
                    </h3>
                    <div className='analysis-tool__bar'>
                        <div
                            className='analysis-tool__bar-fill analysis-tool__bar-fill--neutral'
                            style={{ width: `${pct(stats.equal_count)}%` }}
                        />
                    </div>
                </div>
                <div className='analysis-tool__stat-card'>
                    <p>
                        <Localize i18n_default_text='Over' />
                    </p>
                    <h3>
                        {stats.over_count} <small>({pct(stats.over_count)}%)</small>
                    </h3>
                    <div className='analysis-tool__bar'>
                        <div
                            className='analysis-tool__bar-fill analysis-tool__bar-fill--odd'
                            style={{ width: `${pct(stats.over_count)}%` }}
                        />
                    </div>
                </div>
            </div>

            <div className='analysis-tool__section-title analysis-tool__section-title--with-field'>
                <Localize i18n_default_text='Matches/Differs — target digit:' />
                <select value={target_digit} onChange={e => setTargetDigit(Number(e.target.value))}>
                    {Array.from({ length: 10 }, (_, i) => i).map(n => (
                        <option key={n} value={n}>
                            {n}
                        </option>
                    ))}
                </select>
            </div>
            <div className='analysis-tool__stat-row'>
                <div className='analysis-tool__stat-card'>
                    <p>
                        <Localize i18n_default_text='Matches' />
                    </p>
                    <h3>
                        {stats.matches_count} <small>({pct(stats.matches_count)}%)</small>
                    </h3>
                    <div className='analysis-tool__bar'>
                        <div
                            className='analysis-tool__bar-fill analysis-tool__bar-fill--even'
                            style={{ width: `${pct(stats.matches_count)}%` }}
                        />
                    </div>
                </div>
                <div className='analysis-tool__stat-card'>
                    <p>
                        <Localize i18n_default_text='Differs' />
                    </p>
                    <h3>
                        {stats.differs_count} <small>({pct(stats.differs_count)}%)</small>
                    </h3>
                    <div className='analysis-tool__bar'>
                        <div
                            className='analysis-tool__bar-fill analysis-tool__bar-fill--odd'
                            style={{ width: `${pct(stats.differs_count)}%` }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
});

function classNamesForDigit(digit: number, most_frequent: number, least_frequent: number): string {
    let cls = 'analysis-tool__digit-circle';
    if (digit === most_frequent) cls += ' analysis-tool__digit-circle--most';
    if (digit === least_frequent) cls += ' analysis-tool__digit-circle--least';
    return cls;
}

export default AnalysisTool;
