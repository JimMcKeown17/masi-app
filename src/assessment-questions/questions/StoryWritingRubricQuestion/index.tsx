/**
 * StoryWritingRubricQuestion — WelaPLUS Pattern E (Q11).
 *
 * EA reads the child's hand-written story (from paper) and scores the
 * item set's dimensions within its inclusive score_range. Per ADR-0004
 * the emitted items[].item_key is prefixed `ea:<dimension_code>` so HQ's later
 * rubric inserts (with `hq:` prefix) don't collide via
 * deterministicItemId. metadata.scorer='ea' is the partition key for
 * the EA-vs-HQ calibration experiment; metadata.score holds the selected
 * value (is_correct is NOT the carrier — it's `false` on every Q11 row).
 *
 * Layout: optional picture thumbnail at top (tap-to-enlarge), stacked
 * dimension cards each with header, "View full rubric" button, row of
 * tappable chips from min through max, end-anchored gloss line, then a running
 * Total out of max × dimension count beneath. Re-scoring = tap a different
 * chip (no toggle-clear so a chosen score remains distinct from an
 * unscored dimension).
 *
 * Skipped abandon emits items=[] per the cross-Pattern skip-empty
 * contract (the host writes NULL score / zero items in that case).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Modal,
  Image,
  StyleSheet,
} from 'react-native';
import type { QuestionProps } from '../../types/QuestionProps';
import type { Result, StoppedReason } from '../../types/Result';
import type {
  StoryWritingRubricItemSet,
  StoryWritingRubricDimension,
  StoryWritingRubricAnchor,
} from './types';
import { WELA_PLUS_STORY_WRITING_EN } from '../../itemsets/wela_plus_story_writing.en';
import { WELA_PLUS_STORY_WRITING_XH } from '../../itemsets/wela_plus_story_writing.xh';
import { tokens } from '../../theme/tokens';
import { SkipReasonPicker } from '../../skip/SkipReasonPicker';
import type { ManualSkipReason } from '../../skip/skipReasons';

type Phase =
  | 'intro'
  | 'active'
  | 'confirm-finish'
  | 'skip-picker'
  | 'finished';

type FullItemSet = StoryWritingRubricItemSet & {
  item_set_id: string;
  question_version: string;
};

type ScoreRange = StoryWritingRubricItemSet['score_range'];

function isValidScoreRange(value: unknown): value is ScoreRange {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.min === 'number' && Number.isSafeInteger(o.min) &&
    typeof o.max === 'number' && Number.isSafeInteger(o.max) &&
    o.min >= 0 && o.min <= o.max &&
    o.max - o.min + 1 <= 11
  );
}

function isValidAnchor(a: unknown, range: ScoreRange): a is StoryWritingRubricAnchor {
  if (!a || typeof a !== 'object') return false;
  const o = a as Record<string, unknown>;
  return (
    typeof o.score === 'number' && o.score >= range.min && o.score <= range.max &&
    typeof o.text === 'string'
  );
}

function isValidDimension(d: unknown, range: ScoreRange): d is StoryWritingRubricDimension {
  if (!d || typeof d !== 'object') return false;
  const o = d as Record<string, unknown>;
  return (
    typeof o.code === 'string' &&
    typeof o.label === 'string' &&
    typeof o.end_anchor_gloss === 'string' &&
    Array.isArray(o.anchors) &&
    o.anchors.every((a) => isValidAnchor(a, range))
  );
}

function isFullItemSet(value: unknown): value is FullItemSet {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  if (typeof o.item_set_id !== 'string') return false;
  if (typeof o.question_version !== 'string') return false;
  const range = o.score_range;
  if (!isValidScoreRange(range)) return false;
  if (o.picture !== undefined) {
    if (!o.picture || typeof o.picture !== 'object') return false;
    const pic = o.picture as Record<string, unknown>;
    if (typeof pic.alt !== 'string') return false;
  }
  if (!Array.isArray(o.dimensions)) return false;
  return o.dimensions.every((d) => isValidDimension(d, range));
}

function resolveItemSet(language: string, override: unknown): FullItemSet {
  if (isFullItemSet(override)) return override;
  return language === 'xh'
    ? WELA_PLUS_STORY_WRITING_XH
    : WELA_PLUS_STORY_WRITING_EN;
}

export function StoryWritingRubricQuestion(props: QuestionProps) {
  const {
    language,
    itemSet,
    instructions,
    onComplete,
    onItemMarked,
  } = props;
  const [phase, setPhase] = useState<Phase>('intro');
  // Per-dimension score state. null = unscored; a number = chosen score.
  const [scores, setScores] = useState<Record<string, number | null>>({});
  const [rubricSheetDim, setRubricSheetDim] = useState<string | null>(null);
  const [pictureEnlarged, setPictureEnlarged] = useState(false);

  const effectiveItemSet = resolveItemSet(language, itemSet);
  const dimensions = effectiveItemSet.dimensions;
  const { min: minScore, max: maxScore } = effectiveItemSet.score_range;
  const chipScores = Array.from({ length: maxScore - minScore + 1 }, (_, i) => minScore + i);

  const scoresRef = useRef(scores);
  useEffect(() => {
    scoresRef.current = scores;
  }, [scores]);

  const hasFinishedRef = useRef(false);
  const startTimeMsRef = useRef<number | null>(null);

  useEffect(() => {
    if (phase === 'active' && startTimeMsRef.current === null) {
      startTimeMsRef.current = Date.now();
    }
  }, [phase]);

  const scoredCount = dimensions.reduce(
    (acc, d) => acc + (scoresRef.current[d.code] != null ? 1 : 0),
    0,
  );
  // Live re-compute against scores (not scoresRef) so the Total reflows when chip taps land.
  const runningTotal = dimensions.reduce(
    (acc, d) => acc + (scores[d.code] ?? 0),
    0,
  );
  const max = dimensions.length * maxScore;
  const unscoredCount = dimensions.length - dimensions.filter((d) => scores[d.code] != null).length;

  const finish = useCallback(
    (stoppedReason: StoppedReason) => {
      if (hasFinishedRef.current) return;
      hasFinishedRef.current = true;
      setPhase('finished');

      // Skip-emits-empty contract: cross-Pattern rule.
      const isSkipped = stoppedReason.startsWith('skipped_');
      const items = isSkipped
        ? []
        : dimensions
            .map((d, idx) => {
              const score = scoresRef.current[d.code];
              if (score == null) return null; // unscored → not persisted
              const anchor = d.anchors.find((a) => a.score === score);
              return {
                position: idx,
                // ADR-0004: ea: prefix is load-bearing for deterministicItemId.
                item_key: `ea:${d.code}`,
                prompt: d.label,
                is_correct: false, // NOT the carrier; metadata.score is.
                metadata: {
                  score,
                  scorer: 'ea' as const,
                  ...(anchor ? { anchor_text: anchor.text } : {}),
                },
              };
            })
            .filter((item): item is NonNullable<typeof item> => item !== null);
      const eaRubricTotal = isSkipped
        ? 0
        : items.reduce(
            (sum, item) =>
              sum + (typeof item.metadata.score === 'number' ? item.metadata.score : 0),
            0,
          );
      const byDimension: Record<string, number> = {};
      if (!isSkipped) {
        items.forEach((item) => {
          // item.item_key is `ea:<code>` — strip the prefix for the analytics map.
          const code = item.item_key.slice(3);
          byDimension[code] = item.metadata.score as number;
        });
      }
      const elapsedMs =
        startTimeMsRef.current === null
          ? 0
          : Date.now() - startTimeMsRef.current;

      const result: Result = {
        question_code: 'wela_plus_story_writing',
        question_version: effectiveItemSet.question_version,
        item_set_id: effectiveItemSet.item_set_id,
        language,
        duration_ms: elapsedMs,
        stopped_reason: stoppedReason,
        items,
        derived: {
          total_correct: 0, // Q11 is divergent — accuracy% has no meaning here.
          total_attempted: items.length,
          percent: max > 0 ? Math.round((eaRubricTotal / max) * 100) : 0,
          last_attempted_position: null,
          was_timed: false,
          ea_rubric_total: eaRubricTotal,
          max,
          by_dimension: byDimension,
        },
      };
      onComplete(result);
    },
    [dimensions, effectiveItemSet, language, max, onComplete],
  );

  const handleChip = useCallback(
    (dimCode: string, score: number) => {
      setScores((prev) => ({ ...prev, [dimCode]: score }));
      if (onItemMarked) {
        const idx = dimensions.findIndex((d) => d.code === dimCode);
        const dim = idx >= 0 ? dimensions[idx] : null;
        const anchor = dim?.anchors.find((a) => a.score === score);
        if (dim) {
          onItemMarked({
            position: idx,
            item_key: `ea:${dim.code}`,
            prompt: dim.label,
            is_correct: false,
            metadata: {
              score,
              scorer: 'ea',
              ...(anchor ? { anchor_text: anchor.text } : {}),
            },
          });
        }
      }
    },
    [dimensions, onItemMarked],
  );

  const handleFinish = useCallback(() => {
    if (unscoredCount > 0) {
      setPhase('confirm-finish');
    } else {
      finish('completed');
    }
  }, [unscoredCount, finish]);

  const handleSkipChosen = useCallback(
    (reason: ManualSkipReason) => finish(reason),
    [finish],
  );

  if (phase === 'intro') {
    return (
      <View>
        {instructions ? <Text>{instructions}</Text> : null}
        <Pressable onPress={() => setPhase('active')}>
          <Text>Start</Text>
        </Pressable>
      </View>
    );
  }

  if (phase === 'finished') {
    return <View />;
  }

  if (phase === 'confirm-finish') {
    return (
      <View>
        <Text>{`${unscoredCount} dimensions unscored — finish anyway?`}</Text>
        {/*
          Codex adversarial review: 'completed' is reserved for runs where
          every dimension is scored. A confirmed-but-incomplete finish
          emits 'ea_ended' so downstream can distinguish a real 0 score
          from a skipped dimension.
        */}
        <Pressable onPress={() => finish('ea_ended')}>
          <Text>Yes, finish</Text>
        </Pressable>
        <Pressable onPress={() => setPhase('active')}>
          <Text>Cancel</Text>
        </Pressable>
      </View>
    );
  }

  if (phase === 'skip-picker') {
    return (
      <SkipReasonPicker
        onChoose={handleSkipChosen}
        onCancel={() => setPhase('active')}
      />
    );
  }

  // active phase
  const rubricDim = rubricSheetDim
    ? dimensions.find((d) => d.code === rubricSheetDim) ?? null
    : null;

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {effectiveItemSet.picture ? (
          <Pressable
            testID="picture-thumbnail"
            accessibilityRole="button"
            onPress={() => setPictureEnlarged(true)}
            style={styles.thumbnailRow}
          >
            {effectiveItemSet.picture.source ? (
              <Image
                source={effectiveItemSet.picture.source}
                style={styles.thumbnailImage}
                accessibilityLabel={effectiveItemSet.picture.alt}
              />
            ) : null}
            <Text style={styles.thumbnailAlt}>
              {effectiveItemSet.picture.alt}
            </Text>
          </Pressable>
        ) : null}

        {dimensions.map((d) => {
          const selectedScore = scores[d.code] ?? null;
          return (
            <View key={d.code} style={styles.dimensionCard}>
              <View style={styles.dimensionHeader}>
                <Text style={styles.dimensionLabel}>{d.label}</Text>
                <Pressable
                  testID={`view-rubric-${d.code}`}
                  accessibilityRole="button"
                  onPress={() => setRubricSheetDim(d.code)}
                  style={styles.viewRubricButton}
                >
                  <Text style={styles.viewRubricText}>View full rubric</Text>
                </Pressable>
              </View>
              <View style={styles.chipRow}>
                {chipScores.map((s) => {
                  const isSelected = selectedScore === s;
                  return (
                    <Pressable
                      key={s}
                      testID={`chip-${d.code}-${s}`}
                      accessibilityRole="button"
                      accessibilityLabel={`${d.label} score ${s}${
                        isSelected ? ', selected' : ''
                      }`}
                      onPress={() => handleChip(d.code, s)}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: isSelected
                            ? tokens.color.primary
                            : tokens.color.canvas,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          {
                            color: isSelected
                              ? tokens.color.onPrimary
                              : tokens.color.primary,
                          },
                        ]}
                      >
                        {s}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {d.end_anchor_gloss !== '' ? (
                <Text style={styles.gloss}>{d.end_anchor_gloss}</Text>
              ) : null}
            </View>
          );
        })}

        <Text style={styles.runningTotal}>{`Total: ${runningTotal} / ${max}`}</Text>
      </ScrollView>

      <View style={styles.nav}>
        <Pressable accessibilityRole="button" onPress={handleFinish}>
          <Text>Finish</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => setPhase('skip-picker')}
        >
          <Text>Skip question</Text>
        </Pressable>
      </View>

      <Modal
        visible={rubricSheetDim !== null}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setRubricSheetDim(null)}
      >
        <View style={styles.modalRoot}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            {rubricDim ? (
              <>
                <Text style={styles.modalHeader}>{rubricDim.label}</Text>
                {rubricDim.anchors.length === 0 ? (
                  <Text style={styles.rubricPending}>
                    Rubric descriptions coming soon
                  </Text>
                ) : (
                  rubricDim.anchors.map((a) => (
                    <View key={a.score} style={styles.anchorRow}>
                      <Text style={styles.anchorScore}>{a.score}</Text>
                      <Text style={styles.anchorText}>{a.text}</Text>
                    </View>
                  ))
                )}
              </>
            ) : null}
          </ScrollView>
          <Pressable
            accessibilityRole="button"
            onPress={() => setRubricSheetDim(null)}
            style={styles.modalCloseButton}
          >
            <Text style={styles.modalCloseText}>Close</Text>
          </Pressable>
        </View>
      </Modal>

      {effectiveItemSet.picture ? (
        <Modal
          visible={pictureEnlarged}
          animationType="fade"
          transparent={false}
          onRequestClose={() => setPictureEnlarged(false)}
        >
          <View style={styles.modalRoot}>
            <ScrollView contentContainerStyle={styles.modalContent}>
              {effectiveItemSet.picture.source ? (
                <Image
                  source={effectiveItemSet.picture.source}
                  style={styles.enlargedImage}
                  accessibilityLabel={effectiveItemSet.picture.alt}
                />
              ) : null}
              <Text style={styles.enlargedAlt}>
                {effectiveItemSet.picture.alt}
              </Text>
            </ScrollView>
            <Pressable
              accessibilityRole="button"
              onPress={() => setPictureEnlarged(false)}
              style={styles.modalCloseButton}
            >
              <Text style={styles.modalCloseText}>Close</Text>
            </Pressable>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { padding: 16 },
  thumbnailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    marginBottom: 12,
    backgroundColor: tokens.color.canvas,
    borderRadius: 8,
    gap: 12,
  },
  thumbnailImage: { width: 56, height: 56, borderRadius: 4 },
  thumbnailAlt: {
    flex: 1,
    fontSize: 14,
    color: tokens.color.ink,
    fontStyle: 'italic',
  },
  dimensionCard: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.line,
    borderRadius: 8,
  },
  dimensionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  dimensionLabel: { fontSize: 18, fontWeight: '600' },
  viewRubricButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: tokens.color.canvas,
    borderRadius: 6,
  },
  viewRubricText: { fontSize: 12, color: tokens.color.primary, fontWeight: '600' },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  chip: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: tokens.color.primary,
  },
  chipText: { fontSize: 18, fontWeight: '600' },
  gloss: { fontSize: 13, color: tokens.color.muted },
  runningTotal: { fontSize: 20, fontWeight: '700', marginTop: 8 },
  nav: {
    flexDirection: 'row',
    gap: 16,
    padding: 12,
  },
  modalRoot: { flex: 1, backgroundColor: tokens.color.surface },
  modalContent: { padding: 24 },
  modalHeader: { fontSize: 22, fontWeight: '700', marginBottom: 12 },
  anchorRow: {
    flexDirection: 'row',
    marginBottom: 8,
    gap: 12,
  },
  anchorScore: {
    fontSize: 18,
    fontWeight: '600',
    width: 32,
    textAlign: 'center',
  },
  anchorText: { fontSize: 15, flex: 1, lineHeight: 20 },
  rubricPending: {
    fontSize: tokens.font.body,
    color: tokens.color.muted,
  },
  modalCloseButton: {
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: tokens.color.primary,
    borderRadius: 8,
    margin: 16,
  },
  modalCloseText: { color: tokens.color.onPrimary, fontWeight: '600' },
  enlargedImage: { width: '100%', height: 320, resizeMode: 'contain' },
  enlargedAlt: { fontSize: 14, fontStyle: 'italic', marginTop: 12 },
});
