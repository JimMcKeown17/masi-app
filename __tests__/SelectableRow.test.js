import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { render } from '@testing-library/react-native';
import SelectableRow from '../src/components/forms/SelectableRow';

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });

test.each([[undefined, 16], [<Text key="lead">A</Text>, 68]])('divider follows the optional lead (%s)', (lead, left) => {
  const view = render(<SelectableRow variant="checkbox" title="Child" lead={lead} position="first" selected={false} />);
  expect(StyleSheet.flatten(view.getByTestId('row-divider').props.style).left).toBe(left);
});
