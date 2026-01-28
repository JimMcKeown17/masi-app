# Quick Start Guide

## Getting Started in 5 Minutes

### 1. Install Dependencies
```bash
cd nonprofit-field-app
npm install
```

### 2. Set Up Supabase
1. Create account at supabase.com
2. Create new project
3. Run the SQL from README.md in SQL Editor
4. Copy URL and anon key

### 3. Configure App
```bash
cp .env.example .env
# Edit .env with your Supabase credentials
```

### 4. Create Test User
In Supabase dashboard:
- Auth → Add user (email: test@example.com, password: test123)
- SQL Editor → Insert user profile (see README)

### 5. Run App
```bash
npm start
# Then press 'i' for iOS or 'a' for Android
```

## Development Workflow

### Current Status
You can now:
- ✅ Login with test credentials
- ✅ See home screen with menu options
- 🚧 Other screens are placeholders (need to be built)

### Next Steps to Build

1. **Time Tracking Screen** (`src/screens/main/TimeTrackingScreen.js`)
   - Sign in/out buttons
   - Get current location
   - Save to local storage
   - Display current status

2. **Children List Screen** (`src/screens/main/ChildrenListScreen.js`)
   - Fetch assigned children
   - Display in list
   - Search/filter
   - Add new child button

3. **Session Form Screen** (`src/screens/main/SessionFormScreen.js`)
   - Dynamic form based on job_title
   - Child selector
   - Save to local storage
   - Add to sync queue

4. **Offline Sync Service** (`src/services/offlineSync.js`)
   - Background sync process
   - Queue management
   - Retry logic
   - Network state monitoring

## Common Tasks

### Add a New Screen
1. Create file in `src/screens/main/YourScreen.js`
2. Add to navigator in `src/navigation/AppNavigator.js`
3. Add menu item in HomeScreen if needed

### Add Supabase Query
```javascript
import { supabase } from '../services/supabaseClient';

// Fetch data
const { data, error } = await supabase
  .from('table_name')
  .select('*')
  .eq('field', value);

// Insert data
const { data, error } = await supabase
  .from('table_name')
  .insert({ field: value });
```

### Save Data Offline
```javascript
import { storage } from '../utils/storage';

// Save
await storage.saveSession(sessionData);

// Retrieve
const sessions = await storage.getSessions();
```

### Use Authentication
```javascript
import { useAuth } from '../context/AuthContext';

function MyComponent() {
  const { user, profile, signOut } = useAuth();
  // ...
}
```

## Testing

### Test Login
- Email: test@example.com
- Password: test123 (or whatever you set)

### Test Offline Mode
- Enable airplane mode on your device
- App should still work and queue data
- Disable airplane mode to see sync

## Debugging

### Common Issues

**"Cannot read property 'navigate' of undefined"**
- Make sure screen is part of navigator
- Check navigation prop is passed correctly

**"Network request failed"**
- Check .env file has correct Supabase credentials
- Verify Supabase project is active
- Check device has internet connection (unless testing offline)

**"Invalid API key"**
- Regenerate anon key in Supabase dashboard
- Update .env file
- Restart development server

**"Row level security policy violation"**
- Check RLS policies are created in Supabase
- Verify user is authenticated
- Check user ID matches in database

## File Organization Tips

- Keep components small and focused
- Use functional components with hooks
- Extract reusable logic into custom hooks
- Keep styles at bottom of file
- Use constants for colors, spacing, strings

## Need Help?

Check:
1. README.md - Setup and configuration
2. Claude.md - Full project specification
3. Supabase docs - Database queries
4. React Native Paper docs - UI components
5. React Navigation docs - Navigation setup
