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
 * Total out of max × dimension count pinned above Finish. Re-scoring = tap a different
 * chip (no toggle-clear so a chosen score remains distinct from an
 * unscored dimension).
 *
 * Skipped abandon emits items=[] per the cross-Pattern skip-empty
 * contract (the host writes NULL score / zero items in that case).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  ScrollView,
  Image,
  StyleSheet,
} from 'react-native';
import { monotonicNow } from '../../progress/clock';
import type { QuestionProps } from '../../types/QuestionProps';
import type { ItemSetMeta } from '../../types/ItemSet';
import { resolveItemSet } from '../../itemsets/resolveItemSet';
import { MissingItemSet } from '../../progress/MissingItemSet';
import type { Result, StoppedReason } from '../../types/Result';
import type {
  StoryWritingRubricItemSet,
  StoryWritingRubricDimension,
  StoryWritingRubricAnchor,
} from './types';
import { WELA_PLUS_STORY_WRITING_EN } from '../../itemsets/wela_plus_story_writing.en';
import { WELA_PLUS_STORY_WRITING_XH } from '../../itemsets/wela_plus_story_writing.xh';
import { tokens } from '../../theme/tokens';
import { Canvas, ConfirmSheet, FullScreenSheet, QuestionIntro, ToggleBar, UiText } from '../../ui';
import { RubricPictureThumbnail, RubricRow, ScoreChip } from '../../ui/RubricRow';
import { SkipReasonPicker } from '../../skip/SkipReasonPicker';
import type { ManualSkipReason } from '../../skip/skipReasons';

type Phase =
  | 'intro'
  | 'active'
  | 'confirm-finish'
  | 'skip-picker'
  | 'finished';

type FullItemSet = StoryWritingRubricItemSet & ItemSetMeta;

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
  if (typeof o.question_code !== 'string') return false;
  if (typeof o.language !== 'string') return false;
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

export function StoryWritingRubricQuestion(props: QuestionProps) {
  const itemSet = resolveItemSet(
    props.language,
    props.itemSet,
    { en: WELA_PLUS_STORY_WRITING_EN, xh: WELA_PLUS_STORY_WRITING_XH },
    isFullItemSet,
  );
  if (!itemSet) return <MissingItemSet language={props.language} />;
  return <StoryWritingRubricQuestionContent {...props} itemSet={itemSet} />;
}

function StoryWritingRubricQuestionContent(
  props: QuestionProps & { itemSet: FullItemSet },
) {
  const {
    language,
    itemSet: effectiveItemSet,
    instructions,
    onComplete,
    onItemMarked,
  } = props;
  const [phase, setPhase] = useState<Phase>('intro');
  // Per-dimension score state. null = unscored; a number = chosen score.
  const [scores, setScores] = useState<Record<string, number | null>>({});
  const [rubricSheetDim, setRubricSheetDim] = useState<string | null>(null);
  const [pictureEnlarged, setPictureEnlarged] = useState(false);

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
      startTimeMsRef.current = monotonicNow();
    }
  }, [phase]);

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
          : Math.round(monotonicNow() - startTimeMsRef.current);

      const result: Result = {
        question_code: effectiveItemSet.question_code,
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
    return <QuestionIntro instructions={instructions} onStart={() => { props.onStart?.(); setPhase('active'); }} />;
  }

  if (phase === 'finished') {
    return <View />;
  }

  if (phase === 'skip-picker') {
    return (
      <SkipReasonPicker
        onChoose={handleSkipChosen}
        onCancel={() => setPhase('active')}
      />
    );
  }

  const confirming = phase === 'confirm-finish';
  const rubricDim = rubricSheetDim
    ? dimensions.find((d) => d.code === rubricSheetDim) ?? null
    : null;

  return (
    <Canvas>
      <View
        testID="rubric-active"
        style={styles.root}
        accessibilityElementsHidden={confirming}
        importantForAccessibility={confirming ? 'no-hide-descendants' : 'auto'}
        pointerEvents={confirming ? 'none' : 'auto'}
      >
        <ScrollView style={styles.root} contentContainerStyle={styles.scroll}>
          {effectiveItemSet.picture ? (
            <RubricPictureThumbnail
              source={effectiveItemSet.picture.source}
              alt={effectiveItemSet.picture.alt}
              onPress={() => setPictureEnlarged(true)}
            />
          ) : null}
          {dimensions.map((d, position) => (
            <RubricRow
              key={position}
              label={d.label}
              chipsTestID={`rubric-chips-${d.code}`}
              viewRubricTestID={`view-rubric-${d.code}`}
              onViewRubric={() => setRubricSheetDim(d.code)}
              gloss={d.end_anchor_gloss}
            >
              {chipScores.map((score, scorePosition) => {
                const selected = scores[d.code] === score;
                return (
                  <ScoreChip
                    key={scorePosition}
                    score={score}
                    selected={selected}
                    testID={`chip-${d.code}-${score}`}
                    accessibilityLabel={`${d.label} score ${score}${selected ? ', selected' : ''}`}
                    onPress={() => handleChip(d.code, score)}
                  />
                );
              })}
            </RubricRow>
          ))}
        </ScrollView>
        <ToggleBar
          header={<UiText variant="heading">{`Total: ${runningTotal} / ${max}`}</UiText>}
          primary={{ label: 'Finish', onPress: handleFinish }}
          onSkip={() => setPhase('skip-picker')}
        />
      </View>

      {confirming && (
        <ConfirmSheet
          testID="confirm-finish"
          title={`${unscoredCount} dimensions unscored — finish anyway?`}
          confirmLabel="Yes, finish"
          onConfirm={() => finish('ea_ended')}
          cancelLabel="Cancel"
          onCancel={() => setPhase('active')}
        />
      )}

      <FullScreenSheet
        visible={rubricSheetDim !== null}
        title={rubricDim?.label}
        onClose={() => setRubricSheetDim(null)}
      >
        <ScrollView contentContainerStyle={styles.sheetContent}>
          {rubricDim ? (
            rubricDim.anchors.length === 0 ? (
              <UiText tone="muted">Rubric descriptions coming soon</UiText>
            ) : (
              rubricDim.anchors.map((anchor, position) => (
                <View key={position} style={styles.anchorRow}>
                  <UiText variant="label" align="center" style={styles.anchorScore}>{anchor.score}</UiText>
                  <UiText style={styles.anchorText}>{anchor.text}</UiText>
                </View>
              ))
            )
          ) : null}
        </ScrollView>
      </FullScreenSheet>

      {effectiveItemSet.picture ? (
        <FullScreenSheet visible={pictureEnlarged} onClose={() => setPictureEnlarged(false)}>
          <ScrollView contentContainerStyle={styles.sheetContent}>
            {effectiveItemSet.picture.source ? (
              <Image
                source={effectiveItemSet.picture.source}
                style={styles.enlargedImage}
                accessibilityLabel={effectiveItemSet.picture.alt}
              />
            ) : null}
            <UiText variant="caption" style={styles.enlargedAlt}>{effectiveItemSet.picture.alt}</UiText>
          </ScrollView>
        </FullScreenSheet>
      ) : null}
    </Canvas>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { padding: tokens.space.lg, gap: tokens.space.lg },
  sheetContent: { padding: tokens.space.lg },
  anchorRow: { flexDirection: 'row', marginBottom: tokens.space.sm, gap: tokens.space.md },
  anchorScore: { width: 32 },
  anchorText: { flex: 1 },
  enlargedImage: { width: '100%', height: 320, resizeMode: 'contain' },
  enlargedAlt: { marginTop: tokens.space.md },
});
