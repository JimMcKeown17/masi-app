import { useScrollBottomPadding } from '../../hooks/useScrollBottomPadding';
import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Text } from 'react-native-paper';
import { colors, spacing } from '../../constants/colors';
import BrandButton from '../../components/common/BrandButton';
import SurfaceCard from '../../components/common/SurfaceCard';
import TextField from '../../components/common/TextField';
import SelectField from '../../components/common/SelectField';
import { useHeaderHairline } from '../../components/common/ScreenHeader';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { useClasses } from '../../context/ClassesContext';
import { GRADES, HOME_LANGUAGES } from '../../constants/options';
import { NO_TEXT_SUGGESTIONS } from '../../constants/textInputProps';
import SelectSheet from '../../components/common/SelectSheet';

export default function CreateClassScreen({ route, navigation }) {
  const { profile } = useAuth();
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
  const toast = useToast();
  const onScroll = useHeaderHairline();
  const paddingBottom = useScrollBottomPadding(spacing.md);
  const schoolTouchedRef = useRef(false);

  useEffect(() => {
    if (schoolTouchedRef.current || schoolId || schoolName || !profile?.schoolId) return;

    const profileSchoolName = profile.schoolName
      || schools.find(school => school.id === profile.schoolId)?.name;
    if (!profileSchoolName) return;

    setSchoolId(profile.schoolId);
    setSchoolName(profileSchoolName);
  }, [profile?.schoolId, profile?.schoolName, schoolId, schoolName, schools]);

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
        toast.show({ message: 'Error creating class', tone: 'error', duration: 3000 });
      }
    } catch (error) {
      console.error('Error creating class:', error);
      toast.show({ message: 'Error creating class', tone: 'error', duration: 3000 });
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
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom }]} onScroll={onScroll} scrollEventThrottle={16}>
        <SurfaceCard style={styles.card}>
          {noSchools && (
            <Text variant="bodySmall" style={styles.warningText}>
              Connect to the internet to load schools before creating a class.
            </Text>
          )}

          {/* School picker */}
          <View style={styles.input}>
            <SelectField
              label="School *"
              value={schoolName}
              onPress={() => !noSchools && setSchoolPickerVisible(true)}
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
            disabled={loading || noSchools}
            style={styles.button}
            variant="primary" size="lg" label="Create class"
          />
        </SurfaceCard>
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
          schoolTouchedRef.current = true;
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
