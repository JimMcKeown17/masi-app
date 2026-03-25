import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert, TouchableOpacity } from 'react-native';
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
import { colors, spacing, borderRadius } from '../../constants/colors';
import { useChildren } from '../../context/ChildrenContext';
import { useClasses } from '../../context/ClassesContext';
import { GENDERS } from '../../constants/options';
import GroupPickerBottomSheet, { getGroupColor } from '../../components/children/GroupPickerBottomSheet';

export default function EditChildScreen({ route, navigation }) {
  const { childId } = route.params;
  const { children, groups, childrenGroups, updateChild, deleteChild } = useChildren();
  const { classes, schools } = useClasses();

  const child = children.find(c => c.id === childId);
  const childClass = classes.find(c => c.id === child?.class_id);
  const childSchool = schools.find(s => s.id === childClass?.school_id);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [genderDialogVisible, setGenderDialogVisible] = useState(false);
  const [groupPickerVisible, setGroupPickerVisible] = useState(false);

  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });
  const [, setRefreshKey] = useState(0);

  /**
   * Get the current group for this child (filtered to this user's groups).
   */
  const getChildGroup = useCallback(() => {
    const groupIds = new Set(groups.map(g => g.id));
    const membership = childrenGroups.find(
      cg => cg.child_id === childId && groupIds.has(cg.group_id)
    );
    if (!membership) return { group: null, groupIndex: -1 };

    const sortedGroups = [...groups].sort((a, b) => a.name.localeCompare(b.name));
    const groupIndex = sortedGroups.findIndex(g => g.id === membership.group_id);
    return { group: sortedGroups[groupIndex], groupIndex };
  }, [childId, groups, childrenGroups]);

  const { group: currentGroup, groupIndex } = getChildGroup();
  const colorScheme = currentGroup ? getGroupColor(groupIndex) : null;

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

            {/* Group picker field */}
            <View style={styles.groupField}>
              <Text variant="labelSmall" style={styles.groupFieldLabel}>Group</Text>
              <TouchableOpacity
                style={[
                  styles.groupFieldInput,
                  currentGroup && { borderColor: colorScheme.text },
                ]}
                onPress={() => setGroupPickerVisible(true)}
              >
                {currentGroup ? (
                  <View style={styles.groupFieldValue}>
                    <View style={[styles.groupDot, { backgroundColor: colorScheme.text }]} />
                    <Text style={[styles.groupFieldText, { color: colorScheme.text, fontWeight: '600' }]}>
                      {currentGroup.name}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.groupFieldPlaceholder}>No group assigned</Text>
                )}
                <Text style={styles.groupFieldChevron}>▾</Text>
              </TouchableOpacity>
              <Text variant="bodySmall" style={styles.groupFieldHelper}>
                Tap to change group or create a new one
              </Text>
            </View>

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

      {/* Group Picker Bottom Sheet */}
      <GroupPickerBottomSheet
        visible={groupPickerVisible}
        onDismiss={() => setGroupPickerVisible(false)}
        childId={childId}
        childName={`${child.first_name} ${child.last_name}`}
        currentGroupId={currentGroup?.id || null}
        onGroupChanged={() => setRefreshKey(k => k + 1)}
      />

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
  input: {
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
  },
  groupField: {
    marginBottom: spacing.sm,
    padding: spacing.md,
    backgroundColor: '#F0F7FF',
    borderRadius: borderRadius.sm,
    borderWidth: 1.5,
    borderColor: '#BBDEFB',
  },
  groupFieldLabel: {
    color: colors.primary,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  groupFieldInput: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 6,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  groupFieldValue: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  groupDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: spacing.sm,
  },
  groupFieldText: {
    fontSize: 14,
  },
  groupFieldPlaceholder: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  groupFieldChevron: {
    color: colors.primary,
    fontSize: 14,
  },
  groupFieldHelper: {
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  button: {
    marginTop: spacing.lg,
  },
  deleteButton: {
    marginBottom: spacing.lg,
    borderColor: colors.error,
  },
});
