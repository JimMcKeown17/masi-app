import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import {
  Text,
  TextInput,
  Button,
  Card,
  HelperText,
  Snackbar,
  Chip,
  Portal,
  Dialog,
  RadioButton,
} from 'react-native-paper';
import { colors, spacing } from '../../constants/colors';
import { useChildren } from '../../context/ChildrenContext';
import { useClasses } from '../../context/ClassesContext';
import { GENDERS } from '../../constants/options';

export default function EditChildScreen({ route, navigation }) {
  const { childId } = route.params;
  const { children, updateChild, deleteChild, getGroupsForChild } = useChildren();
  const { classes, schools } = useClasses();

  const child = children.find(c => c.id === childId);
  const childGroups = getGroupsForChild(childId);
  const childClass = classes.find(c => c.id === child?.class_id);
  const childSchool = schools.find(s => s.id === childClass?.school_id);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [genderDialogVisible, setGenderDialogVisible] = useState(false);

  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });

  // Load child data on mount
  useEffect(() => {
    if (child) {
      setFirstName(child.first_name || '');
      setLastName(child.last_name || '');
      setAge(child.age ? child.age.toString() : '');
      setGender(child.gender || '');
    } else {
      setSnackbar({ visible: true, message: 'Child not found' });
      setTimeout(() => navigation.goBack(), 1500);
    }
  }, [child]);

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
      const result = await updateChild(childId, {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        age: age ? parseInt(age) : null,
        gender: gender || null,
      });

      if (result.success) {
        setSnackbar({ visible: true, message: 'Child updated successfully' });
        setTimeout(() => navigation.goBack(), 1500);
      } else {
        setSnackbar({ visible: true, message: 'Error updating child' });
      }
    } catch (error) {
      console.error('Error updating child:', error);
      setSnackbar({ visible: true, message: 'Error updating child' });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Child',
      'Are you sure? This will remove the child from all groups and sessions.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const result = await deleteChild(childId);
            if (result.success) {
              setSnackbar({ visible: true, message: 'Child deleted' });
              setTimeout(() => navigation.goBack(), 1000);
            } else {
              setSnackbar({ visible: true, message: 'Error deleting child' });
            }
          },
        },
      ]
    );
  };

  if (!child) {
    return null;
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Class info (read-only) */}
        {childClass && (
          <Card style={styles.classInfoCard}>
            <Card.Content>
              <Text variant="labelSmall" style={styles.classLabel}>Class</Text>
              <Text variant="titleMedium">{childClass.name}</Text>
              <Text variant="bodySmall" style={styles.classDetail}>
                {childSchool?.name || 'Unknown school'} • {childClass.grade} • {childClass.teacher}
              </Text>
            </Card.Content>
          </Card>
        )}

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleLarge" style={styles.title}>
              Edit Child
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
              Save Changes
            </Button>
          </Card.Content>
        </Card>

        {/* Group Memberships */}
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Group Memberships
            </Text>
            {childGroups.length > 0 ? (
              <View style={styles.chipContainer}>
                {childGroups.map(group => (
                  <Chip key={group.id} style={styles.chip}>
                    {group.name}
                  </Chip>
                ))}
              </View>
            ) : (
              <Text variant="bodySmall" style={styles.emptyText}>
                Not in any groups
              </Text>
            )}
            <Button
              mode="outlined"
              onPress={() => navigation.navigate('GroupManagement')}
              style={styles.groupButton}
              icon="folder-multiple"
            >
              Manage Groups
            </Button>
          </Card.Content>
        </Card>

        {/* Delete Button */}
        <Button
          mode="outlined"
          onPress={handleDelete}
          style={styles.deleteButton}
          textColor={colors.error}
          icon="delete"
        >
          Delete Child
        </Button>
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
    marginBottom: spacing.md,
  },
  title: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    marginBottom: spacing.md,
  },
  input: {
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
  },
  button: {
    marginTop: spacing.lg,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: spacing.md,
  },
  chip: {
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  emptyText: {
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  groupButton: {
    marginTop: spacing.sm,
  },
  deleteButton: {
    marginBottom: spacing.lg,
    borderColor: colors.error,
  },
});
