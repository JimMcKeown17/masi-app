import React from 'react';
import { render } from '@testing-library/react-native';

// @expo/vector-icons resolves from a nested path jest-expo doesn't reach; the icon
// is decorative and irrelevant to this component's behaviour, so stub it out.
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });

import NoActiveProgrammeNotice from '../src/components/common/NoActiveProgrammeNotice';

describe('NoActiveProgrammeNotice', () => {
  test('shows an actionable no-active-programme empty-state', () => {
    const { getByText } = render(<NoActiveProgrammeNotice />);

    expect(getByText(/no active programme/i)).toBeTruthy();
    // The action the EA can actually take.
    expect(getByText(/contact your supervisor/i)).toBeTruthy();
  });
});
