import React from 'react';
import PropTypes from 'prop-types';
import ErrorComponent from './index';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }

    componentDidCatch = (error, info) => {
        if (window.TrackJS) window.TrackJS.console.log(this.props.root_store);

        this.setState({
            hasError: true,
            error,
            info,
        });
    };

    render = () =>
        this.state.hasError ? (
            <ErrorComponent
                should_show_refresh={true}
                header='An error occurred'
                message={
                    (this.state.error?.message || String(this.state.error)) +
                    '\n\n' +
                    (this.state.error?.stack || '') +
                    '\n\nComponentStack:\n' +
                    (this.state.info?.componentStack || '')
                }
            />
        ) : (
            this.props.children
        );
}

ErrorBoundary.propTypes = {
    root_store: PropTypes.object,
    children: PropTypes.oneOfType([PropTypes.string, PropTypes.arrayOf(PropTypes.node), PropTypes.node]),
};

export default ErrorBoundary;
