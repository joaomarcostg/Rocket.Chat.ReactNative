import React from 'react';
import { StyleSheet } from 'react-native';
import PropTypes from 'prop-types';
import { SafeAreaView as SafeAreaContext } from 'react-native-safe-area-context';
import { themes } from '../constants/colors';

const styles = StyleSheet.create({
	view: {
		flex: 1
	},
	vertical: {
		paddingTop: 0,
		paddingBottom: 0
	}
});

const SafeAreaView = React.memo(({
	style, children, testID, theme, vertical = true, ...props
}) => (
	<SafeAreaContext
		style={[styles.view, vertical && styles.vertical, { backgroundColor: themes[theme].auxiliaryBackground }, style]}
		testID={testID}
		{...props}
	>
		{children}
	</SafeAreaContext>
));

SafeAreaView.propTypes = {
	testID: PropTypes.string,
	theme: PropTypes.string,
	vertical: PropTypes.bool,
	style: PropTypes.object,
	children: PropTypes.element
};

export default SafeAreaView;