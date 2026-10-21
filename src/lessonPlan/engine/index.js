/** @typedef {'2 Letter Blends'|'3 Letter Blends'|'4 Letter Blends'|'Word Reading'} BlendTier */
/** @typedef {'first_session'|'ok'|'all_letters_known'|'no_pack'|'no_children'} PlanReason */

/** @typedef {Object} ChildInput
 * @property {string} id
 * @property {string|null} readingLevel     children.reading_level (a READING_LEVELS label); null = Not set
 * @property {string[]} knownLetters        C23, in the LESSON's language: assessment evidence ∪ EA confirmation, computed by the caller (see "Building the inputs"). Lower-cased by the engine.
 * @property {boolean} historyComplete      §7.3 predicate for this one child: the C1 lesson-draft plan's isSessionHistoryComplete({ ..., childIds: [id] }). Anything but true = incomplete.
 * @property {boolean} masteryComplete      §7.6 ask 3 for this one child: AR Plan 3's masteryInputsComplete({ childIds: [id] }). false until AR Plan 3 lands.
 */

/** @typedef {Object} SessionRecord        Exactly a sessionsRepository.getSessions() row (src/db/repositories/sessionsRepository.js:70-96, 125-156); extra keys are ignored.
 * @property {string} id
 * @property {string} programme_id
 * @property {string} session_date         'YYYY-MM-DD'
 * @property {string} created_at           ISO timestamp
 * @property {string[]} children_ids       attendees (present only, C13)
 * @property {Object|null} activities      activities.lesson (an object) marks a lesson-plan session; the engine reads lesson.blends_done (string[]) and lesson.books_read ([{ id, how }])
 */

/** @typedef {Object} LessonInput
 * @property {string} today                'YYYY-MM-DD', SAST: toLocalDateString(new Date()) (src/utils/localDate.js:16). Becomes plan.made_on and the rotation day.
 * @property {string} academicYearStart    'YYYY-MM-DD': getActiveAcademicYear(db).starts_on (src/db/repositories/domainRepositoryUtils.js:261)
 * @property {string} programmeId          the EA's active programme
 * @property {string} groupId              the lesson's group (rotation seed)
 * @property {string|null} upNextGroupId   rankGroups().upNextGroupId when the picker opened
 * @property {string|null} languageCode    the lesson class's language code (C18): languageCodeForHomeLanguage(class.home_language), 'xh' | 'en' | 'af' (after AF) | 'zu' | null. null = unknown; never defaulted to 'en'.
 * @property {Object|null} pack            spec §4.1 pack: A1's getPack(languageCode, options), or getPackById(draft.pack_id, options) for a resumed draft; null → no_pack
 * @property {string[]|null} alphabet      the language's 26 letters for the manual letter picker: PEDAGOGICAL_ORDERS[languageCode] (src/utils/assessmentRegistry.js:19-22; 'af' arrives with AF), else null. Used only when there is no usable pack.
 * @property {boolean} isEcd               the lesson class's grade === 'ECD' (C8; classes.grade, GRADES in src/constants/options.js:1)
 * @property {ChildInput[]} presentChildren   present only (C1), in screen order, including children added for the day
 * @property {SessionRecord[]} sessions    the phone's sessions; the engine applies the §7.3 window itself
 */

/** Plan = spec §6 lesson.plan, keys in exactly this order:
 *  engine_version (1), made_on, reason, history_complete, mastery_complete, present_child_ids,
 *  known_letters, suggested_letters, review_letters, unlocked_letters,
 *  blend_tier (BlendTier|null), suggested_blends (string[], at most 6), suggested_book (string|null),
 *  up_next_group_id */

/** @typedef {{ text: string, display: string, tier: BlendTier }} BlendItem   text = pack item text (what blends_done stores); display = word_bank syllables, else text; tier = by the item's own letter count */
/** @typedef {{ tier: BlendTier, childIds: string[], suggested: BlendItem[], pool: BlendItem[] }} TierChoice   LessonChoices.tiers[0] is the default tier; later entries are higher tiers ("show higher"), ascending */
/** @typedef {{ id: string, title: string, step: number, readable: boolean, suggested: boolean, lastReadOn: string|null }} BookChoice */
/** @typedef {{ letterChoices: string[], tiers: TierChoice[], books: BookChoice[], contentAvailable: { blends: boolean, books: boolean } }} LessonChoices */

/** @typedef {{ id: string, name: string, displayNumber: number|null, memberIds: string[], languageCode: string|null, pack: Object|null }} GroupInput */
/** @typedef {{ today: string, academicYearStart: string, programmeId: string, groups: GroupInput[], children: Object<string, ChildInput>, sessions: SessionRecord[] }} RankGroupsInput */
/** @typedef {{ groupId: string, lastSeenOn: string|null, taughtToday: boolean, sessionsThisWeek: number, nextLetters: string[], lettersReason: PlanReason }} GroupRow */

export {
  BLEND_RECENT_SESSIONS,
  BLEND_SUGGESTION_COUNT,
  BOOK_RECENT_SESSIONS,
  ENGINE_VERSION,
  PACK_LANGUAGE_BY_CODE,
  PLAN_REASONS,
  SUGGESTED_LETTER_COUNT,
} from './constants';
export { teachingOrderFromPack } from './letters';
export { computeLessonPlan } from './lessonPlan';
export { rankGroups } from './groups';
