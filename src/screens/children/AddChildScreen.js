import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import {
  Text,
  TextInput,
  Button,
  Card,
  HelperText,
  Snackbar,
} from 'react-native-paper';
import { colors, spacing } from '../../constants/colors';
import { useChildren } from '../../context/ChildrenContext';

export default function AddChildScreen({ navigation }) {
  const { addChild } = useChildren();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [teacher, setTeacher] = useState('');
  const [className, setClassName] = useState('');
  const [age, setAge] = useState('');
  const [school, setSchool] = useState('');

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
        teacher: teacher.trim() || null,
        class: className.trim() || null,
        age: age ? parseInt(age) : null,
        school: school.trim() || null,
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

            {/* Teacher */}
            <TextInput
              label="Teacher"
              value={teacher}
              onChangeText={setTeacher}
              mode="outlined"
              style={styles.input}
            />

            {/* Class */}
            <TextInput
              label="Class"
              value={className}
              onChangeText={setClassName}
              mode="outlined"
              style={styles.input}
            />

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

            {/* School */}
            <TextInput
              label="School"
              value={school}
              onChangeText={setSchool}
              mode="outlined"
              style={styles.input}
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
