const fs = require('fs');
const path = require('path');

const readSource = (filePath) => (
  fs.readFileSync(path.join(process.cwd(), filePath), 'utf8')
);

describe('domain text input audit', () => {
  test('literacy session comments disable keyboard suggestions', () => {
    const source = readSource('src/screens/sessions/LiteracySessionForm.js');

    expect(source).toMatch(/placeholder="Add session notes\.\.\."[\s\S]*\{\.\.\.NO_TEXT_SUGGESTIONS\}/);
  });

  test('search fields for child and class names disable keyboard suggestions', () => {
    expect(readSource('src/screens/main/ChildrenListScreen.js')).toMatch(
      /<Searchbar[\s\S]*placeholder="Search classes\.\.\."[\s\S]*\{\.\.\.NO_TEXT_SUGGESTIONS\}/
    );
    expect(readSource('src/components/children/ChildSelector.js')).toMatch(
      /<Searchbar[\s\S]*placeholder="Search children\.\.\."[\s\S]*\{\.\.\.NO_TEXT_SUGGESTIONS\}/
    );
    expect(readSource('src/screens/assessments/AssessmentChildSelectScreen.js')).toMatch(
      /<Searchbar[\s\S]*placeholder="Search children\.\.\."[\s\S]*\{\.\.\.NO_TEXT_SUGGESTIONS\}/
    );
  });

  test('auth and password screens keep platform text assistance available', () => {
    expect(readSource('src/screens/auth/LoginScreen.js')).not.toContain('NO_TEXT_SUGGESTIONS');
    expect(readSource('src/screens/auth/ForgotPasswordScreen.js')).not.toContain('NO_TEXT_SUGGESTIONS');
    expect(readSource('src/screens/main/ProfileScreen.js')).not.toContain('NO_TEXT_SUGGESTIONS');
  });
});
