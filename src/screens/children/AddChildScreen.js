import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import {
  Text,
  TextInput,
  Button,
  Card,
  HelperText,
  Snackbar,
  Portal,
  Dialog,
  RadioButton,
} from 'react-native-paper';
import { colors, spacing } from '../../constants/colors';
import { useChildren } from '../../context/ChildrenContext';
import { useClasses } from '../../context/ClassesContext';
import { GENDERS } from '../../constants/options';

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
  const [genderDialogVisible, setGenderDialogVisible] = useState(false);

  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });

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
        setSnackbar({ visible: true, message: 'Child added successfully' });
        setTimeout(() => navigation.goBack(), 1500);
      } else {
        setSnackbar({ visible: true, message: 'Error adding child' });
      }
    } catch (error) {
      console.error('Error adding child:', error);
      setSnackbar({ visible: true, message: 'Error adding child' });
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
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Class info banner */}
        {classItem && (
          <Card style={styles.classInfoCard}>
            <Card.Content>
              <Text variant="labelSmall" style={styles.classLabel}>Adding to class</Text>
              <Text variant="titleMedium">{classItem.name}</Text>
              <Text variant="bodySmall" style={styles.classDetail}>
                {school?.name || 'Unknown school'} • {classItem.grade} • {classItem.teacher}
              </Text>
            </Card.Content>
          </Card>
        )}

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleLarge" style={styles.title}>
              Add New Child
            </Text>

            {/* First Name */}
            <TextInput
              label="First Name *"
              value={firstName}
              onChangeText={setFirstName}
              error={!!errors.firstName}
              mode="outlined"
              style={styles.input}
            />
            {errors.firstName && (
              <HelperText type="error">{errors.firstName}</HelperText>
            )}

            {/* Last Name */}
            <TextInput
              label="Last Name *"
              value={lastName}
              onChangeText={setLastName}
              error={!!errors.lastName}
              mode="outlined"
              style={styles.input}
            />
            {errors.lastName && (
              <HelperText type="error">{errors.lastName}</HelperText>
            )}

            {/* Age */}
            <TextInput
              label="Age"
              value={age}
              onChangeText={setAge}
              error={!!errors.age}
              mode="outlined"
              keyboardType="numeric"
              style={styles.input}
            />
            {errors.age && (
              <HelperText type="error">{errors.age}</HelperText>
            )}

            {/* Gender picker */}
            <TextInput
              label="Gender"
              value={gender}
              mode="outlined"
              style={styles.input}
              editable={false}
              right={<TextInput.Icon icon="chevron-down" onPress={() => setGenderDialogVisible(true)} />}
              onPressIn={() => setGenderDialogVisible(true)}
            />

            {/* Submit Button */}
            <Button
              mode="contained"
              onPress={handleSubmit}
              loading={loading}
              disabled={loading}
              style={styles.button}
            >
              Add Child
            </Button>
          </Card.Content>
        </Card>
      </ScrollView>

      {/* Gender Dialog */}
      <Portal>
        <Dialog visible={genderDialogVisible} onDismiss={() => setGenderDialogVisible(false)}>
          <Dialog.Title>Select Gender</Dialog.Title>
          <Dialog.Content>
            <RadioButton.Group
              onValueChange={(value) => {
                setGender(value);
                setGenderDialogVisible(false);
              }}
              value={gender}
            >
              {GENDERS.map(g => (
                <RadioButton.Item key={g} label={g} value={g} />
              ))}
            </RadioButton.Group>
          </Dialog.Content>
        </Dialog>
      </Portal>

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ ...snackbar, visible: false })}
        duration={3000}
      >
        {snackbar.message}
      </Snackbar>
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
    backgroundColor: '#EEF2FF',
    marginBottom: spacing.md,
  },
  classLabel: {
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  classDetail: {
    color: colors.textSecondary,
    marginTop: 2,
  },
  card: {
    backgroundColor: colors.surface,
  },
  title: {
    marginBottom: spacing.md,
  },
  input: {
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
  },
  button: {
    marginTop: spacing.lg,
  },
});
