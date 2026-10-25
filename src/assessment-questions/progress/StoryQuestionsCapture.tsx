import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { ItemSetMeta } from '../types/ItemSet';
import type { QuestionProps } from '../types/QuestionProps';
import type { Result } from '../types/Result';
import { tokens } from '../theme/tokens';
import { ContentText, FullScreenSheet, SecondaryButton } from '../ui';
import { flatCopy } from './captureCopy';
import { SequentialCapture } from './SequentialCapture';

/** Story scores use only the reached prefix as the questions asked. */
export function storyQuestionsResult(base: Result): Result {
  return {
    ...base,
    items: base.items.map(item => ({
      ...item, metadata: { ...item.metadata, asked: item.metadata?.reached },
    })),
    derived: { ...base.derived, questions_asked: base.derived.total_attempted },
  };
}

export function StoryQuestionsCapture({ itemSet, story, questions, storyButton, intro, ...props }: QuestionProps & {
  itemSet: ItemSetMeta;
  story: string;
  questions: ReadonlyArray<{ item_key: string; prompt: string; guide: string }>;
  storyButton: 'Re-read story' | 'Show story';
  intro: { startLabel: string; testID?: string; showStory: boolean };
}) {
  const [showStory, setShowStory] = useState(false);
  const items = useMemo(() => questions.map(question => ({
    item_key: question.item_key, prompt: question.prompt, gloss: question.guide,
  })), [questions]);
  return <SequentialCapture {...props} itemSet={itemSet} items={items}
    testIDPrefix="story" body={{ kind: 'cards', testID: 'prompt-scroll' }}
    copy={flatCopy('question', items.length)} stopRule={null} durationSec={undefined}
    intro={{ startLabel: intro.startLabel, testID: intro.testID,
      content: intro.showStory ? <ContentText size="story">{story}</ContentText> : undefined }}
    aboveBody={<>
      <View style={styles.storyButton}>
        <SecondaryButton label={storyButton} onPress={() => setShowStory(true)} />
      </View>
      <FullScreenSheet visible={showStory} onClose={() => setShowStory(false)}>
        <ScrollView contentContainerStyle={styles.story}>
          <ContentText size="story">{story}</ContentText>
        </ScrollView>
      </FullScreenSheet>
    </>}
    finalizeResult={storyQuestionsResult} />;
}

const styles = StyleSheet.create({
  storyButton: { paddingHorizontal: tokens.space.lg, paddingTop: tokens.space.lg },
  story: { padding: tokens.space.lg },
});
