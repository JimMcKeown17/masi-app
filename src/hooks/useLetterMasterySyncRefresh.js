import useMasterySyncRefresh from './useMasterySyncRefresh';

// The letter tracker panel re-reads after a sync pass that sent letter_mastery corrections,
// and after committed history pages (AR Plans 2–3). Not for the session tracker sheet:
// a re-read under its pending marks can undo a cancelling tap.
export default function useLetterMasterySyncRefresh(onRefresh) {
  useMasterySyncRefresh('letter_mastery', onRefresh);
}
