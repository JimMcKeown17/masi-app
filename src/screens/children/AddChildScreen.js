import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Text } from 'react-native-paper';
import { colors, spacing } from '../../constants/colors';
import BrandButton from '../../components/common/BrandButton';
import SurfaceCard from '../../components/common/SurfaceCard';
import TextField from '../../components/common/TextField';
import { useHeaderHairline } from '../../components/common/ScreenHeader';
import { useToast } from '../../context/ToastContext';
import { typeRoles } from '../../constants/typography';
import { useChildren } from '../../context/ChildrenContext';
import { useClasses } from '../../context/ClassesContext';
import { GENDER_OPTIONS } from '../../constants/options';
import { NO_TEXT_SUGGESTIONS } from '../../constants/textInputProps';
import ChipSelector from '../../components/forms/ChipSelector';

export default function AddChildScreen({ route, navigation }) {
  const { classId } = route.params;
  const { addChild } = useChildren();
  const { classes, schools } = useClasses();

  const classItem = classes.find(c => c.id === classId);
  const school = schools.find(s => s.id === classItem?.school_id);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');

  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  const onScroll = useHeaderHairline();

  const validate = () => {
    const newErrors = {};

    if (!firstName.trim()) {
      newErrors.firstName = 'First name is required';
    }

    if (!lastName.trim()) {
      newErrors.lastName = 'Last name is required';
    }

    if (age && (isNaN(parseInt(age)) || parseInt(age) < 1 || parseInt(age) > 20)) {
      newErrors.age = 'Age must be between 1 and 20';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) {
      return;
    }

    setLoading(true);
    try {
      const result = await addChild({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        age: age ? parseInt(age) : null,
        gender: gender || null,
        class_id: classId,
      });

      if (result.success) {
        navigation.goBack();
      } else {
        toast.show({ message: 'Error adding child', tone: 'error', duration: 3000 });
      }
    } catch (error) {
      console.error('Error adding child:', error);
      toast.show({ message: 'Error adding child', tone: 'error', duration: 3000 });
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} onScroll={onScroll} scrollEventThrottle={16}>
        {/* Class info banner */}
        {classItem && (
          <SurfaceCard style={styles.classInfoCard}>
            <Text variant="labelSmall" style={styles.classLabel}>Adding to class</Text>
            <Text variant="titleMedium">{classItem.name}</Text>
            <Text variant="bodySmall" style={styles.classDetail}>
              {school?.name || 'Unknown school'} • {classItem.grade} • {classItem.teacher}
            </Text>
          </SurfaceCard>
        )}

        <SurfaceCard style={styles.card}>
          {/* First Name */}
          <View style={styles.input}>
            <TextField
              label="First Name *"
              value={firstName}
              onChangeText={setFirstName}
              {...NO_TEXT_SUGGESTIONS}
              error={errors.firstName}
            />
          </View>

          {/* Last Name */}
          <View style={styles.input}>
            <TextField
              label="Last Name *"
              value={lastName}
              onChangeText={setLastName}
              {...NO_TEXT_SUGGESTIONS}
              error={errors.lastName}
            />
          </View>

          {/* Age */}
          <View style={styles.input}>
            <TextField
              label="Age"
              value={age}
              onChangeText={setAge}
              {...NO_TEXT_SUGGESTIONS}
              error={errors.age}
              keyboardType="numeric"
            />
          </View>

          <Text variant="labelLarge" style={styles.fieldLabel}>Gender</Text>
          <ChipSelector
            options={GENDER_OPTIONS}
            value={gender}
            onChange={setGender}
            testID="add-child-gender"
          />

          {/* Submit Button */}
          <BrandButton
            onPress={handleSubmit}
            loading={loading}
            disabled={loading}
            style={styles.button}
            variant="primary" size="lg" label="Add child"
          />
        </SurfaceCard>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: spacing.md,
  },
  classInfoCard: {
    backgroundColor: colors.red50,
    marginBottom: spacing.md,
  },
  classLabel: {
    color: colors.primary,
    textTransform: 'uppercase',
    ...typeRoles.textLabel,
  },
  classDetail: {
    color: colors.textSecondary,
    marginTop: 2,
  },
  card: {
    backgroundColor: colors.surface,
  },
  input: {
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
  },
  fieldLabel: {
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  button: {
    marginTop: spacing.lg,
  },
});
