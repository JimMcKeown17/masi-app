import BrandButton from '../common/BrandButton';
import React from 'react';
import { Alert } from 'react-native';

export default function EndAssessmentButton({ onEnd }) {
  const handlePress = () => {
    Alert.alert(
      'End Assessment?',
      'End the assessment now and record current results?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'End', style: 'destructive', onPress: onEnd },
      ]
    );
  };

  return (
    <BrandButton
      variant="tertiary" size="sm"
      onPress={handlePress}
      label="End assessment"
    />
  );
}
