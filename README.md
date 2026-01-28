# Masi Field Staff App

A React Native mobile application for Masi, a nonprofit, to manage their field staff's work with children, track time, and record educational sessions.

## Features

- ✅ User authentication with Supabase
- ✅ Time tracking with geolocation
- ✅ Children management
- ✅ Session recording with dynamic forms based on job title
- ✅ Offline-first architecture with automatic sync
- ✅ Session history (view-only)

## Tech Stack

- React Native (Expo)
- JavaScript (no TypeScript)
- Supabase (Backend & Auth)
- React Native Paper (UI)
- React Navigation
- AsyncStorage (Offline storage)

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Expo CLI (`npm install -g expo-cli`)
- iOS Simulator (macOS) or Android Studio (for emulator)
- Supabase account

## Setup Instructions

### 1. Clone and Install

```bash
cd masi-app
npm install
```

### 2. Set Up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to Project Settings → API
3. Copy your project URL and anon/public key

### 3. Create Database Tables

Run these SQL commands in Supabase SQL Editor:

```sql
-- Users table (extends auth.users)
CREATE TABLE users (
  id UUID REFERENCES auth.users PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  job_title TEXT NOT NULL CHECK (job_title IN ('Literacy Coach', 'Numeracy Coach', 'ZZ Coach', 'Yeboneer')),
  assigned_school TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Children table
CREATE TABLE children (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  teacher TEXT,
  class TEXT,
  age INTEGER,
  school TEXT,
  assigned_staff_id UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Time entries table
CREATE TABLE time_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) NOT NULL,
  sign_in_time TIMESTAMP WITH TIME ZONE NOT NULL,
  sign_in_lat DECIMAL,
  sign_in_lon DECIMAL,
  sign_out_time TIMESTAMP WITH TIME ZONE,
  sign_out_lat DECIMAL,
  sign_out_lon DECIMAL,
  synced BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sessions table
CREATE TABLE sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) NOT NULL,
  session_type TEXT NOT NULL,
  session_date DATE NOT NULL,
  children_ids UUID[] NOT NULL,
  activities JSONB,
  notes TEXT,
  synced BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE children ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users
CREATE POLICY "Users can view own profile" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (auth.uid() = id);

-- RLS Policies for children
CREATE POLICY "Users can view assigned children" ON children
  FOR SELECT USING (assigned_staff_id = auth.uid());

CREATE POLICY "Users can insert children" ON children
  FOR INSERT WITH CHECK (assigned_staff_id = auth.uid());

CREATE POLICY "Users can update assigned children" ON children
  FOR UPDATE USING (assigned_staff_id = auth.uid());

-- RLS Policies for time_entries
CREATE POLICY "Users can view own time entries" ON time_entries
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own time entries" ON time_entries
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own time entries" ON time_entries
  FOR UPDATE USING (user_id = auth.uid());

-- RLS Policies for sessions
CREATE POLICY "Users can view own sessions" ON sessions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own sessions" ON sessions
  FOR INSERT WITH CHECK (user_id = auth.uid());
```

### 4. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env` and add your Supabase credentials:

```
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 5. Create Test User

In Supabase dashboard:
1. Go to Authentication → Users
2. Click "Add user"
3. Create a test user with email/password
4. Then insert a profile in the users table:

```sql
INSERT INTO users (id, first_name, last_name, job_title, assigned_school)
VALUES (
  'USER_ID_FROM_AUTH',
  'John',
  'Doe',
  'Literacy Coach',
  'Example School'
);
```

## Running the App

### Start Development Server

```bash
npm start
```

### Run on iOS Simulator

```bash
npm run ios
```

### Run on Android Emulator

```bash
npm run android
```

### Run on Physical Device

1. Install Expo Go app on your phone
2. Scan the QR code from the terminal

## Project Structure

```
src/
├── components/
│   ├── common/           # Reusable UI components
│   ├── session-forms/    # Job-specific session forms
│   └── children/         # Child management components
├── screens/
│   ├── auth/            # Login, forgot password
│   └── main/            # Home, time tracking, children, sessions
├── services/
│   ├── supabaseClient.js    # Supabase configuration
│   ├── offlineSync.js       # Sync service (to be built)
│   └── locationService.js   # Geolocation (to be built)
├── context/
│   ├── AuthContext.js       # Authentication state
│   └── OfflineContext.js    # Offline sync state (to be built)
├── utils/
│   ├── storage.js           # AsyncStorage wrapper
│   └── validators.js        # Form validation (to be built)
├── navigation/
│   └── AppNavigator.js      # Navigation setup
└── constants/
    ├── colors.js            # Theme colors
    └── jobTitles.js         # Job title constants
```

## Development Status

### ✅ Completed
- Project setup with Expo
- Supabase integration
- Authentication flow
- Basic navigation
- Storage utilities
- Theme constants

### 🚧 In Progress
- Time tracking screen
- Children management
- Session recording forms
- Offline sync service

### 📋 To Do
- Session history view
- Location services
- Form validation
- Error handling improvements
- Testing

## Contributing

See `Claude.md` for detailed project specifications and development guidelines.

## License

Proprietary - Nonprofit Organization
