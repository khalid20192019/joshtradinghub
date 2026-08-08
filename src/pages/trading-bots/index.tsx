import React from 'react';
import { observer } from 'mobx-react-lite';
import { save_types } from '@/external/bot-skeleton';
import { DBOT_TABS } from '@/constants/bot-contents';
import { useStore } from '@/hooks/useStore';
import { Localize } from '@deriv-com/translations';
import martingale_xml from '@/xml/martingale.xml';
import dalembert_xml from '@/xml/dalembert.xml';
import oscars_grind_xml from '@/xml/oscars_grind.xml';
import './trading-bots.scss';

type TStrategyCard = {
    id: string;
    name: string;
    description: string;
    xml: string;
};

const STRATEGIES: TStrategyCard[] = [
    {
        id: 'martingale',
        name: 'Martingale',
        description: 'Doubles the stake after every loss to recover previous losses.',
        xml: martingale_xml,
    },
    {
        id: 'dalembert',
        name: "D'Alembert",
        description: 'Increases stake by a fixed unit after a loss, decreases after a win.',
        xml: dalembert_xml,
    },
    {
        id: 'oscars-grind',
        name: "Oscar's Grind",
        description: 'A slow, steady staking method aiming for small consistent wins.',
        xml: oscars_grind_xml,
    },
];

const TradingBots = observer(() => {
    const { load_modal, dashboard } = useStore();
    const { loadStrategyToBuilder } = load_modal;
    const { setActiveTab } = dashboard;

    const handleSelectStrategy = async (strategy: TStrategyCard) => {
        await loadStrategyToBuilder(
            {
                id: strategy.id,
                xml: strategy.xml,
                name: strategy.name,
                save_type: save_types.UNSAVED,
            },
            true
        );
        setActiveTab(DBOT_TABS.BOT_BUILDER);
    };

    return (
        <div className='trading-bots'>
            <h2>
                <Localize i18n_default_text='Trading Bots' />
            </h2>
            <p className='trading-bots__subtitle'>
                <Localize i18n_default_text='Pick a ready-made strategy to load it straight into Bot Builder.' />
            </p>
            <div className='trading-bots__grid'>
                {STRATEGIES.map(strategy => (
                    <div key={strategy.id} className='trading-bots__card' onClick={() => handleSelectStrategy(strategy)}>
                        <h3>{strategy.name}</h3>
                        <p>{strategy.description}</p>
                        <span className='trading-bots__card-cta'>
                            <Localize i18n_default_text='Load bot →' />
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
});

export default TradingBots;
