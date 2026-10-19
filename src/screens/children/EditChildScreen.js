import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { colors, spacing, borderRadius, tints } from '../../constants/colors';
import BrandButton from '../../components/common/BrandButton';
import SurfaceCard from '../../components/common/SurfaceCard';
import TextField from '../../components/common/TextField';
import { useHeaderHairline } from '../../components/common/ScreenHeader';
import { useToast } from '../../context/ToastContext';
import { typeRoles } from '../../constants/typography';
import { useChildren } from '../../context/ChildrenContext';
import { useClasses } from '../../context/ClassesContext';
import { GENDER_OPTIONS } from '../../constants/options';
import GroupPickerBottomSheet from '../../components/children/GroupPickerBottomSheet';
import { compareGroups, getGroupColor } from '../../utils/groupHelpers';
import { NO_TEXT_SUGGESTIONS } from '../../constants/textInputProps';
import ChipSelector from '../../components/forms/ChipSelector';
import SelectField from '../../components/common/SelectField';
import SelectSheet from '../../components/common/SelectSheet';
import { READING_LEVELS } from '../../constants/literacyConstants';

const READING_LEVEL_OPTIONS = READING_LEVELS.map(level => ({ key: level, label: level }));
const NO_CLASS_OPTION_KEY = '__no_class__';

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
  const [readingLevel, setReadingLevel] = useState(null);
  const [groupPickerVisible, setGroupPickerVisible] = useState(false);
  const [classPickerVisible, setClassPickerVisible] = useState(false);
  const [readingLevelPickerVisible, setReadingLevelPickerVisible] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  const onScroll = useHeaderHairline();
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

    const sortedGroups = [...groups].sort(compareGroups);
    const groupIndex = sortedGroups.findIndex(g => g.id === membership.group_id);
    return { group: sortedGroups[groupIndex], groupIndex };
  }, [childId, groups, childrenGroups]);

  const { group: currentGroup, groupIndex } = getChildGroup();
  const colorScheme = currentGroup ? getGroupColor(groupIndex) : null;

  // Load child data on mount
  useEffect(() => {
    if (initialized) return;

    if (child) {
      setFirstName(child.first_name || '');
      setLastName(child.last_name || '');
      setAge(child.age ? child.age.toString() : '');
      setGender(child.gender || '');
      setReadingLevel(child.reading_level || null);
      setInitialized(true);
    } else {
      toast.show({ message: 'Child not found', tone: 'error', duration: 3000 });
      setInitialized(true);
      navigation.goBack();
    }
  }, [child, initialized, navigation, toast]);

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
        reading_level: readingLevel,
      });

      if (result.success) {
        navigation.goBack();
      } else {
        toast.show({ message: 'Error updating child', tone: 'error', duration: 3000 });
      }
    } catch (error) {
      console.error('Error updating child:', error);
      toast.show({ message: 'Error updating child', tone: 'error', duration: 3000 });
    } finally {
      setLoading(false);
    }
  };

  const handleClassSelect = async (selectedClassKey) => {
    setClassPickerVisible(false);
    const classId = selectedClassKey === NO_CLASS_OPTION_KEY ? null : selectedClassKey;
    if (classId === (child?.class_id || null)) return;
    const result = await updateChild(childId, { class_id: classId });
    if (result.success) {
      toast.show({ message: 'Class updated', tone: 'success', duration: 3000 });
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Child',
      'Are you sure you want to remove this child?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const result = await deleteChild(childId);
            if (result.success) {
              navigation.goBack();
            } else {
              toast.show({ message: 'Error deleting child', tone: 'error', duration: 3000 });
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
      <ScrollView contentContainerStyle={styles.scrollContent} onScroll={onScroll} scrollEventThrottle={16}>
        {/* Class info (tappable to change) */}
        <TouchableOpacity
          onPress={() => setClassPickerVisible(true)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Choose class for ${child.first_name} ${child.last_name}`}
        >
          <SurfaceCard style={childClass ? styles.classInfoCard : styles.classInfoCardEmpty}>
            <View style={styles.classCardRow}>
              <View style={{ flex: 1 }}>
                <Text variant="labelSmall" style={styles.classLabel}>Class</Text>
                {childClass ? (
                  <>
                    <Text variant="titleMedium">{childClass.name}</Text>
                    <Text variant="bodySmall" style={styles.classDetail}>
                      {childSchool?.name || 'Unknown school'} • {childClass.grade} • {childClass.teacher}
                    </Text>
                  </>
                ) : (
                  <Text variant="bodyMedium" style={styles.classDetailEmpty}>
                    No class assigned — tap to choose
                  </Text>
                )}
              </View>
              <Text style={styles.classChevron}>▾</Text>
            </View>
          </SurfaceCard>
        </TouchableOpacity>

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
            testID="edit-child-gender"
          />

          <View style={styles.readingLevelField}>
            <SelectField
              label="Current Reading Level"
              value={readingLevel}
              placeholder="Not set"
              onPress={() => setReadingLevelPickerVisible(true)}
              accessibilityLabel={`Choose current reading level for ${child.first_name} ${child.last_name}`}
            />
          </View>
          <Text variant="bodySmall" style={styles.readingLevelHelper}>
            This level pre-fills the next literacy session and changes when the child progresses.
          </Text>

          {/* Group picker field */}
          <View style={styles.groupField}>
            <Text variant="labelSmall" style={styles.groupFieldLabel}>Group</Text>
            <TouchableOpacity
              style={[
                styles.groupFieldInput,
                currentGroup && styles.groupFieldSelected,
              ]}
              onPress={() => setGroupPickerVisible(true)}
              accessibilityRole="button"
              accessibilityLabel={`Choose group for ${child.first_name} ${child.last_name}`}
            >
              {currentGroup ? (
                <View style={styles.groupFieldValue}>
                  <View style={[styles.groupDot, { backgroundColor: colorScheme.text }]} />
                  <Text style={[styles.groupFieldText, styles.groupFieldTextSelected]}>
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
          <BrandButton
            onPress={handleSubmit}
            loading={loading}
            disabled={loading}
            style={styles.button}
            variant="primary" size="lg" label="Save changes"
          />
        </SurfaceCard>

        {/* Delete Button */}
        <BrandButton
          onPress={handleDelete}
          style={styles.deleteButton}
          icon="trash-outline"
          variant="destructiveQuiet" size="lg" label="Delete child"
        />
      </ScrollView>

      {/* Group Picker Bottom Sheet */}
      <GroupPickerBottomSheet
        visible={groupPickerVisible}
        onDismiss={() => setGroupPickerVisible(false)}
        childId={childId}
        childName={`${child.first_name} ${child.last_name}`}
        currentGroupId={currentGroup?.id || null}
        onGroupChanged={() => setRefreshKey(k => k + 1)}
      />

      <SelectSheet
        visible={classPickerVisible}
        onDismiss={() => setClassPickerVisible(false)}
        title="Choose Class"
        subtitle={`${child.first_name} ${child.last_name}`}
        dismissLabel="Dismiss class picker"
        options={[
          {
            key: NO_CLASS_OPTION_KEY,
            label: 'No class',
            description: 'Remove the current class assignment',
            accessibilityLabel: 'Select no class',
          },
          ...classes.map(cls => {
            const school = schools.find(item => item.id === cls.school_id);
            return {
              key: cls.id,
              label: cls.name,
              description: `${school?.name || 'Unknown school'} • ${cls.grade} • ${cls.teacher}`,
              accessibilityLabel: `Select class ${cls.name}`,
            };
          }),
        ]}
        selectedKey={child?.class_id || NO_CLASS_OPTION_KEY}
        onSelect={handleClassSelect}
        maxHeight="60%"
      />

      <SelectSheet
        visible={readingLevelPickerVisible}
        onDismiss={() => setReadingLevelPickerVisible(false)}
        title="Current Reading Level"
        subtitle={`${child.first_name} ${child.last_name}`}
        dismissLabel="Dismiss reading level picker"
        options={READING_LEVEL_OPTIONS}
        selectedKey={readingLevel}
        onSelect={setReadingLevel}
        maxHeight="70%"
      />
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
  classInfoCardEmpty: {
    backgroundColor: colors.warningBg,
    marginBottom: spacing.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.warning,
  },
  classCardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  classChevron: {
    color: colors.primary,
    ...typeRoles.textBodyL,
    marginLeft: spacing.sm,
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
  classDetailEmpty: {
    color: colors.warningText,
    marginTop: 2,
  },
  card: {
    backgroundColor: colors.surface,
    marginBottom: spacing.md,
  },
  input: {
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
  },
  fieldLabel: {
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  readingLevelField: {
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  readingLevelHelper: {
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  groupField: {
    marginBottom: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.red50,
    borderRadius: borderRadius.sm,
    borderWidth: 1.5,
    borderColor: colors.red100,
  },
  groupFieldLabel: {
    color: colors.primary,
    ...typeRoles.textMetaStrong,
    marginBottom: spacing.xs,
  },
  groupFieldInput: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: tints.control,
    borderRadius: 6,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  groupFieldSelected: {
    borderWidth: 2,
    borderColor: colors.text,
  },
  groupFieldTextSelected: {
    ...typeRoles.textOptionSelected,
    color: colors.text,
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
    ...typeRoles.textSmall,
  },
  groupFieldPlaceholder: {
    ...typeRoles.textSmall,
    color: colors.textSecondary,
  },
  groupFieldChevron: {
    color: colors.primary,
    ...typeRoles.textSmall,
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
  },
});
