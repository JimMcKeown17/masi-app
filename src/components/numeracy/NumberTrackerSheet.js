import React, { useEffect, useState } from 'react';
import { useSignedInEA } from '../../context/SignedInEAContext';
import { buildTrackerModel } from '../../numeracyLesson/trackerModel';
import { computeStepEvidence } from '../../numeracy/evidence';
import { toggleStepChange } from '../../numeracyLesson/trackerChanges';
import { getStep } from '../../../content/numeracy-curriculum';
import BottomSheet from '../common/BottomSheet';
import BrandButton from '../common/BrandButton';
import InlineNote from '../common/InlineNote';
import NumberTrackerGrid from './NumberTrackerGrid';

export default function NumberTrackerSheet({ visible, onDismiss, child, curriculum, userId, pendingChanges,
  onChangesUpdate, programmeId, academicYear }) {
  const { handle } = useSignedInEA();
  const [data, setData] = useState(null);
  const [localPending, setLocalPending] = useState({});
  const [note, setNote] = useState(null);
  const childId = child?.id;
  useEffect(() => {
    let current = true;
    setData(null); setNote(null);
    if (!visible || !childId) return undefined;
    setLocalPending({ ...pendingChanges });
    const load = async () => {
      const [ticks, results] = await Promise.all([
        handle.repositories.skillMastery.getSkillMastery({ childIds: [childId] }),
        handle.repositories.assessments.getMathsEvidenceResults({ userId, programmeId, academicYear, childIds: [childId] }),
      ]);
      if (current && handle.isCurrent()) setData({ ticks, evidence: computeStepEvidence({ curriculum, results }) });
    };
    void load().catch(() => { if (current) setNote("Couldn't load steps. Close and try again."); });
    return () => { current = false; };
    // Capture the opening snapshot. Draft edits and sync results never reload this sheet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, childId, handle]);
  const model = buildTrackerModel({ curriculum, ticks: data?.ticks, evidence: data?.evidence, pending: localPending, userId });
  const onTap = stepKey => {
    const row = model.sections.flatMap(section => section.rows).find(row => row.tiles.some(tile => tile.stepKey === stepKey));
    const tile = row.tiles.find(tile => tile.stepKey === stepKey);
    if (tile.state === 'assessment') { setNote('EGMA shows this step, so it stays ticked.'); return; }
    if (tile.state === 'implied' && !localPending[stepKey]) {
      const higher = row.tiles.slice(row.tiles.indexOf(tile) + 1).find(item => ['ticked', 'assessment'].includes(item.state));
      setNote(`Known because '${getStep(curriculum, higher.stepKey).label}' is ticked.`); return;
    }
    setNote(null);
    const stored = data.ticks.filter(tick => tick.step_key === stepKey).sort((a, b) => b.changed_at.localeCompare(a.changed_at))[0];
    setLocalPending(pending => toggleStepChange({ storedConfirmed: stored?.confirmed === true || stored?.confirmed === 1,
      locked: tile.state === 'assessment', pending, stepKey, nowIso: new Date().toISOString() }));
  };
  return <BottomSheet visible={visible} title={child?.first_name} onDismiss={onDismiss}
    footer={<BrandButton label="Done" disabled={!data} onPress={() => { onChangesUpdate(localPending); onDismiss(); }} />}>
    {note ? <InlineNote>{note}</InlineNote> : null}
    {data ? <NumberTrackerGrid model={model} curriculum={curriculum} onPressTile={onTap} onPressSkill={() => {}} /> : null}
  </BottomSheet>;
}
