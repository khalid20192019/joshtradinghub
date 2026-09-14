// @ts-nocheck — new feature, matches existing vendored bot code conventions; see AGENTS.md
import React from 'react';
import { observer } from 'mobx-react-lite';
import { v4 as uuidv4 } from 'uuid';
import { DBOT_TABS } from '@/constants/bot-contents';
import { save_types } from '@/external/bot-skeleton';
import { useStore } from '@/hooks/useStore';
import { localize } from '@deriv-com/translations';
import './trading-bots.scss';

type TBot = {
    id: string;
    name: string;
    category: 'free' | 'store' | 'scalper' | 'speed';
    rating: number;
    description: string;
    file: string;
    is_premium?: boolean;
};

// Bot strategy metadata. Each `file` points to a static .xml asset served from
// the /bots public folder — add new entries here (and drop the matching .xml
// into public/bots/) to add more bots without touching the rest of this file.
const BOT_LIST: TBot[] = [
    {
        id: 'chacky-killer-1',
        name: 'Chacky Killer 1',
        category: 'free',
        rating: 5,
        description: 'Digit-based strategy with configurable stake, stop loss and take profit management.',
        file: '/bots/chacky_killer_1.xml',
    },
    {
        id: 'wantam-vision-x',
        name: 'Wantam Vision X',
        category: 'free',
        rating: 5,
        description: 'Vision-style strategy targeting steady profit with built-in loss protection.',
        file: '/bots/wantam_vision_X.xml',
    },
    {
        id: 'version-killer',
        name: 'Version Killer',
        category: 'free',
        rating: 5,
        description: 'Advanced multi-condition strategy with automated trade-cycle management.',
        file: '/bots/Version_Killer.xml',
    },
];

const CATEGORIES: { id: string; label: string }[] = [
    { id: 'free', label: 'Free Bots' },
    { id: 'store', label: 'Bots Store' },
    { id: 'scalper', label: 'Scalper Bots' },
    { id: 'speed', label: 'SpeedBots' },
];

const Star = ({ filled }: { filled: boolean }) => (
    <svg width='14' height='14' viewBox='0 0 24 24' fill={filled ? '#f1c40f' : 'none'} stroke='#f1c40f' strokeWidth='1.5'>
        <path d='M12 2l2.9 6.3 6.9.6-5.2 4.6 1.6 6.8L12 16.9 5.8 20.3l1.6-6.8L2.2 8.9l6.9-.6L12 2z' />
    </svg>
);

type TTradingBotsProps = {
    handleTabChange?: (tab_index: number) => void;
};

const TradingBots = observer(({ handleTabChange }: TTradingBotsProps) => {
    // Defensive: read via optional chaining so a missing/late-initialised
    // store can never crash this whole tab on mount. If these are
    // undefined when the user taps "Load Bot", we surface a friendly
    // per-card error instead of an app-wide crash.
    const store = useStore();
    const loadStrategyToBuilder = store?.load_modal?.loadStrategyToBuilder;
    const setActiveTab = store?.dashboard?.setActiveTab;

    const [active_category, setActiveCategory] = React.useState<string>('free');
    const [search_term, setSearchTerm] = React.useState('');
    const [loading_bot_id, setLoadingBotId] = React.useState<string | null>(null);
    const [error_bot_id, setErrorBotId] = React.useState<string | null>(null);

    const filtered_bots = BOT_LIST.filter(bot => {
        const matches_category = bot.category === active_category;
        const matches_search = bot.name.toLowerCase().includes(search_term.toLowerCase());
        return matches_category && matches_search;
    });

    // Poll for the Bot Builder's Blockly workspace to exist. It's only
    // created once the Bot Builder tab has mounted, so we must switch to
    // that tab first and wait for it, rather than loading the strategy
    // while still on the Trading Bots tab (which crashes because the
    // workspace doesn't exist yet).
    const waitForWorkspace = (timeout_ms = 8000, interval_ms = 150) =>
        new Promise<boolean>(resolve => {
            const start = Date.now();
            const check = () => {
                if (window?.Blockly?.derivWorkspace) {
                    resolve(true);
                    return;
                }
                if (Date.now() - start >= timeout_ms) {
                    resolve(false);
                    return;
                }
                setTimeout(check, interval_ms);
            };
            check();
        });

    const handleLoadBot = async (bot: TBot) => {
        setLoadingBotId(bot.id);
        setErrorBotId(null);
        try {
            if (!loadStrategyToBuilder || !setActiveTab) {
                throw new Error('Store not ready');
            }

            const response = await fetch(bot.file);
            if (!response.ok) throw new Error(`Failed to fetch ${bot.file}`);
            const xml = await response.text();

            // Switch to Bot Builder FIRST so its Blockly workspace mounts,
            // then wait for it to actually be ready before loading.
            setActiveTab(DBOT_TABS.BOT_BUILDER);
            if (handleTabChange) handleTabChange(DBOT_TABS.BOT_BUILDER);

            const workspace_ready = await waitForWorkspace();
            if (!workspace_ready) {
                throw new Error('Bot Builder workspace did not initialise in time');
            }

            await loadStrategyToBuilder(
                {
                    id: uuidv4(),
                    name: bot.name,
                    xml,
                    save_type: save_types.UNSAVED,
                },
                true
            );
        } catch (error) {
            console.error('Error loading bot:', error);
            setErrorBotId(bot.id);
        } finally {
            setLoadingBotId(null);
        }
    };

    return (
        <div className='trading-bots'>
            <div className='trading-bots__categories'>
                {CATEGORIES.map(cat => (
                    <button
                        key={cat.id}
                        type='button'
                        className={`trading-bots__category ${
                            active_category === cat.id ? 'trading-bots__category--active' : ''
                        }`}
                        onClick={() => setActiveCategory(cat.id)}
                    >
                        {localize(cat.label)}
                    </button>
                ))}
            </div>

            <div className='trading-bots__search'>
                <input
                    type='text'
                    placeholder={localize('Search bots...')}
                    value={search_term}
                    onChange={e => setSearchTerm(e.target.value)}
                />
            </div>

            <div className='trading-bots__list'>
                {filtered_bots.length === 0 && (
                    <div className='trading-bots__empty'>{localize('No bots available in this category yet.')}</div>
                )}
                {filtered_bots.map(bot => (
                    <div key={bot.id} className='trading-bots__card'>
                        <div className='trading-bots__card-header'>
                            <span className='trading-bots__icon'>🤖</span>
                            <h3>{bot.name}</h3>
                            {bot.is_premium && <span className='trading-bots__badge'>{localize('PREMIUM')}</span>}
                        </div>
                        <div className='trading-bots__stars'>
                            {[1, 2, 3, 4, 5].map(n => (
                                <Star key={n} filled={n <= bot.rating} />
                            ))}
                        </div>
                        <p className='trading-bots__description'>{bot.description}</p>
                        {error_bot_id === bot.id && (
                            <p className='trading-bots__error'>
                                {localize('Could not load this bot. Please try again.')}
                            </p>
                        )}
                        <button
                            type='button'
                            className='trading-bots__load-btn'
                            disabled={loading_bot_id === bot.id}
                            onClick={() => handleLoadBot(bot)}
                        >
                            {loading_bot_id === bot.id ? localize('LOADING...') : localize('LOAD BOT')}
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
});

export default TradingBots;
