import React, { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ActivityIndicator } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { useSignedInEA } from '../../context/SignedInEAContext';
import { useAuth } from '../../context/AuthContext';
import { useOffline } from '../../context/OfflineContext';
import useMasterySyncRefresh from '../../hooks/useMasterySyncRefresh';
import { getCurriculum, getStep } from '../../../content/numeracy-curriculum';
import { computeStepEvidence } from '../../numeracy/evidence';
import { buildTrackerModel } from '../../numeracyLesson/trackerModel';
import { PROGRAMME_CHANGED_NOTE } from '../../numeracyLesson/copy';
import { confirmNumeracyProgramme } from '../../services/numeracyProgramme';
import { NumeracyTickError, tickStepNow } from '../../services/numeracyTick';
import { colors, spacing } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import NumberTrackerGrid from './NumberTrackerGrid';
import StepSheet from './StepSheet';

export default function NumberTrackerPanel({ child, isDelivery = true }) {
  const { handle, repositories } = useSignedInEA();
  const { user } = useAuth();
  const { refreshSyncStatus, triggerBackgroundSync } = useOffline();
  const curriculum = getCurriculum();
  const [ticks, setTicks] = useState([]);
  const [evidence, setEvidence] = useState(new Map());
  const [programmeId, setProgrammeId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState(null);
  const [updatingStep, setUpdatingStep] = useState(null);
  const [openSkill, setOpenSkill] = useState(null);
  const loadGeneration = useRef(0);
  const writeInFlight = useRef(false);
  const { skillMastery, assessments } = repositories;

  const loadData = useCallback(async ({ background = false } = {}) => {
    const generation = ++loadGeneration.current;
    if (!background) setLoading(true);
    try {
      const confirmedId = await confirmNumeracyProgramme({ handle, userId: user.id });
      const [records, results] = await Promise.all([
        skillMastery.getSkillMastery({ childId: child.id }),
        assessments.getMathsEvidenceResults({ userId: user.id, childIds: [child.id] }),
      ]);
      if (generation !== loadGeneration.current || writeInFlight.current) return;
      setProgrammeId(confirmedId);
      // A later confirmed read clears the programme note; other notes stay until the next tap.
      setNote(current => (confirmedId ? (current === PROGRAMME_CHANGED_NOTE ? null : current) : PROGRAMME_CHANGED_NOTE));
      setTicks(records);
      setEvidence(computeStepEvidence({ curriculum, results }));
    } catch (error) {
      // A failed read is not a programme move. The grid stays read-only until a load confirms the
      // programme (programmeId starts null), and every tap re-checks inside its own write anyway.
      console.error('Error loading number tracker data:', error);
    } finally {
      if (generation === loadGeneration.current && !writeInFlight.current) setLoading(false);
    }
  }, [handle, user.id, child.id, skillMastery, assessments, curriculum]);
  const backgroundReload = useCallback(() => loadData({ background: true }), [loadData]);
  useMasterySyncRefresh('skill_mastery', backgroundReload);
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const model = useMemo(() => buildTrackerModel({ curriculum, ticks, evidence, userId: user.id }), [curriculum, ticks, evidence, user.id]);
  const rows = model.sections.flatMap(section => section.rows);
  const row = rows.find(item => item.skillKey === openSkill);
  const readOnly = !isDelivery || !programmeId;
  const onTap = async stepKey => {
    if (readOnly || updatingStep || writeInFlight.current) return;
    const skill = rows.find(item => item.tiles.some(tile => tile.stepKey === stepKey));
    const index = skill?.tiles.findIndex(tile => tile.stepKey === stepKey);
    const tile = skill?.tiles[index];
    if (!tile) return;
    if (tile.state === 'assessment') { setNote('EGMA shows this step, so it stays ticked.'); return; }
    if (tile.state === 'implied') {
      const higher = skill.tiles.slice(index + 1).find(item => item.state === 'ticked' || item.state === 'assessment');
      setNote(`Known because '${getStep(curriculum, higher.stepKey).label}' is ticked.`);
      return;
    }
    writeInFlight.current = true;
    ++loadGeneration.current;
    setNote(null);
    setUpdatingStep(stepKey);
    try {
      const record = await tickStepNow({ handle, programmeId, childId: child.id, stepKey, confirmed: tile.state !== 'ticked' });
      if (record) setTicks(previous => [...previous.filter(item => item.step_key !== stepKey), record]);
    } catch (error) {
      if (error instanceof NumeracyTickError && error.code === 'PROGRAMME_CHANGED') {
        setProgrammeId(null);
        setNote(PROGRAMME_CHANGED_NOTE);
      } else setNote('Step update was not saved. Please try again.');
      return;
    } finally {
      writeInFlight.current = false;
      setUpdatingStep(null);
      loadData({ background: true });
    }
    Promise.resolve(refreshSyncStatus()).catch(() => {});
    triggerBackgroundSync?.();
  };

  if (loading) return <ActivityIndicator color={colors.text} />;
  return <View>
    <Text style={styles.progress}>{`Number tracker · ${model.knownCount} / ${model.total} steps`}</Text>
    {note ? <Text style={styles.note}>{note}</Text> : null}
    <NumberTrackerGrid model={model} curriculum={curriculum} readOnly={readOnly || !!updatingStep}
      onPressTile={onTap} onPressSkill={item => setOpenSkill(item.skillKey)} />
    <StepSheet visible={!!row} row={row} curriculum={curriculum} childFirstName={child.first_name}
      onDismiss={() => setOpenSkill(null)} onTick={onTap} readOnly={readOnly || !!updatingStep} />
  </View>;
}
const styles = StyleSheet.create({
  progress: { ...typeRoles.textBody, color: colors.textSecondary, marginBottom: spacing.md },
  note: { ...typeRoles.textBody, color: colors.textSecondary, marginBottom: spacing.md },
});
