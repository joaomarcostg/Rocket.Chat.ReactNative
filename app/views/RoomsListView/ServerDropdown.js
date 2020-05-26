import React, { Component } from 'react';
import {
	View, Text, Animated, Easing, TouchableWithoutFeedback, TouchableOpacity, FlatList, Image
} from 'react-native';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import equal from 'deep-equal';
import RNUserDefaults from 'rn-user-defaults';

import { toggleServerDropdown as toggleServerDropdownAction } from '../../actions/rooms';
import { selectServerRequest as selectServerRequestAction } from '../../actions/server';
import { appStart as appStartAction, ROOT_NEW_SERVER } from '../../actions/app';
import styles from './styles';
import Touch from '../../utils/touch';
import RocketChat from '../../lib/rocketchat';
import I18n from '../../i18n';
import EventEmitter from '../../utils/events';
import Check from '../../containers/Check';
import database from '../../lib/database';
import { themes } from '../../constants/colors';
import { withTheme } from '../../theme';
import { KEY_COMMAND, handleCommandSelectServer } from '../../commands';
import { isTablet } from '../../utils/deviceInfo';
import { withSplit } from '../../split';
import { localAuthenticate } from '../../utils/localAuthentication';
import { showConfirmationAlert } from '../../utils/info';
import LongPress from '../../utils/longPress';

const ROW_HEIGHT = 68;
const ANIMATION_DURATION = 200;

class ServerDropdown extends Component {
	static propTypes = {
		navigation: PropTypes.object,
		closeServerDropdown: PropTypes.bool,
		split: PropTypes.bool,
		server: PropTypes.string,
		theme: PropTypes.string,
		appStart: PropTypes.func,
		toggleServerDropdown: PropTypes.func,
		selectServerRequest: PropTypes.func
	}

	constructor(props) {
		super(props);
		this.state = { servers: [] };
		this.animatedValue = new Animated.Value(0);
	}

	async componentDidMount() {
		const serversDB = database.servers;
		const observable = await serversDB.collections
			.get('servers')
			.query()
			.observeWithColumns(['name']);

		this.subscription = observable.subscribe((data) => {
			this.setState({ servers: data });
		});

		Animated.timing(
			this.animatedValue,
			{
				toValue: 1,
				duration: ANIMATION_DURATION,
				easing: Easing.inOut(Easing.quad),
				useNativeDriver: true
			}
		).start();
		if (isTablet) {
			EventEmitter.addEventListener(KEY_COMMAND, this.handleCommands);
		}
	}

	shouldComponentUpdate(nextProps, nextState) {
		const { servers } = this.state;
		const { closeServerDropdown, server, theme } = this.props;
		if (nextProps.theme !== theme) {
			return true;
		}
		if (nextProps.closeServerDropdown !== closeServerDropdown) {
			return true;
		}
		if (nextProps.server !== server) {
			return true;
		}
		if (!equal(nextState.servers, servers)) {
			return true;
		}
		return false;
	}

	componentDidUpdate(prevProps) {
		const { closeServerDropdown } = this.props;
		if (prevProps.closeServerDropdown !== closeServerDropdown) {
			this.close();
		}
	}

	componentWillUnmount() {
		if (this.newServerTimeout) {
			clearTimeout(this.newServerTimeout);
			this.newServerTimeout = false;
		}
		if (this.subscription && this.subscription.unsubscribe) {
			this.subscription.unsubscribe();
		}
		if (isTablet) {
			EventEmitter.removeListener(KEY_COMMAND, this.handleCommands);
		}
	}

	close = () => {
		const { toggleServerDropdown } = this.props;
		Animated.timing(
			this.animatedValue,
			{
				toValue: 0,
				duration: ANIMATION_DURATION,
				easing: Easing.inOut(Easing.quad),
				useNativeDriver: true
			}
		).start(() => toggleServerDropdown());
	}

	addServer = () => {
		const { server, appStart } = this.props;

		this.close();
		setTimeout(() => {
			appStart({ root: ROOT_NEW_SERVER, previousServer: server });
		}, ANIMATION_DURATION);
	}

	select = async(server) => {
		const {
			server: currentServer, selectServerRequest, navigation, split, appStart
		} = this.props;
		this.close();
		if (currentServer !== server) {
			const userId = await RNUserDefaults.get(`${ RocketChat.TOKEN_KEY }-${ server }`);
			if (split) {
				navigation.navigate('RoomView');
			}
			if (!userId) {
				setTimeout(() => {
					appStart({ root: ROOT_NEW_SERVER, previousServer: server });
					this.newServerTimeout = setTimeout(() => {
						EventEmitter.emit('NewServer', { server });
					}, ANIMATION_DURATION);
				}, ANIMATION_DURATION);
			} else {
				await localAuthenticate(server);
				selectServerRequest(server);
			}
		}
	}

	remove = server => showConfirmationAlert({
		message: I18n.t('This_will_remove_all_data_from_this_server'),
		callToAction: I18n.t('Delete'),
		onPress: async() => {
			this.close();
			try {
				await RocketChat.removeServer({ server });
			} catch {
				// do nothing
			}
		}
	});

	handleCommands = ({ event }) => {
		const { servers } = this.state;
		const { navigation } = this.props;
		const { input } = event;
		if (handleCommandSelectServer(event)) {
			if (servers[input - 1]) {
				this.select(servers[input - 1].id);
				navigation.navigate('RoomView');
			}
		}
	}

	renderSeparator = () => {
		const { theme } = this.props;
		return <View style={[styles.serverSeparator, { backgroundColor: themes[theme].separatorColor }]} />;
	}

	renderServer = ({ item }) => {
		const { server, theme } = this.props;

		return (
			<LongPress onLongPress={() => (item.id === server || this.remove(item.id))}>
				<Touch
					onPress={() => this.select(item.id)}
					testID={`rooms-list-header-server-${ item.id }`}
					theme={theme}
				>
					<View style={styles.serverItemContainer}>
						{item.iconURL
							? (
								<Image
									source={{ uri: item.iconURL }}
									defaultSource={{ uri: 'logo' }}
									style={styles.serverIcon}
									onError={() => console.warn('error loading serverIcon')}
								/>
							)
							: (
								<Image
									source={{ uri: 'logo' }}
									style={styles.serverIcon}
								/>
							)
						}
						<View style={styles.serverTextContainer}>
							<Text style={[styles.serverName, { color: themes[theme].titleText }]} numberOfLines={1}>{item.name || item.id}</Text>
							<Text style={[styles.serverUrl, { color: themes[theme].auxiliaryText }]} numberOfLines={1}>{item.id}</Text>
						</View>
						{item.id === server ? <Check theme={theme} /> : null}
					</View>
				</Touch>
			</LongPress>
		);
	}

	render() {
		const { servers } = this.state;
		const { theme } = this.props;
		const maxRows = 4;
		const initialTop = 41 + (Math.min(servers.length, maxRows) * ROW_HEIGHT);
		const translateY = this.animatedValue.interpolate({
			inputRange: [0, 1],
			outputRange: [-initialTop, 0]
		});
		const backdropOpacity = this.animatedValue.interpolate({
			inputRange: [0, 1],
			outputRange: [0, 0.6]
		});
		return (
			<>
				<TouchableWithoutFeedback onPress={this.close}>
					<Animated.View style={[styles.backdrop, { backgroundColor: themes[theme].backdropColor, opacity: backdropOpacity }]} />
				</TouchableWithoutFeedback>
				<Animated.View
					style={[
						styles.dropdownContainer,
						{
							transform: [{ translateY }],
							backgroundColor: themes[theme].backgroundColor,
							borderColor: themes[theme].separatorColor
						}
					]}
					testID='rooms-list-header-server-dropdown'
				>
					<View
						style={[
							styles.dropdownContainerHeader,
							styles.serverHeader,
							{ borderColor: themes[theme].separatorColor }
						]}
					>
						<Text style={[styles.serverHeaderText, { color: themes[theme].auxiliaryText }]}>{I18n.t('Server')}</Text>
						<TouchableOpacity onPress={this.addServer} testID='rooms-list-header-server-add'>
							<Text style={[styles.serverHeaderAdd, { color: themes[theme].tintColor }]}>{I18n.t('Add_Server')}</Text>
						</TouchableOpacity>
					</View>
					<FlatList
						style={{ maxHeight: maxRows * ROW_HEIGHT }}
						data={servers}
						keyExtractor={item => item.id}
						renderItem={this.renderServer}
						ItemSeparatorComponent={this.renderSeparator}
						keyboardShouldPersistTaps='always'
					/>
				</Animated.View>
			</>
		);
	}
}

const mapStateToProps = state => ({
	closeServerDropdown: state.rooms.closeServerDropdown,
	server: state.server.server
});

const mapDispatchToProps = dispatch => ({
	toggleServerDropdown: () => dispatch(toggleServerDropdownAction()),
	selectServerRequest: server => dispatch(selectServerRequestAction(server)),
	appStart: params => dispatch(appStartAction(params))
});

export default connect(mapStateToProps, mapDispatchToProps)(withTheme(withSplit(ServerDropdown)));
