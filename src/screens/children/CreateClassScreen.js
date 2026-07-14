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
import SectionHeader from '../../components/common/SectionHeader';
import { useClasses } from '../../context/ClassesContext';
import { GRADES, HOME_LANGUAGES } from '../../constants/options';
import { NO_TEXT_SUGGESTIONS } from '../../constants/textInputProps';
import SelectSheet from '../../components/common/SelectSheet';

export default function CreateClassScreen({ route, navigation }) {
  const { schools, addClass } = useClasses();

  const [schoolId, setSchoolId] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [grade, setGrade] = useState('');
  const [className, setClassName] = useState('');
  const [teacher, setTeacher] = useState('');
  const [homeLanguage, setHomeLanguage] = useState('');

  const [schoolPickerVisible, setSchoolPickerVisible] = useState(false);
  const [gradePickerVisible, setGradePickerVisible] = useState(false);
  const [languagePickerVisible, setLanguagePickerVisible] = useState(false);

  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });

  const validate = () => {
    const newErrors = {};
    if (!schoolId) newErrors.school = 'School is required';
    if (!grade) newErrors.grade = 'Grade is required';
    if (!className.trim()) newErrors.className = 'Class name is required';
    if (!teacher.trim()) newErrors.teacher = 'Teacher is required';
    if (!homeLanguage) newErrors.homeLanguage = 'Home language is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setLoading(true);
    try {
      const classData = {
        name: className.trim(),
        grade,
        teacher: teacher.trim(),
        home_language: homeLanguage,
        school_id: schoolId,
      };
      const result = route?.params?.onboarding
        ? await addClass(classData, { onboarding: true })
        : await addClass(classData);

      if (result.success) {
        if (route?.params?.onboarding) {
          navigation.replace('ChildOnboarding', {
            classId: result.classData.id,
          });
        } else {
          navigation.goBack();
        }
      } else {
        setSnackbar({ visible: true, message: 'Error creating class' });
      }
    } catch (error) {
      console.error('Error creating class:', error);
      setSnackbar({ visible: true, message: 'Error creating class' });
    } finally {
      setLoading(false);
    }
  };

  const noSchools = schools.length === 0;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Card style={styles.card}>
          <Card.Content>
            <SectionHeader title="Create New Class" />

            {noSchools && (
              <Text variant="bodySmall" style={styles.warningText}>
                Connect to the internet to load schools before creating a class.
              </Text>
            )}

            {/* School picker */}
            <TextInput
              label="School *"
              value={schoolName}
              {...NO_TEXT_SUGGESTIONS}
              mode="outlined"
              style={styles.input}
              editable={false}
              right={<TextInput.Icon icon="chevron-down" onPress={() => !noSchools && setSchoolPickerVisible(true)} />}
              onPressIn={() => !noSchools && setSchoolPickerVisible(true)}
              error={!!errors.school}
            />
            {errors.school && <HelperText type="error">{errors.school}</HelperText>}

            {/* Grade picker */}
            <TextInput
              label="Grade *"
              value={grade}
              {...NO_TEXT_SUGGESTIONS}
              mode="outlined"
              style={styles.input}
              editable={false}
              right={<TextInput.Icon icon="chevron-down" onPress={() => setGradePickerVisible(true)} />}
              onPressIn={() => setGradePickerVisible(true)}
              error={!!errors.grade}
            />
            {errors.grade && <HelperText type="error">{errors.grade}</HelperText>}

            {/* Class Name */}
            <TextInput
              label="Class Name *"
              value={className}
              onChangeText={setClassName}
              {...NO_TEXT_SUGGESTIONS}
              placeholder='e.g. "1A", "2B"'
              error={!!errors.className}
              mode="outlined"
              style={styles.input}
            />
            {errors.className && <HelperText type="error">{errors.className}</HelperText>}

            {/* Teacher */}
            <TextInput
              label="Teacher *"
              value={teacher}
              onChangeText={setTeacher}
              {...NO_TEXT_SUGGESTIONS}
              error={!!errors.teacher}
              mode="outlined"
              style={styles.input}
            />
            {errors.teacher && <HelperText type="error">{errors.teacher}</HelperText>}

            {/* Home Language picker */}
            <TextInput
              label="Home Language *"
              value={homeLanguage}
              {...NO_TEXT_SUGGESTIONS}
              mode="outlined"
              style={styles.input}
              editable={false}
              right={<TextInput.Icon icon="chevron-down" onPress={() => setLanguagePickerVisible(true)} />}
              onPressIn={() => setLanguagePickerVisible(true)}
              error={!!errors.homeLanguage}
            />
            {errors.homeLanguage && <HelperText type="error">{errors.homeLanguage}</HelperText>}

            {/* Submit */}
            <Button
              mode="contained"
              onPress={handleSubmit}
              loading={loading}
              disabled={loading || noSchools}
              style={styles.button}
            >
              Create Class
            </Button>
          </Card.Content>
        </Card>
      </ScrollView>

      <SelectSheet
        visible={schoolPickerVisible}
        onDismiss={() => setSchoolPickerVisible(false)}
        title="Select School"
        dismissLabel="Dismiss school picker"
        options={schools.map(school => ({ key: school.id, label: school.name }))}
        selectedKey={schoolId}
        onSelect={(value) => {
          const school = schools.find(item => item.id === value);
          setSchoolId(value);
          setSchoolName(school?.name || '');
        }}
        cancelLabel="Cancel"
      />

      <SelectSheet
        visible={gradePickerVisible}
        onDismiss={() => setGradePickerVisible(false)}
        title="Select Grade"
        dismissLabel="Dismiss grade picker"
        options={GRADES.map(value => ({ key: value, label: value }))}
        selectedKey={grade}
        onSelect={setGrade}
      />

      <SelectSheet
        visible={languagePickerVisible}
        onDismiss={() => setLanguagePickerVisible(false)}
        title="Select Home Language"
        dismissLabel="Dismiss home language picker"
        options={HOME_LANGUAGES.map(value => ({ key: value, label: value }))}
        selectedKey={homeLanguage}
        onSelect={setHomeLanguage}
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
  card: {
    backgroundColor: colors.surface,
  },
  input: {
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
  },
  button: {
    marginTop: spacing.lg,
  },
  warningText: {
    color: colors.error,
    marginBottom: spacing.md,
  },
});
