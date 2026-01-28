/**
 * Masinyusane Mobile Branding (UI Spec)
 *
 * Design Principles:
 * - Blue is the default UI color for headers, nav/tabs, primary buttons, links, active states
 * - Red is for emphasis only: key highlights, important callouts, critical moments
 * - Yellow is accent-only: badges, small highlights, icons, dividers, progress accents
 * - Green is semantic-only: success states, progress, "completed" indicators
 *
 * Screen-level rule: Use 1 dominant color (usually blue) + neutrals + max 1 accent
 * Avoid using blue + red + yellow + green all together on one screen (no rainbow UI)
 *
 * Overall vibe: Calm, trustworthy, professional, impact-oriented
 */

export const colors = {
  // Brand Colors
  primary: '#294A99',        // Blue (Primary UI) - headers, nav, buttons, links
  emphasis: '#E72D4D',       // Red (Brand/Emphasis) - highlights, callouts
  accent: '#FFDD00',         // Yellow (Accent) - badges, icons, dividers
  success: '#3FA535',        // Green (Success) - completed, progress

  // Semantic Colors
  error: '#E72D4D',          // Use brand red for errors
  warning: '#FFDD00',        // Use brand yellow for warnings
  info: '#294A99',           // Use brand blue for info

  // Neutrals (for calm, professional feel)
  background: '#F7F7F7',     // Main background
  surface: '#FFFFFF',        // Card/modal background
  cardBackground: '#FAFAFA', // Alternative card background

  // Text Colors
  text: '#111111',           // Primary text
  textSecondary: '#6B7280',  // Secondary text

  // UI Elements
  border: '#E5E7EB',         // Borders/dividers
  disabled: '#9CA3AF',       // Disabled state
  placeholder: '#9CA3AF',    // Placeholder text

  // Component-specific
  tabActive: '#294A99',      // Active tab color
  tabInactive: '#6B7280',    // Inactive tab color
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
};

export const shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  elevated: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
};
