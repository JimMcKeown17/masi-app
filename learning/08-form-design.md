# Chapter 8: Form Design - Job-Specific Session Recording

## The Challenge

Four different job titles require four different session forms:
- **Literacy Coach**: Letters, phonics, reading levels
- **Numeracy Coach**: Numbers, operations, math concepts
- **ZZ Coach**: [Specific activities for ZZ program]
- **Yeboneer**: [Youth development activities]

**Design question**: One dynamic form or four separate components?

**Decision**: Four separate form components with a router

**Why?**
- **Maintainability**: Each form is independently updatable
- **Type safety** (even in JS): Clear structure for each session type
- **No conditionals**: Cleaner code than `if (jobTitle === 'Literacy')...` everywhere
- **Specialization**: Each form can have custom validation, layout, components

**Router pattern**:
```javascript
const SessionFormScreen = () => {
  const { user } = useAuth();

  const FormComponent = {
    'Literacy Coach': LiteracySessionForm,
    'Numeracy Coach': NumeracySessionForm,
    'ZZ Coach': ZZCoachSessionForm,
    'Yeboneer': YeboneerSessionForm
  }[user.job_title];

  return <FormComponent />;
};
```

**Base form pattern**:

Each form uses react-hook-form for state management:
```javascript
const LiteracySessionForm = () => {
  const { control, handleSubmit } = useForm();

  const onSubmit = async (data) => {
    // Save to AsyncStorage
    const sessionId = uuid();
    await AsyncStorage.setItem(`session_${sessionId}`, JSON.stringify({
      id: sessionId,
      ...data,
      synced: false,
      job_title: 'Literacy Coach'
    }));

    // Optimistically update UI
    // Queue for sync
  };

  return (
    <Controller
      control={control}
      name="lettersWorkedOn"
      render={({ field }) => (
        <TextInput
          label="Letters Worked On"
          value={field.value}
          onChangeText={field.onChange}
        />
      )}
    />
  );
};
```

---

**Last Updated**: 2026-01-27
