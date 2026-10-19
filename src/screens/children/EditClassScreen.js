import { useScrollBottomPadding } from '../../hooks/useScrollBottomPadding';
import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';

import { colors, spacing } from '../../constants/colors';
import BrandButton from '../../components/common/BrandButton';
import SurfaceCard from '../../components/common/SurfaceCard';
import TextField from '../../components/common/TextField';
import SelectField from '../../components/common/SelectField';
import { useHeaderHairline } from '../../components/common/ScreenHeader';
import { useToast } from '../../context/ToastContext';
import { useClasses } from '../../context/ClassesContext';
import { GRADES, HOME_LANGUAGES } from '../../constants/options';
import { NO_TEXT_SUGGESTIONS } from '../../constants/textInputProps';
import SelectSheet from '../../components/common/SelectSheet';

export default function EditClassScreen({ route, navigation }) {
  const { classId } = route.params;
  const { schools, classes, updateClass, deleteClass, getChildrenInClass } = useClasses();

  const classItem = classes.find(c => c.id === classId);
  const childrenInClass = getChildrenInClass(classId);

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
  const toast = useToast();
  const onScroll = useHeaderHairline();
  const paddingBottom = useScrollBottomPadding(spacing.md);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (initialized) return;

    if (classItem) {
      setSchoolId(classItem.school_id || '');
      const school = schools.find(s => s.id === classItem.school_id);
      setSchoolName(school?.name || '');
      setGrade(classItem.grade || '');
      setClassName(classItem.name || '');
      setTeacher(classItem.teacher || '');
      setHomeLanguage(classItem.home_language || '');
      setInitialized(true);
    } else {
      toast.show({ message: 'Class not found', tone: 'error', duration: 3000 });
      setInitialized(true);
      navigation.goBack();
    }
  }, [classItem, initialized, navigation, schools, toast]);

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
      const result = await updateClass(classId, {
        name: className.trim(),
        grade,
        teacher: teacher.trim(),
        home_language: homeLanguage,
        school_id: schoolId,
      });

      if (result.success) {
        navigation.goBack();
      } else {
        toast.show({ message: 'Error updating class', tone: 'error', duration: 3000 });
      }
    } catch (error) {
      console.error('Error updating class:', error);
      toast.show({ message: 'Error updating class', tone: 'error', duration: 3000 });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    const childCount = childrenInClass.length;
    const message = childCount > 0
      ? `This class has ${childCount} ${childCount === 1 ? 'child' : 'children'}. They will become unassigned.`
      : 'Are you sure you want to delete this class?';

    Alert.alert('Delete Class', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const result = await deleteClass(classId);
          if (result.success) {
            navigation.goBack();
          } else {
            toast.show({ message: 'Error deleting class', tone: 'error', duration: 3000 });
          }
        },
      },
    ]);
  };

  if (!classItem) return null;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom }]} onScroll={onScroll} scrollEventThrottle={16}>
        <SurfaceCard style={styles.card}>
          {/* School picker */}
          <View style={styles.input}>
            <SelectField
              label="School *"
              value={schoolName}
              onPress={() => schools.length > 0 && setSchoolPickerVisible(true)}
              error={errors.school}
              placeholder=""
            />
          </View>

          {/* Grade picker */}
          <View style={styles.input}>
            <SelectField
              label="Grade *"
              value={grade}
              onPress={() => setGradePickerVisible(true)}
              error={errors.grade}
              placeholder=""
            />
          </View>

          {/* Class Name */}
          <View style={styles.input}>
            <TextField
              label="Class Name *"
              value={className}
              onChangeText={setClassName}
              {...NO_TEXT_SUGGESTIONS}
              placeholder='e.g. “1A”, “2B”'
              error={errors.className}
            />
          </View>

          {/* Teacher */}
          <View style={styles.input}>
            <TextField
              label="Teacher *"
              value={teacher}
              onChangeText={setTeacher}
              {...NO_TEXT_SUGGESTIONS}
              error={errors.teacher}
            />
          </View>

          {/* Home Language picker */}
          <View style={styles.input}>
            <SelectField
              label="Home language *"
              value={homeLanguage}
              onPress={() => setLanguagePickerVisible(true)}
              error={errors.homeLanguage}
              placeholder=""
            />
          </View>

          {/* Submit */}
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
          variant="destructiveQuiet" size="lg" label="Delete class"
        />
      </ScrollView>

      <SelectSheet
        visible={schoolPickerVisible}
        onDismiss={() => setSchoolPickerVisible(false)}
        title="Select school"
        dismissLabel="Dismiss school picker"
        searchable
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
        title="Select grade"
        dismissLabel="Dismiss grade picker"
        options={GRADES.map(value => ({ key: value, label: value }))}
        selectedKey={grade}
        onSelect={setGrade}
      />

      <SelectSheet
        visible={languagePickerVisible}
        onDismiss={() => setLanguagePickerVisible(false)}
        title="Select home language"
        dismissLabel="Dismiss home language picker"
        options={HOME_LANGUAGES.map(value => ({ key: value, label: value }))}
        selectedKey={homeLanguage}
        onSelect={setHomeLanguage}
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
  card: {
    backgroundColor: colors.surface,
    marginBottom: spacing.md,
  },
  input: {
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
  },
  button: {
    marginTop: spacing.lg,
  },
  deleteButton: {
    marginBottom: spacing.lg,
  },
});
