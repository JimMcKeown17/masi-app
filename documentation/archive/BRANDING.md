# Masinyusane Mobile Branding (UI Spec)

## Brand Colors (Hex)

- **Blue (Primary UI):** `#294A99`
- **Red (Brand / Emphasis):** `#E72D4D`
- **Yellow (Accent):** `#FFDD00`
- **Green (Success / Growth):** `#3FA535`

## Mobile-First Color Roles

### Blue is the default UI color
Use for:
- Headers and navigation bars
- Tab bars and active states
- Primary buttons
- Links and interactive elements
- Active/selected states

### Red is for emphasis only
Use for:
- Key highlights and important callouts
- Critical moments or urgent actions
- Error states
- **Avoid:** Large red backgrounds behind long text blocks

### Yellow is accent-only
Use for:
- Badges and notifications
- Small highlights
- Icons and dividers
- Progress accents
- **Never use:** Full backgrounds or primary button color

### Green is semantic-only
Use for:
- Success states
- Progress indicators
- "Completed" indicators
- Growth/achievement metrics
- **Avoid:** Decorative large green sections

## Screen-Level Rule (Avoid Rainbow UI)

On any single screen, use:
- **1 dominant color** (usually blue)
- **Neutrals for layout**
- **Max 1 accent** (yellow OR red, not both)

**Never** use blue + red + yellow + green all together on one screen.

## Neutrals (For a Calm, Professional Feel)

- **Background:** `#F7F7F7` (main app background)
- **Surface:** `#FFFFFF` (cards, modals)
- **Card background:** `#FAFAFA` (alternative card fill)
- **Text primary:** `#111111` (main text)
- **Text secondary:** `#6B7280` (supporting text, labels)
- **Borders/dividers:** `#E5E7EB` (separators, outlines)

## Layout & Component Styling

### Cards
- **Preferred layout:** Card-based over large colored sections
- **Border radius:** 12–16px (use `borderRadius.md` or `borderRadius.lg`)
- **Shadow:** Subtle, minimal (see `shadows.card` in colors.js)
- **Padding:** Generous internal spacing
- **Background:** White (`#FFFFFF`) or light gray (`#FAFAFA`)

### Spacing & Hierarchy
- Use spacing and hierarchy more than color for separation
- Consistent spacing scale (4, 8, 16, 24, 32, 48px)
- Group related elements with whitespace

### Buttons
- **Primary action:** Blue background (`#294A99`)
- **Secondary action:** Outlined with blue
- **Destructive action:** Red background (`#E72D4D`)
- **Success action:** Green background (`#3FA535`)
- Minimum touch target: 44x44px

### Navigation
- **Tab bar active:** Blue (`#294A99`)
- **Tab bar inactive:** Gray (`#6B7280`)
- **Header background:** Blue (`#294A99`)
- **Header text:** White

## Typography & Readability

- **Prioritize scannability:** Short blocks, clear headings, strong numeric metrics
- **Avoid long paragraphs:** Break content into digestible chunks
- **Text over images:** Always use a dark overlay for readability
- **Hierarchy:** Use size, weight, and color to establish clear hierarchy

### Text Styles
- **Headlines:** Bold, primary color or black
- **Body text:** Regular weight, black (`#111111`)
- **Supporting text:** Regular weight, gray (`#6B7280`)
- **Labels:** Small, uppercase, gray

## Overall Vibe

**Calm, trustworthy, professional, impact-oriented**

- Use color sparingly
- Let neutrals do most of the work
- Emphasize content over decoration
- Focus on clarity and usability
- Reflect the nonprofit's mission: education, growth, impact

## Examples

### ✅ Good Screen Composition
```
Header: Blue (#294A99)
Background: Light gray (#F7F7F7)
Cards: White (#FFFFFF) with subtle shadow
Primary CTA: Blue button
Accent: Single yellow badge for "New" indicator
Text: Black and gray hierarchy
```

### ❌ Avoid
```
Header: Blue
Card 1: Red background with yellow text
Card 2: Green background with white text
Button: Yellow background
Result: Rainbow chaos, hard to read, unprofessional
```

## Implementation

All colors are defined in `/src/constants/colors.js`

Import and use:
```javascript
import { colors, spacing, borderRadius, shadows } from '../constants/colors';

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    ...shadows.card,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  headerText: {
    color: colors.text,
    fontSize: 24,
    fontWeight: 'bold',
  },
  secondaryText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
});
```

---

**Last Updated:** 2026-01-27
**Version:** 1.0
