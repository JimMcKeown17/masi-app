import React, { useEffect } from 'react';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../context/AuthContext';
import { ActivityIndicator, View, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LockedBottomTabBar from '../components/navigation/LockedBottomTabBar';
import { Text } from 'react-native-paper';
import { colors } from '../constants/colors';
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
import LetterAssessmentScreen from '../screens/assessments/LetterAssessmentScreen';
import SequentialAssessmentScreen from '../screens/assessments/SequentialAssessmentScreen';
import AssessmentResultsScreen from '../screens/assessments/AssessmentResultsScreen';
import AssessmentHistoryScreen from '../screens/assessments/AssessmentHistoryScreen';
import AssessmentDetailScreen from '../screens/assessments/AssessmentDetailScreen';
import LetterTrackerScreen from '../screens/assessments/LetterTrackerScreen';
import ChildResultsScreen from '../screens/assessments/ChildResultsScreen';

// Insight screens
import LetterMasteryRankingScreen from '../screens/insights/LetterMasteryRankingScreen';
import AssessmentRankingScreen from '../screens/insights/AssessmentRankingScreen';
import SessionCountRankingScreen from '../screens/insights/SessionCountRankingScreen';

// Sync screen
import SyncStatusScreen from '../screens/main/SyncStatusScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const ChildrenStack = createNativeStackNavigator();

function AuthNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen
        name="ForgotPassword"
        component={ForgotPasswordScreen}
        options={{
          headerShown: true,
          title: 'Reset Password',
          headerBackTitle: 'Back',
        }}
      />
    </Stack.Navigator>
  );
}

function ChildrenStackNavigator() {
  return (
    <ChildrenStack.Navigator
      screenOptions={({ navigation }) => ({
        headerLeft: navigation.canGoBack()
          ? () => (
            <Pressable
              onPress={() => navigation.goBack()}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Back"
              style={{ flexDirection: 'row', alignItems: 'center', marginLeft: Platform.OS === 'ios' ? -8 : 0 }}
            >
              <Ionicons name="chevron-back" size={28} color={colors.primary} />
              <Text style={{ color: colors.primary, fontSize: 17 }}>Back</Text>
            </Pressable>
          )
          : undefined,
      })}
    >
      <ChildrenStack.Screen
        name="ChildrenList"
        component={ChildrenListScreen}
        options={({ navigation }) => ({
          title: 'My Children',
          headerRight: () => (
            <View style={{ marginRight: 16 }}>
              <SyncIndicator onPress={() => navigation.navigate('SyncStatus')} />
            </View>
          ),
        })}
      />
      <ChildrenStack.Screen
        name="ClassDetail"
        component={ClassDetailScreen}
        options={{ title: 'Class Details', headerBackTitle: 'Back' }}
      />
      <ChildrenStack.Screen
        name="ChildResults"
        component={ChildResultsScreen}
        options={{ title: 'Child Results', headerBackTitle: 'Back' }}
      />
    </ChildrenStack.Navigator>
  );
}

export function MainTabNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => <LockedBottomTabBar {...props} />}
      screenOptions={({ navigation }) => ({
        headerRight: () => (
          <View style={{ marginRight: 16 }}>
            <SyncIndicator onPress={() => navigation.navigate('SyncStatus')} />
          </View>
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
        options={{ title: 'My Children', tabBarLabel: 'Children', headerShown: false }}
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

function MainNavigator() {
  return (
    <Stack.Navigator
      screenOptions={({ navigation }) => ({
        headerLeft: navigation.canGoBack()
          ? () => (
            <Pressable
              onPress={() => navigation.goBack()}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Back"
              style={{ flexDirection: 'row', alignItems: 'center', marginLeft: Platform.OS === 'ios' ? -8 : 0 }}
            >
              <Ionicons name="chevron-back" size={28} color={colors.primary} />
              <Text style={{ color: colors.primary, fontSize: 17 }}>Back</Text>
            </Pressable>
          )
          : undefined,
      })}
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
          title: 'My Profile',
          headerBackTitle: 'Back',
        }}
      />
      <Stack.Screen
        name="TimeTracking"
        component={TimeTrackingScreen}
        options={{
          title: 'Time Tracking',
          headerBackTitle: 'Back',
        }}
      />
      <Stack.Screen
        name="TimeEntriesList"
        component={TimeEntriesListScreen}
        options={{
          title: 'Work History',
          headerBackTitle: 'Back',
        }}
      />
      <Stack.Screen
        name="ClassOnboarding"
        component={ClassOnboardingScreen}
        options={{
          title: 'Set Up Your Class',
          headerBackTitle: 'Back',
        }}
      />
      <Stack.Screen
        name="CreateClass"
        component={CreateClassScreen}
        options={{
          title: 'Create Class',
          headerBackTitle: 'Back',
        }}
      />
      <Stack.Screen
        name="ChildOnboarding"
        component={ChildOnboardingScreen}
        options={{
          title: 'Add Your Children',
          headerBackVisible: false,
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="EditClass"
        component={EditClassScreen}
        options={{
          title: 'Edit Class',
          headerBackTitle: 'Back',
        }}
      />
      <Stack.Screen
        name="AddChild"
        component={AddChildScreen}
        options={{
          title: 'Add Child',
          headerBackTitle: 'Back',
        }}
      />
      <Stack.Screen
        name="EditChild"
        component={EditChildScreen}
        options={{
          title: 'Edit Child',
          headerBackTitle: 'Back',
        }}
      />
      <Stack.Screen
        name="SessionForm"
        component={SessionFormScreen}
        options={{
          title: 'New Session',
          headerBackTitle: 'Back',
        }}
      />
      <Stack.Screen
        name="SessionComplete"
        component={SessionCompleteScreen}
        options={{
          title: 'Session saved',
          // The form is replaced by this screen, so there's nothing to go "back"
          // to but the launch context; "Done" is the single, clear way out.
          headerLeft: () => null,
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="SessionHistory"
        component={SessionHistoryScreen}
        options={{
          title: 'Session History',
          headerBackTitle: 'Back',
        }}
      />
      <Stack.Screen
        name="AssessmentChildSelect"
        component={AssessmentChildSelectScreen}
        options={{
          title: 'Select Child',
          headerBackTitle: 'Back',
        }}
      />
      <Stack.Screen
        name="LetterAssessment"
        component={LetterAssessmentScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="SequentialAssessment"
        component={SequentialAssessmentScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="AssessmentResults"
        component={AssessmentResultsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="AssessmentHistory"
        component={AssessmentHistoryScreen}
        options={{
          title: 'Assessment History',
          headerBackTitle: 'Back',
        }}
      />
      <Stack.Screen
        name="LetterTracker"
        component={LetterTrackerScreen}
        options={{
          title: 'Letter Tracker',
          headerBackTitle: 'Back',
        }}
      />
      <Stack.Screen
        name="AssessmentDetail"
        component={AssessmentDetailScreen}
        options={{
          title: 'Assessment Detail',
          headerBackTitle: 'Back',
        }}
      />
      <Stack.Screen
        name="LetterMasteryRanking"
        component={LetterMasteryRankingScreen}
        options={{
          title: 'Letter Mastery',
          headerBackTitle: 'Back',
        }}
      />
      <Stack.Screen
        name="AssessmentRanking"
        component={AssessmentRankingScreen}
        options={{
          title: 'Assessment Scores',
          headerBackTitle: 'Back',
        }}
      />
      <Stack.Screen
        name="SessionCountRanking"
        component={SessionCountRankingScreen}
        options={{
          title: 'Session Count',
          headerBackTitle: 'Back',
        }}
      />
      <Stack.Screen
        name="SyncStatus"
        component={SyncStatusScreen}
        options={{
          title: 'Sync Status',
          headerBackTitle: 'Back',
        }}
      />
    </Stack.Navigator>
  );
}

export default function AppNavigator() {
  const { user, loading } = useAuth();
  const navigationRef = useNavigationContainerRef();

  useEffect(() => {
    setObservabilityUser(user || null);
  }, [user?.id, user?.email]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer
      ref={navigationRef}
      onReady={() => registerNavigationContainer(navigationRef)}
    >
      {user ? <MainNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}
