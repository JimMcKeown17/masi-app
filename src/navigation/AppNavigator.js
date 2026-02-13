import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../context/AuthContext';
import { ActivityIndicator, View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import SyncIndicator from '../components/common/SyncIndicator';

// Auth screens
import LoginScreen from '../screens/auth/LoginScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';

// Main tab screens
import HomeScreen from '../screens/main/HomeScreen';
import TimeEntriesListScreen from '../screens/main/TimeEntriesListScreen';
import AssessmentsScreen from '../screens/main/AssessmentsScreen';
import ChildrenListScreen from '../screens/main/ChildrenListScreen';
import SessionsScreen from '../screens/main/SessionsScreen';
import ProfileScreen from '../screens/main/ProfileScreen';

// Children screens
import AddChildScreen from '../screens/children/AddChildScreen';
import EditChildScreen from '../screens/children/EditChildScreen';
import GroupManagementScreen from '../screens/children/GroupManagementScreen';
import AddChildToGroupScreen from '../screens/children/AddChildToGroupScreen';

// Session screens
import SessionFormScreen from '../screens/sessions/SessionFormScreen';
import SessionHistoryScreen from '../screens/sessions/SessionHistoryScreen';

// Sync screen
import SyncStatusScreen from '../screens/main/SyncStatusScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

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

function MainTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route, navigation }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === 'Home') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'Children') {
            iconName = focused ? 'people' : 'people-outline';
          } else if (route.name === 'Sessions') {
            iconName = focused ? 'document-text' : 'document-text-outline';
          } else if (route.name === 'Assessments') {
            iconName = focused ? 'clipboard' : 'clipboard-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        headerRight: () => (
          <View style={{ marginRight: 16 }}>
            <SyncIndicator onPress={() => navigation.navigate('SyncStatus')} />
          </View>
        ),
        tabBarActiveTintColor: colors.tabActive,      // Brand blue
        tabBarInactiveTintColor: colors.tabInactive,  // Gray
        tabBarStyle: {
          backgroundColor: colors.surface,            // White background
          borderTopColor: colors.border,
          borderTopWidth: 1,
        },
      })}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={({ navigation }) => ({
          title: 'Home',
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 16, gap: 8 }}>
              <SyncIndicator onPress={() => navigation.navigate('SyncStatus')} />
              <TouchableOpacity onPress={() => navigation.navigate('Profile')}>
                <Ionicons name="settings-outline" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          ),
        })}
      />
      <Tab.Screen
        name="Children"
        component={ChildrenListScreen}
        options={{ title: 'My Children' }}
      />
      <Tab.Screen
        name="Sessions"
        component={SessionsScreen}
        options={{ title: 'Sessions' }}
      />
      <Tab.Screen
        name="Assessments"
        component={AssessmentsScreen}
        options={{ title: 'Assessments' }}
      />
    </Tab.Navigator>
  );
}

function MainNavigator() {
  return (
    <Stack.Navigator>
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
        name="TimeEntriesList"
        component={TimeEntriesListScreen}
        options={{
          title: 'Work History',
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
        name="GroupManagement"
        component={GroupManagementScreen}
        options={{
          title: 'Manage Groups',
          headerBackTitle: 'Back',
        }}
      />
      <Stack.Screen
        name="AddChildToGroup"
        component={AddChildToGroupScreen}
        options={{
          title: 'Add to Group',
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
        name="SessionHistory"
        component={SessionHistoryScreen}
        options={{
          title: 'Session History',
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

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {user ? <MainNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}
