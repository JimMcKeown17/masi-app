import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../context/AuthContext';
import { ActivityIndicator, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import SyncIndicator from '../components/common/SyncIndicator';

// Auth screens
import LoginScreen from '../screens/auth/LoginScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';

// Main tab screens
import HomeScreen from '../screens/main/HomeScreen';
import TimeTrackingScreen from '../screens/main/TimeTrackingScreen';
import TimeEntriesListScreen from '../screens/main/TimeEntriesListScreen';
import ChildrenListScreen from '../screens/main/ChildrenListScreen';
import SessionsScreen from '../screens/main/SessionsScreen';
import ProfileScreen from '../screens/main/ProfileScreen';

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
          } else if (route.name === 'Time') {
            iconName = focused ? 'time' : 'time-outline';
          } else if (route.name === 'Children') {
            iconName = focused ? 'people' : 'people-outline';
          } else if (route.name === 'Sessions') {
            iconName = focused ? 'document-text' : 'document-text-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        headerRight: () => (
          <View style={{ marginRight: 16 }}>
            <SyncIndicator onPress={() => {
              // Navigate to sync status screen (we'll create this later)
              console.log('Sync indicator tapped');
            }} />
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
        options={{ title: 'Home' }}
      />
      <Tab.Screen
        name="Time"
        component={TimeTrackingScreen}
        options={{ title: 'Time Tracking' }}
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
