// @ts-nocheck
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { api_base } from '@/external/bot-skeleton';
import { localize } from '@deriv-com/translations';
import './analysis-tool.scss';

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const DEFAULT_SYMBOL = 'R_10';
const RECENT_COUNT = 20;

const getDecimals = (symbol: string) => {
    const pip_size = api_base?.pip_sizes?.[symbol];
    if (pip_size === undefined || pip_size === null) return 2;
    // pip_sizes may be either the decimal place count (e.g. 2) or the
    // pip increment itself (e.g. 0.01) — handle both shapes safely.
    if (Number.isInteger(pip_size) && pip_size >= 0 && pip_size <= 6) {
        return pip_size;
    }
    const str = String(pip_size);
    const idx = str.indexOf('.');
    return idx === -1 ? 0 : str.length - idx - 1;
};

const getLastDigit = (quote: number, decimals: number) => {
    const fixed = Number(quote).toFixed(decimals);
    return Number(fixed.slice(-1));
};

const Segment = ({ label, value, count, percent, color }) => (
    <div className='analysis-tool__stat-card'>
        <div className='analysis-tool__stat-label'>{label}</div>
        <div className='analysis-tool__stat-value'>
            {count} <span className='analysis-tool__stat-percent'>({percent}%)</span>
        </div>
        <div className='analysis-tool__bar-track'>
            <div className='analysis-tool__bar-fill' style={{ width: `${percent}%`, background: color }} />
        </div>
    </div>
);

const RecentStrip = ({ items, colorFn }) => (
    <div className='analysis-tool__recent-strip'>
        {items.map((item, i) => (
            <span key={i} className='analysis-tool__pill' style={{ background: colorFn(item) }}>
                {item.label}
            </span>
        ))}
    </div>
);

const AnalysisTool = observer(() => {
    const [symbols, setSymbols] = useState<{ symbol: string; display_name: string }[]>([]);
    const [selected_symbol, setSelectedSymbol] = useState(DEFAULT_SYMBOL);
    const [ticks_window, setTicksWindow] = useState(1000);
    const [ticks_window_input, setTicksWindowInput] = useState('1000');
    const [prices, setPrices] = useState<number[]>([]);
    const [over_under_threshold, setOverUnderThreshold] = useState(5);
    const [predicted_digit, setPredictedDigit] = useState(0);
    const [is_loading, setIsLoading] = useState(false);

    const subscription_id_ref = useRef<string | null>(null);
    const message_subscription_ref = useRef<any>(null);

    // Load available synthetic index symbols
    useEffect(() => {
        const active = api_base?.active_symbols || [];
        const synthetics = active
            .filter((s: any) => s.market === 'synthetic_index')
            .map((s: any) => ({
                symbol: s.underlying_symbol || s.symbol,
                display_name: s.display_name || s.underlying_symbol || s.symbol,
            }));
        if (synthetics.length) {
            setSymbols(synthetics);
            if (!synthetics.find(s => s.symbol === selected_symbol)) {
                setSelectedSymbol(synthetics[0].symbol);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const unsubscribe = async () => {
        if (subscription_id_ref.current && api_base?.api) {
            try {
                await api_base.api.forget(subscription_id_ref.current);
            } catch (e) {
                // ignore forget errors
            }
            subscription_id_ref.current = null;
        }
    };

    const subscribe = async (symbol: string, count: number) => {
        if (!api_base?.api) return;
        setIsLoading(true);
        await unsubscribe();
        try {
            const response = await api_base.api.send({
                ticks_history: symbol,
                adjust_start_time: 1,
                count,
                end: 'latest',
                style: 'ticks',
                subscribe: 1,
            });
            if (response?.subscription?.id) {
                subscription_id_ref.current = response.subscription.id;
            }
            if (response?.history?.prices) {
                setPrices(response.history.prices.map(Number));
            }
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error('Analysis Tool subscribe error', e);
        } finally {
            setIsLoading(false);
        }
    };

    // (Re)subscribe when symbol or window size changes
    useEffect(() => {
        if (!selected_symbol) return undefined;
        subscribe(selected_symbol, ticks_window);
        return () => {
            unsubscribe();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selected_symbol, ticks_window]);

    // Listen for live tick updates
    useEffect(() => {
        if (!api_base?.api) return undefined;
        const sub = api_base.api.onMessage().subscribe(({ data }: any) => {
            if (data?.msg_type === 'tick' && data.tick?.symbol === selected_symbol) {
                setPrices(prev => {
                    const next = [...prev, Number(data.tick.quote)];
                    if (next.length > ticks_window) next.shift();
                    return next;
                });
            }
        });
        message_subscription_ref.current = sub;
        return () => sub.unsubscribe();
    }, [selected_symbol, ticks_window]);

    useEffect(() => () => unsubscribe(), []);

    const decimals = getDecimals(selected_symbol);
    const digits = useMemo(() => prices.map(p => getLastDigit(p, decimals)), [prices, decimals]);
    const current_digit = digits.length ? digits[digits.length - 1] : null;
    const last_price = prices.length ? prices[prices.length - 1] : null;

    const distribution = useMemo(() => {
        const counts = DIGITS.map(() => 0);
        digits.forEach(d => counts[d]++);
        const total = digits.length || 1;
        return DIGITS.map(d => ({
            digit: d,
            count: counts[d],
            percent: ((counts[d] / total) * 100).toFixed(1),
        }));
    }, [digits]);

    const most_frequent = useMemo(() => {
        if (!distribution.length) return null;
        return distribution.reduce((a, b) => (b.count > a.count ? b : a));
    }, [distribution]);

    const least_frequent = useMemo(() => {
        if (!distribution.length) return null;
        return distribution.reduce((a, b) => (b.count < a.count ? b : a));
    }, [distribution]);

    const even_odd = useMemo(() => {
        const total = digits.length || 1;
        const even = digits.filter(d => d % 2 === 0).length;
        const odd = total - (digits.length ? even : 0);
        return {
            even,
            odd: digits.length - even,
            even_pct: ((even / total) * 100).toFixed(1),
            odd_pct: (((digits.length - even) / total) * 100).toFixed(1),
        };
    }, [digits]);

    const over_under = useMemo(() => {
        const total = digits.length || 1;
        let under = 0;
        let equal = 0;
        let over = 0;
        digits.forEach(d => {
            if (d < over_under_threshold) under++;
            else if (d === over_under_threshold) equal++;
            else over++;
        });
        return {
            under,
            equal,
            over,
            under_pct: ((under / total) * 100).toFixed(1),
            equal_pct: ((equal / total) * 100).toFixed(1),
            over_pct: ((over / total) * 100).toFixed(1),
        };
    }, [digits, over_under_threshold]);

    const matches_differs = useMemo(() => {
        const total = digits.length || 1;
        const matches = digits.filter(d => d === predicted_digit).length;
        return {
            matches,
            differs: digits.length - matches,
            matches_pct: ((matches / total) * 100).toFixed(1),
            differs_pct: (((digits.length - matches) / total) * 100).toFixed(1),
        };
    }, [digits, predicted_digit]);

    const recent = (n: number) => digits.slice(-n);

    const recent_even_odd = recent(RECENT_COUNT).map(d => ({
        label: d % 2 === 0 ? 'E' : 'O',
    }));
    const recent_under_equal_over = recent(RECENT_COUNT).map(d => ({
        label: d < over_under_threshold ? 'U' : d === over_under_threshold ? '=' : 'O',
    }));
    const recent_matches_differs = recent(RECENT_COUNT).map(d => ({
        label: d === predicted_digit ? 'M' : 'D',
    }));

    const colorForEO = (item: any) => (item.label === 'E' ? '#2ecc71' : '#e74c3c');
    const colorForUEO = (item: any) =>
        item.label === 'U' ? '#2ecc71' : item.label === '=' ? '#7f8c8d' : '#e74c3c';
    const colorForMD = (item: any) => (item.label === 'M' ? '#2ecc71' : '#e74c3c');

    return (
        <div className='analysis-tool'>
            <div className='analysis-tool__controls'>
                <label className='analysis-tool__label'>{localize('Select Market:')}</label>
                <select
                    className='analysis-tool__select'
                    value={selected_symbol}
                    onChange={e => setSelectedSymbol(e.target.value)}
                >
                    {symbols.length === 0 && <option value={DEFAULT_SYMBOL}>{DEFAULT_SYMBOL}</option>}
                    {symbols.map(s => (
                        <option key={s.symbol} value={s.symbol}>
                            {s.display_name}
                        </option>
                    ))}
                </select>

                <div className='analysis-tool__price-row'>
                    <span className='analysis-tool__price'>
                        {last_price !== null ? Number(last_price).toFixed(decimals) : '—'}
                    </span>
                    <span className='analysis-tool__current-digit'>{current_digit ?? '—'}</span>
                </div>
            </div>

            <div className='analysis-tool__controls'>
                <label className='analysis-tool__label'>{localize('Ticks window:')}</label>
                <input
                    className='analysis-tool__input'
                    type='number'
                    min={50}
                    max={5000}
                    value={ticks_window_input}
                    onChange={e => setTicksWindowInput(e.target.value)}
                    onBlur={() => {
                        const val = Math.min(5000, Math.max(50, Number(ticks_window_input) || 1000));
                        setTicksWindowInput(String(val));
                        setTicksWindow(val);
                    }}
                />
                <span className='analysis-tool__hint'>(50–5000)</span>
            </div>

            {is_loading && <div className='analysis-tool__loading'>{localize('Loading ticks...')}</div>}

            <div className='analysis-tool__section'>
                <div className='analysis-tool__section-title'>
                    {localize('Last {{n}} ticks digit distribution', { n: digits.length })}
                </div>
                <div className='analysis-tool__digits-row'>
                    {distribution.map(d => (
                        <div key={d.digit} className='analysis-tool__digit-wrap'>
                            {d.digit === current_digit && (
                                <div className='analysis-tool__cursor' aria-hidden='true'>
                                    ▼
                                </div>
                            )}
                            <div
                                className={
                                    'analysis-tool__digit-circle' +
                                    (d.digit === current_digit ? ' analysis-tool__digit-circle--current' : '') +
                                    (most_frequent && d.digit === most_frequent.digit
                                        ? ' analysis-tool__digit-circle--most'
                                        : '') +
                                    (least_frequent && d.digit === least_frequent.digit
                                        ? ' analysis-tool__digit-circle--least'
                                        : '')
                                }
                            >
                                <div className='analysis-tool__digit-value'>{d.digit}</div>
                                <div className='analysis-tool__digit-percent'>{d.percent}%</div>
                            </div>
                        </div>
                    ))}
                </div>
                <div className='analysis-tool__legend'>
                    {localize('current digit / most / least frequency')}
                </div>
            </div>

            <div className='analysis-tool__divider' />

            <div className='analysis-tool__section'>
                <div className='analysis-tool__section-title'>{localize('Even/Odd')}</div>
                <div className='analysis-tool__cards-row'>
                    <Segment
                        label={localize('Even')}
                        count={even_odd.even}
                        percent={even_odd.even_pct}
                        color='#2ecc71'
                    />
                    <Segment label={localize('Odd')} count={even_odd.odd} percent={even_odd.odd_pct} color='#e74c3c' />
                </div>
                <div className='analysis-tool__recent-label'>{localize('Recent E/O')}</div>
                <RecentStrip items={recent_even_odd} colorFn={colorForEO} />
            </div>

            <div className='analysis-tool__divider' />

            <div className='analysis-tool__section'>
                <div className='analysis-tool__section-title-row'>
                    <span>{localize('Over/Under:')}</span>
                    <select
                        className='analysis-tool__select analysis-tool__select--small'
                        value={over_under_threshold}
                        onChange={e => setOverUnderThreshold(Number(e.target.value))}
                    >
                        {DIGITS.map(d => (
                            <option key={d} value={d}>
                                {d}
                            </option>
                        ))}
                    </select>
                </div>
                <div className='analysis-tool__cards-row analysis-tool__cards-row--three'>
                    <Segment
                        label={localize('Under')}
                        count={over_under.under}
                        percent={over_under.under_pct}
                        color='#2ecc71'
                    />
                    <Segment
                        label={localize('Equal')}
                        count={over_under.equal}
                        percent={over_under.equal_pct}
                        color='#7f8c8d'
                    />
                    <Segment
                        label={localize('Over')}
                        count={over_under.over}
                        percent={over_under.over_pct}
                        color='#e74c3c'
                    />
                </div>
                <div className='analysis-tool__recent-label'>{localize('Recent U/=/O')}</div>
                <RecentStrip items={recent_under_equal_over} colorFn={colorForUEO} />
            </div>

            <div className='analysis-tool__divider' />

            <div className='analysis-tool__section'>
                <div className='analysis-tool__section-title-row'>
                    <span>{localize('Matches/Differs — predicted digit:')}</span>
                    <select
                        className='analysis-tool__select analysis-tool__select--small'
                        value={predicted_digit}
                        onChange={e => setPredictedDigit(Number(e.target.value))}
                    >
                        {DIGITS.map(d => (
                            <option key={d} value={d}>
                                {d}
                            </option>
                        ))}
                    </select>
                </div>
                <div className='analysis-tool__cards-row'>
                    <Segment
                        label={localize('Matches')}
                        count={matches_differs.matches}
                        percent={matches_differs.matches_pct}
                        color='#2ecc71'
                    />
                    <Segment
                        label={localize('Differs')}
                        count={matches_differs.differs}
                        percent={matches_differs.differs_pct}
                        color='#e74c3c'
                    />
                </div>
                <div className='analysis-tool__recent-label'>{localize('Recent M/D')}</div>
                <RecentStrip items={recent_matches_differs} colorFn={colorForMD} />
            </div>
        </div>
    );
});

export default AnalysisTool;
