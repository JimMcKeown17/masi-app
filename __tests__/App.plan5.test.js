jest.mock('@react-native-community/netinfo',()=>({fetch:jest.fn(async()=>({isConnected:true,type:'wifi'}))}));
jest.mock('expo-file-system/next',()=>{
 class File {constructor(...p){this.uri=p.map(x=>x.uri??x).join('/');}create(){}write(){}get exists(){return true;}delete(){}}
 class Directory {constructor(...p){this.uri=p.map(x=>x.uri??x).join('/');}create(){}}
 return {File,Directory,Paths:{document:'file:///documents',availableDiskSpace:123,totalDiskSpace:456}};
});
import {getDefaultTestHandle} from '../test-support/defaultTestHandle';
import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

const mockUseFonts = jest.fn(() => [true, null]);
jest.mock('expo-font', () => ({ useFonts: (...args) => mockUseFonts(...args) }));
const mockAssessmentThemeProvider = jest.fn(({ children }) => children);
jest.mock('../src/assessment-questions', () => ({
  ...jest.requireActual('../src/assessment-questions'),
  AssessmentThemeProvider: (props) => mockAssessmentThemeProvider(props),
}));
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve()),
  hideAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('../src/utils/logger', () => {
  const actual = jest.requireActual('../src/utils/logger');
  actual.logger.init = jest.fn();
  return actual;
});

const mockInitializeObservability = jest.fn(() => ({ enabled: true }));
const mockCaptureOperationalError = jest.fn();
const mockFlushObservability = jest.fn();
const mockWrapAppWithObservability = jest.fn((component) => component);

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}), { virtual: true });

jest.mock('../src/services/observability', () => ({
  initializeObservability: mockInitializeObservability,
  captureOperationalError: mockCaptureOperationalError,
  flushObservability: mockFlushObservability,
  wrapAppWithObservability: mockWrapAppWithObservability,
}));

jest.mock('react-native-paper', () => {
  const React = require('react');
  return {
    ...jest.requireActual('react-native-paper'),
    PaperProvider: ({ children }) => <>{children}</>,
  };
});

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }) => <>{children}</>,
  SafeAreaView: ({ children }) => <>{children}</>,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('../src/context/AuthContext', () => ({
  AuthProvider: ({ children }) => <>{children}</>,
  useAuth: () => ({ user: null, handle: null, handleStatus: 'signed_out', loading: false }),
}));

jest.mock('../src/context/OfflineContext', () => ({
  OfflineProvider: ({ children }) => <>{children}</>,
}));

jest.mock('../src/context/TimeTrackingContext', () => ({
  TimeTrackingProvider: ({ children }) => <>{children}</>,
}));

jest.mock('../src/context/LookupsContext', () => ({
  LookupsProvider: ({ children }) => <>{children}</>,
}));

jest.mock('../src/context/ChildrenContext', () => ({
  ChildrenProvider: ({ children }) => <>{children}</>,
}));

jest.mock('../src/context/ClassesContext', () => ({
  ClassesProvider: ({ children }) => <>{children}</>,
}));

jest.mock('../src/components/bootstrap/DatabaseBootstrapGate', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return ({ children }) => (
    <>
      <Text>Database bootstrap gate</Text>
      {children}
    </>
  );
});

jest.mock('../src/navigation/AppNavigator', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return () => <Text>Navigator</Text>;
});

describe('App root', () => {
  beforeEach(() => {
    mockUseFonts.mockReturnValue([true, null]);
    mockAssessmentThemeProvider.mockClear();
  });

  it('loads Andika Regular and passes the host font map when fonts load', () => {
    const App = require('../App').default;
    const { Andika_400Regular } = require('@expo-google-fonts/andika/400Regular');
    const { assessmentFonts } = require('../src/constants/assessmentFonts');
    const { fontFamilies } = require('../src/constants/typography');
    expect(assessmentFonts).toEqual({
      content: fontFamilies.content, text: fontFamilies.textMedium,
      textSemi: fontFamilies.textSemi, textBold: fontFamilies.textBold,
    });
    render(<App />);
    expect(mockUseFonts).toHaveBeenLastCalledWith(expect.objectContaining({ Andika_400Regular }));
    expect(mockAssessmentThemeProvider).toHaveBeenLastCalledWith(expect.objectContaining({ fonts: assessmentFonts }));
  });

  it.each([false, true])('passes no family names after a font error, even with loaded=%s', (loaded) => {
    const App = require('../App').default;
    mockUseFonts.mockReturnValue([false, null]);
    const screen = render(<App />);
    expect(mockAssessmentThemeProvider).not.toHaveBeenCalled();
    mockUseFonts.mockReturnValue([loaded, new Error('x')]);
    screen.rerender(<App />);
    expect(mockAssessmentThemeProvider).toHaveBeenLastCalledWith(expect.objectContaining({ fonts: {} }));
    expect(screen.getByText('Navigator')).toBeTruthy();
  });

  it('loads the Figtree semibold face with the app fonts', () => {
    const App = require('../App').default;
    const { Figtree_600SemiBold } = require('@expo-google-fonts/figtree');
    render(<App />);
    expect(mockUseFonts).toHaveBeenLastCalledWith(expect.objectContaining({ Figtree_600SemiBold }));
  });

  it('releases the splash when fonts fail', () => {
    const App = require('../App').default;
    const { hideAsync } = require('expo-splash-screen');
    mockUseFonts.mockReturnValue([false, new Error('x')]);
    hideAsync.mockClear();

    try {
      const { getByText } = render(<App />);

      expect(hideAsync).toHaveBeenCalled();
      expect(getByText('Navigator')).toBeTruthy();
    } finally {
      mockUseFonts.mockReturnValue([true, null]);
    }
  });

  it('renders without legacy bootstrap imports', () => {
    const App = require('../App').default;

    const { getByText } = render(<App />);

    expect(getByText('Database bootstrap gate')).toBeTruthy();
    expect(getByText('Navigator')).toBeTruthy();
  });

  it('initializes observability before render and reports React boundary crashes', () => {
    const { ErrorBoundary } = require('../App');
    const error = new Error('render exploded');
    const boundary = new ErrorBoundary({ children: null });

    boundary.componentDidCatch(error, { componentStack: '\n    at BrokenScreen' });

    expect(mockInitializeObservability).toHaveBeenCalledTimes(1);
    expect(mockCaptureOperationalError).toHaveBeenCalledWith(error, {
      category: 'react_error_boundary',
      context: { componentStack: '\n    at BrokenScreen' },
    });
    expect(mockFlushObservability).toHaveBeenCalled();
    expect(mockWrapAppWithObservability).toHaveBeenCalled();
  });
});

test('a rendered React crash records one durable event and a post-commit bundle for the open handle',async()=>{
 const {ErrorBoundary}=require('../App');const h=getDefaultTestHandle();
 const quiet=jest.spyOn(console,'error').mockImplementation(()=>{});
 const BrokenScreen=()=>{throw new Error('Child 123 failed');};
 try {
  render(<ErrorBoundary><BrokenScreen/></ErrorBoundary>);
  await waitFor(async()=>{
    const rows=await (await h.getReader()).getAllAsync('select * from support_incident_queue');
    expect(rows).toHaveLength(1);expect(rows[0].kind).toBe('app_error_caught');expect(rows[0].bundle_state).toBe('ready');
    expect(JSON.parse(rows[0].payload)).toMatchObject({errorName:'Error',message:'Child 123 failed',messageDigest:expect.any(String),components:expect.arrayContaining(['BrokenScreen'])});
  });
 } finally {quiet.mockRestore();}
});
test('a rendered crash without an open handle keeps operational reporting and the fallback',async()=>{
 const {ErrorBoundary}=require('../App');await require('../src/session/signedInHandle').requestClose({reason:'no handle'});
 const before=mockCaptureOperationalError.mock.calls.length;
 const quiet=jest.spyOn(console,'error').mockImplementation(()=>{});
 const BrokenScreen=()=>{throw new Error('signed out crash');};
 try {
  const screen=render(<ErrorBoundary><BrokenScreen/></ErrorBoundary>);
  expect(screen.getByText('Something went wrong')).toBeTruthy();
  expect(mockCaptureOperationalError.mock.calls.length).toBe(before+1);
 } finally {quiet.mockRestore();}
});
