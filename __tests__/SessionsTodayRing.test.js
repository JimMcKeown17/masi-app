import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import SessionsTodayRing from '../src/components/sessions/SessionsTodayRing';
import { fontFamilies, typeRoles } from '../src/constants/typography';

describe('SessionsTodayRing', () => {
  test('below target: shows the count inside the ring and is labelled below-target', () => {
    const { getByText, getByLabelText } = render(
      <SessionsTodayRing goal={{ target: 3, ceiling: 5, count: 0, state: 'below' }} />
    );

    expect(getByText('0')).toBeTruthy(); // the live count renders inside the ring
    expect(StyleSheet.flatten(getByText('0').props.style)).toEqual(expect.objectContaining({
      ...typeRoles.display2XL,
      fontFamily: fontFamilies.textBold,
    }));
    expect(StyleSheet.flatten(getByText('of 3').props.style)).toEqual(expect.objectContaining(typeRoles.textCaption));
    expect(getByLabelText(/0 of 3 sessions today\. below target\./i)).toBeTruthy();
  });

  test('met: shows the count and is labelled goal-met', () => {
    const { getByText, getByLabelText } = render(
      <SessionsTodayRing goal={{ target: 3, ceiling: 5, count: 3, state: 'met' }} />
    );

    expect(getByText('3')).toBeTruthy();
    expect(getByLabelText(/3 of 3 sessions today\. goal met\./i)).toBeTruthy();
  });

  test('exceeded: shows the count and is labelled past-the-ceiling', () => {
    const { getByText, getByLabelText } = render(
      <SessionsTodayRing goal={{ target: 3, ceiling: 5, count: 6, state: 'exceeded' }} />
    );

    expect(getByText('6')).toBeTruthy();
    expect(getByLabelText(/6 sessions today\. above the usual maximum of 5\./i)).toBeTruthy();
  });

  test('no_target (1000 Stories): shows the count as activity, with no target number', () => {
    const { getByText, getByLabelText, queryByText } = render(
      <SessionsTodayRing goal={{ target: null, ceiling: null, count: 2, state: 'no_target' }} />
    );

    expect(getByText('2')).toBeTruthy();               // activity count still shown
    expect(queryByText(/^of /)).toBeNull();            // but NO "of <target>" denominator
    expect(getByLabelText('2 sessions today.')).toBeTruthy(); // label promises no goal
  });
});
