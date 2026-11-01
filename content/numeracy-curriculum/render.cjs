'use strict';

const { writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { CURRENT_EDITION, getCurriculum } = require('./index');

// Fixed partner introduction; curriculum wording below comes from the JSON.
const INTRO = "# Numeracy curriculum: draft steps (edition 2026.1-draft)\n\n**For the partner to review and edit.** Drafted on 2026-10-31 from your Grade 1 weeks 1–4 activities, then checked for correct maths and plain language.\n\n**How this works in the app.** Each maths skill has steps by number size (Add: up to 5 → 10 → 15 → 20). For every step there are two parts:\n\n- **How to teach it**: the goal and 2–3 activities. The EA sees these on the lesson plan. Each activity fills one slot in a lesson (5–8 minutes), and the app rotates through a step's activities across lessons so they vary.\n- **Tick when**: three things to ask one child on their own. If they get all 3 right, the EA ticks the step on the child's tracker.\n\n**Order.** A step is only suggested once the group has done what comes before it:\n\n1. Within a skill, go step by step.\n2. Count or read the numbers before working with them.\n3. Take away and number pairs come after adding, at the same size.\n4. Count aloud before skip counting.\n\n**What we'd like from you.** Change anything: activities, wording, tick questions, order. Every step has a note with our specific questions for you. Please keep the words simple, because many EAs are not trained teachers and English is often their second language.\n\n**Sources.** \"Partner activity\" means your activity, used as written. \"Adapted\" means your activity changed to work with bigger numbers or put into plainer words. \"New\" means not in weeks 1–4.";

function readableDocPath(edition) {
  return resolve(__dirname, '../../docs/numeracy',
    `curriculum-draft-${edition.replace(/-draft$/, '')}.md`);
}

function renderCurriculumMarkdown(curriculum) {
  const labels = new Map(curriculum.skills.flatMap(skill =>
    skill.steps.map(step => [step.key, `${skill.label} ${step.label}`])));
  const blocks = [INTRO.replace('2026.1-draft', curriculum.edition), '## Contents',
    curriculum.skills.map(skill =>
      `- **${skill.label}**: ${skill.steps.map(step => step.label).join(' · ')}`).join('\n')];

  for (const skill of curriculum.skills) {
    blocks.push('---', `## ${skill.label}`);
    for (const step of skill.steps) {
      const tick = step.tick_when;
      blocks.push(`### ${skill.label} · ${step.label}`,
        `**Goal:** ${step.goal}`,
        `**Comes after:** ${step.comes_after.length
          ? step.comes_after.map(key => labels.get(key)).join(', ')
          : 'Nothing: this is a starting step'}`,
        '**Tick when**',
        [`> ${tick.setup}`, '>',
          ...tick.ask.map((ask, i) => `> ${i + 1}. ${ask} → *${tick.expected[i]}*`),
          '>', `> **${tick.rule}**`].join('\n'),
        '**How to teach it**');
      for (const activity of step.activities) {
        const source = activity.source === 'partner'
          ? `Partner activity (${activity.source_ref})`
          : activity.source === 'adapted'
            ? `Partner activity, adapted (${activity.source_ref})` : 'New';
        blocks.push(`**${activity.name}** (${activity.minutes} min) · ${source}`,
          activity.how.map((line, i) => `${i + 1}. ${line}`).join('\n'),
          `*You need:* ${activity.needs}`);
      }
      blocks.push(`**Note for the partner:** ${step.note_for_partner}`);
    }
  }
  return blocks.join('\n\n') + '\n';
}

module.exports = { renderCurriculumMarkdown, readableDocPath };

if (require.main === module) {
  const path = readableDocPath(CURRENT_EDITION);
  writeFileSync(path, renderCurriculumMarkdown(getCurriculum()), 'utf8');
  console.log(path);
}
