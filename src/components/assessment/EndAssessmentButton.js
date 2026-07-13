import React from 'react';
import { Alert } from 'react-native';
import { Button } from 'react-native-paper';
import { colors } from '../../constants/colors';

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
    <Button
      mode="text"
      onPress={handlePress}
      textColor={colors.emphasis}
      compact
    >
      End Assessment
    </Button>
  );
}
