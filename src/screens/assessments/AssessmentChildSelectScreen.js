import React, { useState } from 'react';
import { View, StyleSheet, FlatList, Pressable } from 'react-native';
import { Text, Searchbar, Portal, Dialog, Button, RadioButton } from 'react-native-paper';
import { useChildren } from '../../context/ChildrenContext';
import { LETTER_SETS } from '../../constants/egraConstants';
import { colors, spacing, borderRadius, shadows } from '../../constants/colors';

export default function AssessmentChildSelectScreen({ navigation }) {
  const { children } = useChildren();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChild, setSelectedChild] = useState(null);
  const [languageDialogVisible, setLanguageDialogVisible] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('english');

  const filteredChildren = children.filter((child) => {
    const query = searchQuery.toLowerCase();
    const fullName = `${child.first_name} ${child.last_name}`.toLowerCase();
    return fullName.includes(query);
  });

  const handleChildPress = (child) => {
    setSelectedChild(child);
    setLanguageDialogVisible(true);
  };

  const handleLanguageConfirm = () => {
    setLanguageDialogVisible(false);
    const letterSet = LETTER_SETS[selectedLanguage];
    navigation.navigate('LetterAssessment', {
      child: selectedChild,
      letterSet,
      attemptNumber: 1,
    });
  };

  const renderChild = ({ item }) => (
    <Pressable
      onPress={() => handleChildPress(item)}
      style={({ pressed }) => [styles.childRow, pressed && styles.childRowPressed]}
    >
      <Text variant="bodyLarge" style={styles.childName}>
        {item.first_name} {item.last_name}
      </Text>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <Searchbar
        placeholder="Search children..."
        value={searchQuery}
        onChangeText={setSearchQuery}
        style={styles.searchbar}
      />

      <FlatList
        data={filteredChildren}
        keyExtractor={(item) => item.id}
        renderItem={renderChild}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text variant="bodyMedium" style={styles.emptyText}>
              {searchQuery ? 'No children match your search.' : 'No children found. Add children first.'}
            </Text>
          </View>
        }
      />

      <Portal>
        <Dialog visible={languageDialogVisible} onDismiss={() => setLanguageDialogVisible(false)}>
          <Dialog.Title>Select Language</Dialog.Title>
          <Dialog.Content>
            <RadioButton.Group onValueChange={setSelectedLanguage} value={selectedLanguage}>
              <RadioButton.Item label="English" value="english" />
              <RadioButton.Item label="isiXhosa" value="isixhosa" />
            </RadioButton.Group>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setLanguageDialogVisible(false)}>Cancel</Button>
            <Button mode="contained" onPress={handleLanguageConfirm}>Start</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  searchbar: {
    margin: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
  },
  listContent: {
    paddingHorizontal: spacing.md,
  },
  childRow: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.sm,
    ...shadows.card,
  },
  childRowPressed: {
    opacity: 0.7,
  },
  childName: {
    color: colors.text,
  },
  emptyContainer: {
    paddingTop: spacing.xxl,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
