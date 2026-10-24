import { navigationTheme } from '../theme/navigationTheme';
import React, { useEffect } from 'react';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../context/AuthContext';
import { colors } from '../constants/colors';
import LockedBottomTabBar from '../components/navigation/LockedBottomTabBar';
import ScreenHeader from '../components/common/ScreenHeader';
import SyncIndicator from '../components/common/SyncIndicator';
import {
  registerNavigationContainer,
  setObservabilityUser,
} from '../services/observability';

// Auth screens
import LoginScreen from '../screens/auth/LoginScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';

// Main tab screens
import HomeScreen from '../screens/main/HomeScreen';
import TimeTrackingScreen from '../screens/main/TimeTrackingScreen';
import TimeEntriesListScreen from '../screens/main/TimeEntriesListScreen';
import ChildrenListScreen from '../screens/main/ChildrenListScreen';
import AssessmentsScreen from '../screens/main/AssessmentsScreen';
import InsightsScreen from '../screens/main/InsightsScreen';
import ProfileScreen from '../screens/main/ProfileScreen';

// Children screens
import AddChildScreen from '../screens/children/AddChildScreen';
import EditChildScreen from '../screens/children/EditChildScreen';
import CreateClassScreen from '../screens/children/CreateClassScreen';
import EditClassScreen from '../screens/children/EditClassScreen';
import ClassDetailScreen from '../screens/children/ClassDetailScreen';
import ClassOnboardingScreen from '../screens/onboarding/ClassOnboardingScreen';
import ChildOnboardingScreen from '../screens/onboarding/ChildOnboardingScreen';

// Session screens
import SessionFormScreen from '../screens/sessions/SessionFormScreen';
import SessionCompleteScreen from '../screens/sessions/SessionCompleteScreen';
import SessionHistoryScreen from '../screens/sessions/SessionHistoryScreen';

// Assessment screens
import AssessmentChildSelectScreen from '../screens/assessments/AssessmentChildSelectScreen';
import StandaloneTestScreen from '../screens/assessments/StandaloneTestScreen';
import AssessmentResultsScreen from '../screens/assessments/AssessmentResultsScreen';
import AssessmentHistoryScreen from '../screens/assessments/AssessmentHistoryScreen';
import AssessmentDetailScreen from '../screens/assessments/AssessmentDetailScreen';
import LetterTrackerScreen from '../screens/assessments/LetterTrackerScreen';
import ChildResultsScreen from '../screens/assessments/ChildResultsScreen';
import BatteryOverviewScreen from '../screens/assessments/battery/BatteryOverviewScreen';
import BatteryQuestionScreen from '../screens/assessments/battery/BatteryQuestionScreen';
import BatteryRunSummaryScreen from '../screens/assessments/battery/BatteryRunSummaryScreen';

// Insight screens
import LetterMasteryRankingScreen from '../screens/insights/LetterMasteryRankingScreen';
import AssessmentRankingScreen from '../screens/insights/AssessmentRankingScreen';
import SessionCountRankingScreen from '../screens/insights/SessionCountRankingScreen';

// Device-check gallery
import QuestionGalleryScreen from '../screens/dev/QuestionGalleryScreen';
import QuestionGalleryRunScreen from '../screens/dev/QuestionGalleryRunScreen';
import { isQuestionGalleryEnabled } from '../utils/questionGallery';

// Sync screen
import SyncStatusScreen from '../screens/main/SyncStatusScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const ChildrenStack = createNativeStackNavigator();

export function AuthNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        header: (props) => <ScreenHeader {...props} />,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen
        name="ForgotPassword"
        component={ForgotPasswordScreen}
        options={{
          headerShown: true,
          title: 'Reset password',
        }}
      />
    </Stack.Navigator>
  );
}

function ChildrenStackNavigator() {
  return (
    <ChildrenStack.Navigator
      screenOptions={{
        header: (props) => <ScreenHeader {...props} />,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <ChildrenStack.Screen
        name="ChildrenList"
        component={ChildrenListScreen}
        options={({ navigation }) => ({
          title: 'Children',
          headerRight: () => (
            <SyncIndicator onPress={() => navigation.navigate('SyncStatus')} />
          ),
        })}
      />
      <ChildrenStack.Screen
        name="ClassDetail"
        component={ClassDetailScreen}
        options={{ title: '' }}
      />
      <ChildrenStack.Screen
        name="ChildResults"
        component={ChildResultsScreen}
        options={{ title: 'Child results' }}
      />
    </ChildrenStack.Navigator>
  );
}

export function MainTabNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => <LockedBottomTabBar {...props} />}
      screenOptions={({ navigation }) => ({
        header: (props) => <ScreenHeader {...props} />,
        sceneStyle: { backgroundColor: colors.background },
        headerRight: () => (
          <SyncIndicator onPress={() => navigation.navigate('SyncStatus')} />
        ),
      })}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: 'Home',
          tabBarLabel: 'Home',
          headerShown: false,
        }}
      />
      <Tab.Screen
        name="Children"
        component={ChildrenStackNavigator}
        options={{ title: 'Children', tabBarLabel: 'Children', headerShown: false }}
      />
      <Tab.Screen
        name="Insights"
        component={InsightsScreen}
        options={{ title: 'Insights', tabBarLabel: 'Insights' }}
      />
      <Tab.Screen
        name="Assessments"
        component={AssessmentsScreen}
        options={{ title: 'Assessments', tabBarLabel: 'Assess' }}
      />
    </Tab.Navigator>
  );
}

export function MainNavigator() {
  const galleryEnabled = isQuestionGalleryEnabled();
  return (
    <Stack.Navigator
      screenOptions={{
        header: (props) => <ScreenHeader {...props} />,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen
        name="MainTabs"
        component={MainTabNavigator}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: 'Profile',
        }}
      />
      <Stack.Screen
        name="TimeTracking"
        component={TimeTrackingScreen}
        options={{
          title: 'Time tracking',
        }}
      />
      <Stack.Screen
        name="TimeEntriesList"
        component={TimeEntriesListScreen}
        options={{
          title: 'Work history',
        }}
      />
      <Stack.Screen
        name="ClassOnboarding"
        component={ClassOnboardingScreen}
        options={{
          title: 'Set up your class',
        }}
      />
      <Stack.Screen
        name="CreateClass"
        component={CreateClassScreen}
        options={{
          title: 'Create class',
        }}
      />
      <Stack.Screen
        name="ChildOnboarding"
        component={ChildOnboardingScreen}
        options={{
          title: 'Add your children',
          headerBackVisible: false,
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="EditClass"
        component={EditClassScreen}
        options={{
          title: 'Edit class',
        }}
      />
      <Stack.Screen
        name="AddChild"
        component={AddChildScreen}
        options={{
          title: 'Add child',
        }}
      />
      <Stack.Screen
        name="EditChild"
        component={EditChildScreen}
        options={{
          title: 'Edit child',
        }}
      />
      <Stack.Screen
        name="SessionForm"
        component={SessionFormScreen}
        options={{
          title: 'New session',
          headerLeftIcon: 'close',
        }}
      />
      <Stack.Screen
        name="SessionComplete"
        component={SessionCompleteScreen}
        options={{
          headerShown: false,
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="SessionHistory"
        component={SessionHistoryScreen}
        options={{
          title: 'Session history',
        }}
      />
      <Stack.Screen
        name="AssessmentChildSelect"
        component={AssessmentChildSelectScreen}
        options={{
          title: 'Select child',
        }}
      />
      {galleryEnabled && <Stack.Screen name="QuestionGallery" component={QuestionGalleryScreen}
        options={{ title: 'Question gallery' }} />}
      {galleryEnabled && <Stack.Screen name="QuestionGalleryRun" component={QuestionGalleryRunScreen}
        options={{ headerShown: false }} />}
      <Stack.Screen
        name="StandaloneTest"
        component={StandaloneTestScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="AssessmentResults"
        component={AssessmentResultsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen name="BatteryOverview" component={BatteryOverviewScreen} options={{ title: '' }} />
      <Stack.Screen name="BatteryQuestion" component={BatteryQuestionScreen} options={{ headerShown: false }} />
      <Stack.Screen name="BatteryRunSummary" component={BatteryRunSummaryScreen} options={{ title: 'Review run' }} />
      <Stack.Screen
        name="AssessmentHistory"
        component={AssessmentHistoryScreen}
        options={{
          title: 'Assessment history',
        }}
      />
      <Stack.Screen
        name="LetterTracker"
        component={LetterTrackerScreen}
        options={{
          title: 'Letter tracker',
        }}
      />
      <Stack.Screen
        name="AssessmentDetail"
        component={AssessmentDetailScreen}
        options={{
          title: 'Assessment detail',
        }}
      />
      <Stack.Screen
        name="LetterMasteryRanking"
        component={LetterMasteryRankingScreen}
        options={{
          title: 'Letter mastery',
        }}
      />
      <Stack.Screen
        name="AssessmentRanking"
        component={AssessmentRankingScreen}
        options={{
          title: 'Assessment scores',
        }}
      />
      <Stack.Screen
        name="SessionCountRanking"
        component={SessionCountRankingScreen}
        options={{
          title: 'Session count',
        }}
      />
      <Stack.Screen
        name="SyncStatus"
        component={SyncStatusScreen}
        options={{
          title: 'Sync status',
        }}
      />
    </Stack.Navigator>
  );
}

export default function AppNavigator({ signedIn }) {
  const { user } = useAuth();
  const navigationRef = useNavigationContainerRef();

  useEffect(() => {
    setObservabilityUser(user || null);
  }, [user?.id, user?.email]);

  return (
    <NavigationContainer
      theme={navigationTheme}
      ref={navigationRef}
      onReady={() => registerNavigationContainer(navigationRef)}
    >
      {signedIn ? <MainNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}
