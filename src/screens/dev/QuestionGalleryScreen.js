import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import ListGroup from '../../components/common/ListGroup';
import ListRow from '../../components/common/ListRow';
import SectionHeader from '../../components/common/SectionHeader';
import SelectSheet from '../../components/common/SelectSheet';
import { colors, spacing } from '../../constants/colors';
import { useScrollBottomPadding } from '../../hooks/useScrollBottomPadding';
import { LANGUAGE_LABELS } from '../../utils/assessmentRegistry';
import { STANDALONE_GALLERY_ENTRIES, BATTERY_GALLERY_ENTRIES } from '../../utils/questionGallery';

const LANGUAGES = [{ key: 'en', label: 'English' }, { key: 'xh', label: 'isiXhosa' }];
const CONTENT = [{ key: 'bundled', label: 'Bundled card' }, { key: 'fixture', label: 'Test fixture' }];

export default function QuestionGalleryScreen({ navigation }) {
  const [languageCode, setLanguageCode] = useState('en');
  const [contentMode, setContentMode] = useState('bundled');
  const [sheet, setSheet] = useState(null);
  const paddingBottom = useScrollBottomPadding(spacing.lg);
  const contentSubtitle = contentMode === 'bundled' ? 'Bundled card'
    : languageCode === 'xh' ? 'Test fixture · English fixture' : 'Test fixture';
  const entryRow = entry => <ListRow key={entry.entryKey} title={entry.title} trailing="chevron"
    onPress={() => navigation.navigate('QuestionGalleryRun', { entryKey: entry.entryKey, languageCode, contentMode })} />;
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom }]}>
        <ListGroup>
          <ListRow title="Language" subtitle={LANGUAGE_LABELS[languageCode]} trailing="chevron" onPress={() => setSheet('language')} />
          <ListRow title="Content" subtitle={contentSubtitle} trailing="chevron" onPress={() => setSheet('content')} />
        </ListGroup>
        <View>
          <SectionHeader title="Standalone tests" />
          <ListGroup>{STANDALONE_GALLERY_ENTRIES.map(entryRow)}</ListGroup>
        </View>
        <View>
          <SectionHeader title="WelaPLUS battery" />
          <ListGroup>{BATTERY_GALLERY_ENTRIES.map(entryRow)}</ListGroup>
        </View>
      </ScrollView>
      <SelectSheet visible={sheet === 'language'} title="Language" dismissLabel="Close language selection"
        options={LANGUAGES} selectedKey={languageCode} onSelect={setLanguageCode} onDismiss={() => setSheet(null)} />
      <SelectSheet visible={sheet === 'content'} title="Content" dismissLabel="Close content selection"
        options={CONTENT} selectedKey={contentMode} onSelect={setContentMode} onDismiss={() => setSheet(null)} />
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg },
});
