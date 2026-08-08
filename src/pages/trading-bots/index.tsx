import React from 'react';
import { observer } from 'mobx-react-lite';
import { Localize } from '@deriv-com/translations';
import './trading-bots.scss';

const TradingBots = observer(() => {
    return (
        <div className='trading-bots'>
            <h2>
                <Localize i18n_default_text='Trading Bots' />
            </h2>
            <p>
                <Localize i18n_default_text='Browse and manage your trading bots here.' />
            </p>
        </div>
    );
});

export default TradingBots;
