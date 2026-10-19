// A minimal stack navigator on the real StackRouter and useNavigationBuilder, so screens
// get real usePreventRemove / beforeRemove / replace semantics without react-native-screens.
// It renders only the focused route. Native-only behaviour (iOS swipe → preventNativeDismiss)
// is a device check, not covered here.
import React from 'react';
import { render } from '@testing-library/react-native';
import { AllProviders } from './renderWithProviders';
import {
  NavigationContainer,
  StackRouter,
  createNavigationContainerRef,
  createNavigatorFactory,
  useNavigationBuilder,
} from '@react-navigation/native';
import { MotionProvider } from '../src/context/MotionContext';

function TestStackNavigator({ id, initialRouteName, children, screenOptions }) {
  const { state, descriptors, NavigationContent } = useNavigationBuilder(StackRouter, {
    id, initialRouteName, children, screenOptions,
  });
  return <NavigationContent>{descriptors[state.routes[state.index].key].render()}</NavigationContent>;
}
const createTestStack = createNavigatorFactory(TestStackNavigator);

export function renderInTestStack({
  routes,
  initialIndex = routes.length - 1,
  motion = { motionLevel: 'full', reduceMotion: false, tier: 'high' },
  wrapper: Wrapper = AllProviders,
}) {
  const Stack = createTestStack();
  const navigationRef = createNavigationContainerRef();
  // Every route is registered as a screen; only routes[0..initialIndex] start on the stack.
  const initialState = {
    index: initialIndex,
    routes: routes.slice(0, initialIndex + 1).map(({ name, params }) => ({ name, params })),
  };
  const screen = render(
    <Wrapper>
      {/* Wrapper owns the root Paper host. A nested host would put sheets inside
          the accessibility-hidden app background. */}
      <MotionProvider value={motion}>
        <NavigationContainer ref={navigationRef} initialState={initialState}>
          <Stack.Navigator>
            {routes.map(({ name, component }) => <Stack.Screen key={name} name={name} component={component} />)}
          </Stack.Navigator>
        </NavigationContainer>
      </MotionProvider>
    </Wrapper>,
  );
  return { ...screen, navigationRef, routeNames: () => navigationRef.getRootState().routes.map((r) => r.name) };
}
