import 'react-native-get-random-values';
import { registerRootComponent } from 'expo';
import { initializeObservability } from './src/services/observability';

// Initialize native/JavaScript crash capture before evaluating the React app
// and its provider graph. App.js repeats this idempotent call so direct test
// and development imports preserve the same guarantee.
initializeObservability();
const App = require('./App').default;

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
