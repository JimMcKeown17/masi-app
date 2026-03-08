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
import { useClasses } from '../../context/ClassesContext';
import { GRADES, HOME_LANGUAGES } from '../../constants/options';

export default function CreateClassScreen({ navigation }) {
  const { schools, addClass } = useClasses();

  const [schoolId, setSchoolId] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [grade, setGrade] = useState('');
  const [className, setClassName] = useState('');
  const [teacher, setTeacher] = useState('');
  const [homeLanguage, setHomeLanguage] = useState('');

  const [schoolDialogVisible, setSchoolDialogVisible] = useState(false);
  const [gradeDialogVisible, setGradeDialogVisible] = useState(false);
  const [languageDialogVisible, setLanguageDialogVisible] = useState(false);

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
      const result = await addClass({
        name: className.trim(),
        grade,
        teacher: teacher.trim(),
        home_language: homeLanguage,
        school_id: schoolId,
      });

      if (result.success) {
        setSnackbar({ visible: true, message: 'Class created successfully' });
        setTimeout(() => navigation.goBack(), 1500);
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
            <Text variant="titleLarge" style={styles.title}>
              Create New Class
            </Text>

            {noSchools && (
              <Text variant="bodySmall" style={styles.warningText}>
                Connect to the internet to load schools before creating a class.
              </Text>
            )}

            {/* School picker */}
            <TextInput
              label="School *"
              value={schoolName}
              mode="outlined"
              style={styles.input}
              editable={false}
              right={<TextInput.Icon icon="chevron-down" onPress={() => !noSchools && setSchoolDialogVisible(true)} />}
              onPressIn={() => !noSchools && setSchoolDialogVisible(true)}
              error={!!errors.school}
            />
            {errors.school && <HelperText type="error">{errors.school}</HelperText>}

            {/* Grade picker */}
            <TextInput
              label="Grade *"
              value={grade}
              mode="outlined"
              style={styles.input}
              editable={false}
              right={<TextInput.Icon icon="chevron-down" onPress={() => setGradeDialogVisible(true)} />}
              onPressIn={() => setGradeDialogVisible(true)}
              error={!!errors.grade}
            />
            {errors.grade && <HelperText type="error">{errors.grade}</HelperText>}

            {/* Class Name */}
            <TextInput
              label="Class Name *"
              value={className}
              onChangeText={setClassName}
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
              error={!!errors.teacher}
              mode="outlined"
              style={styles.input}
            />
            {errors.teacher && <HelperText type="error">{errors.teacher}</HelperText>}

            {/* Home Language picker */}
            <TextInput
              label="Home Language *"
              value={homeLanguage}
              mode="outlined"
              style={styles.input}
              editable={false}
              right={<TextInput.Icon icon="chevron-down" onPress={() => setLanguageDialogVisible(true)} />}
              onPressIn={() => setLanguageDialogVisible(true)}
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

      {/* School Dialog */}
      <Portal>
        <Dialog visible={schoolDialogVisible} onDismiss={() => setSchoolDialogVisible(false)}>
          <Dialog.Title>Select School</Dialog.Title>
          <Dialog.ScrollArea style={styles.dialogScrollArea}>
            <ScrollView>
              <RadioButton.Group
                onValueChange={(value) => {
                  const school = schools.find(s => s.id === value);
                  setSchoolId(value);
                  setSchoolName(school?.name || '');
                  setSchoolDialogVisible(false);
                }}
                value={schoolId}
              >
                {schools.map(s => (
                  <RadioButton.Item key={s.id} label={s.name} value={s.id} />
                ))}
              </RadioButton.Group>
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setSchoolDialogVisible(false)}>Cancel</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Grade Dialog */}
      <Portal>
        <Dialog visible={gradeDialogVisible} onDismiss={() => setGradeDialogVisible(false)}>
          <Dialog.Title>Select Grade</Dialog.Title>
          <Dialog.Content>
            <RadioButton.Group
              onValueChange={(value) => {
                setGrade(value);
                setGradeDialogVisible(false);
              }}
              value={grade}
            >
              {GRADES.map(g => (
                <RadioButton.Item key={g} label={g} value={g} />
              ))}
            </RadioButton.Group>
          </Dialog.Content>
        </Dialog>
      </Portal>

      {/* Home Language Dialog */}
      <Portal>
        <Dialog visible={languageDialogVisible} onDismiss={() => setLanguageDialogVisible(false)}>
          <Dialog.Title>Select Home Language</Dialog.Title>
          <Dialog.Content>
            <RadioButton.Group
              onValueChange={(value) => {
                setHomeLanguage(value);
                setLanguageDialogVisible(false);
              }}
              value={homeLanguage}
            >
              {HOME_LANGUAGES.map(lang => (
                <RadioButton.Item key={lang} label={lang} value={lang} />
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
  dialogScrollArea: {
    maxHeight: 300,
  },
  warningText: {
    color: colors.error,
    marginBottom: spacing.md,
  },
});
