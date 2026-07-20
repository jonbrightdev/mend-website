/* ============================================================
   The WCAG 2.2 Level A and AA success criteria, in specification
   order. Pure data — no database, safe on the client.

   Transcribed from https://www.w3.org/TR/WCAG22/ (verified at
   execution time, not from memory): 31 Level A and 24 Level AA.
   4.1.1 Parsing is deliberately absent — WCAG 2.2 marks it
   "Obsolete and removed" and gives it no conformance level, so it
   gets no row. Audits carrying a legacy 4.1.1 tag surface in the
   report's unmapped-findings appendix instead.

   Level AAA is out of scope: the product promises A/AA.
   ============================================================ */

export interface WcagCriterion {
  sc: string; // dotted success-criterion number, e.g. "1.4.3"
  name: string; // official title, e.g. "Contrast (Minimum)"
  level: "A" | "AA";
}

export const WCAG_22_CRITERIA: WcagCriterion[] = [
  { sc: "1.1.1", name: "Non-text Content", level: "A" },
  { sc: "1.2.1", name: "Audio-only and Video-only (Prerecorded)", level: "A" },
  { sc: "1.2.2", name: "Captions (Prerecorded)", level: "A" },
  { sc: "1.2.3", name: "Audio Description or Media Alternative (Prerecorded)", level: "A" },
  { sc: "1.2.4", name: "Captions (Live)", level: "AA" },
  { sc: "1.2.5", name: "Audio Description (Prerecorded)", level: "AA" },
  { sc: "1.3.1", name: "Info and Relationships", level: "A" },
  { sc: "1.3.2", name: "Meaningful Sequence", level: "A" },
  { sc: "1.3.3", name: "Sensory Characteristics", level: "A" },
  { sc: "1.3.4", name: "Orientation", level: "AA" },
  { sc: "1.3.5", name: "Identify Input Purpose", level: "AA" },
  { sc: "1.4.1", name: "Use of Color", level: "A" },
  { sc: "1.4.2", name: "Audio Control", level: "A" },
  { sc: "1.4.3", name: "Contrast (Minimum)", level: "AA" },
  { sc: "1.4.4", name: "Resize Text", level: "AA" },
  { sc: "1.4.5", name: "Images of Text", level: "AA" },
  { sc: "1.4.10", name: "Reflow", level: "AA" },
  { sc: "1.4.11", name: "Non-text Contrast", level: "AA" },
  { sc: "1.4.12", name: "Text Spacing", level: "AA" },
  { sc: "1.4.13", name: "Content on Hover or Focus", level: "AA" },
  { sc: "2.1.1", name: "Keyboard", level: "A" },
  { sc: "2.1.2", name: "No Keyboard Trap", level: "A" },
  { sc: "2.1.4", name: "Character Key Shortcuts", level: "A" },
  { sc: "2.2.1", name: "Timing Adjustable", level: "A" },
  { sc: "2.2.2", name: "Pause, Stop, Hide", level: "A" },
  { sc: "2.3.1", name: "Three Flashes or Below Threshold", level: "A" },
  { sc: "2.4.1", name: "Bypass Blocks", level: "A" },
  { sc: "2.4.2", name: "Page Titled", level: "A" },
  { sc: "2.4.3", name: "Focus Order", level: "A" },
  { sc: "2.4.4", name: "Link Purpose (In Context)", level: "A" },
  { sc: "2.4.5", name: "Multiple Ways", level: "AA" },
  { sc: "2.4.6", name: "Headings and Labels", level: "AA" },
  { sc: "2.4.7", name: "Focus Visible", level: "AA" },
  { sc: "2.4.11", name: "Focus Not Obscured (Minimum)", level: "AA" },
  { sc: "2.5.1", name: "Pointer Gestures", level: "A" },
  { sc: "2.5.2", name: "Pointer Cancellation", level: "A" },
  { sc: "2.5.3", name: "Label in Name", level: "A" },
  { sc: "2.5.4", name: "Motion Actuation", level: "A" },
  { sc: "2.5.7", name: "Dragging Movements", level: "AA" },
  { sc: "2.5.8", name: "Target Size (Minimum)", level: "AA" },
  { sc: "3.1.1", name: "Language of Page", level: "A" },
  { sc: "3.1.2", name: "Language of Parts", level: "AA" },
  { sc: "3.2.1", name: "On Focus", level: "A" },
  { sc: "3.2.2", name: "On Input", level: "A" },
  { sc: "3.2.3", name: "Consistent Navigation", level: "AA" },
  { sc: "3.2.4", name: "Consistent Identification", level: "AA" },
  { sc: "3.2.6", name: "Consistent Help", level: "A" },
  { sc: "3.3.1", name: "Error Identification", level: "A" },
  { sc: "3.3.2", name: "Labels or Instructions", level: "A" },
  { sc: "3.3.3", name: "Error Suggestion", level: "AA" },
  { sc: "3.3.4", name: "Error Prevention (Legal, Financial, Data)", level: "AA" },
  { sc: "3.3.7", name: "Redundant Entry", level: "A" },
  { sc: "3.3.8", name: "Accessible Authentication (Minimum)", level: "AA" },
  { sc: "4.1.2", name: "Name, Role, Value", level: "A" },
  { sc: "4.1.3", name: "Status Messages", level: "AA" },];

/** Lookup by dotted SC number, for mapping violation tags onto rows. */
export const WCAG_22_BY_SC: ReadonlyMap<string, WcagCriterion> = new Map(
  WCAG_22_CRITERIA.map((c) => [c.sc, c]),
);
