import type { OasisItem, OasisSection } from "./types.ts";

// Curated subset of OASIS-E items. The value codes match OASIS; the response labels
// are condensed from the official wording so they fit a mobile picker.
export const OASIS_ITEMS = [
  {
    code: "M1800",
    label: "Grooming",
    section: "functional",
    responses: [
      { value: "0", label: "Grooms self unaided" },
      { value: "1", label: "Needs utensils placed within reach" },
      { value: "2", label: "Someone must assist" },
      { value: "3", label: "Fully dependent" },
    ],
  },
  {
    code: "M1810",
    label: "Dress Upper Body",
    section: "functional",
    responses: [
      { value: "0", label: "Dresses upper body unaided" },
      { value: "1", label: "Independent if clothing laid out" },
      { value: "2", label: "Needs help putting on" },
      { value: "3", label: "Fully dependent" },
    ],
  },
  {
    code: "M1820",
    label: "Dress Lower Body",
    section: "functional",
    responses: [
      { value: "0", label: "Dresses lower body unaided" },
      { value: "1", label: "Independent if clothing laid out" },
      { value: "2", label: "Needs help putting on" },
      { value: "3", label: "Fully dependent" },
    ],
  },
  {
    code: "M1830",
    label: "Bathing",
    section: "functional",
    responses: [
      { value: "0", label: "Bathes independently" },
      { value: "1", label: "Independent with devices" },
      { value: "2", label: "Needs intermittent assistance" },
      { value: "3", label: "Needs someone present throughout" },
      { value: "4", label: "Bathes at sink/chair independently" },
      { value: "5", label: "Bathes at sink/chair with assistance" },
      { value: "6", label: "Totally bathed by another" },
    ],
  },
  {
    code: "M1840",
    label: "Toilet Transferring",
    section: "functional",
    responses: [
      { value: "0", label: "Transfers to toilet independently" },
      { value: "1", label: "Needs reminder or supervision" },
      { value: "2", label: "Uses bedside commode" },
      { value: "3", label: "Uses bedpan/urinal independently" },
      { value: "4", label: "Totally dependent in toileting" },
    ],
  },
  {
    code: "M1850",
    label: "Transferring",
    section: "functional",
    responses: [
      { value: "0", label: "Transfers independently" },
      { value: "1", label: "Minimal assistance or device" },
      { value: "2", label: "Bears weight but can't transfer self" },
      { value: "3", label: "Can't bear weight or pivot" },
      { value: "4", label: "Bedfast, can reposition self" },
      { value: "5", label: "Bedfast, can't reposition self" },
    ],
  },
  {
    code: "M1860",
    label: "Ambulation/Locomotion",
    section: "functional",
    responses: [
      { value: "0", label: "Walks independently, incl. stairs" },
      { value: "1", label: "Independent with one-handed device" },
      { value: "2", label: "Needs two-handed device or supervision" },
      { value: "3", label: "Walks only with assistance" },
      { value: "4", label: "Chairfast, wheels self" },
      { value: "5", label: "Chairfast, can't wheel self" },
      { value: "6", label: "Bedfast" },
    ],
  },
  {
    code: "M1870",
    label: "Feeding or Eating",
    section: "functional",
    responses: [
      { value: "0", label: "Feeds self independently" },
      { value: "1", label: "Needs setup or supervision" },
      { value: "2", label: "Needs assistance or food modification" },
      { value: "3", label: "Fed by another person" },
      { value: "4", label: "Nutrition by tube or other means" },
      { value: "5", label: "Fully dependent, unable to feed" },
    ],
  },
  {
    code: "M1700",
    label: "Cognitive Functioning",
    section: "cognitive",
    responses: [
      { value: "0", label: "Alert, oriented, independent" },
      { value: "1", label: "Needs prompting when stressed" },
      { value: "2", label: "Needs assistance in specific situations" },
      { value: "3", label: "Needs considerable assistance" },
      { value: "4", label: "Totally dependent (e.g. delirium)" },
    ],
  },
  {
    code: "M1710",
    label: "When Confused",
    section: "cognitive",
    responses: [
      { value: "0", label: "Never" },
      { value: "1", label: "In new or complex situations only" },
      { value: "2", label: "On waking or at night only" },
      { value: "3", label: "During day and evening, not constant" },
      { value: "4", label: "Constantly" },
      { value: "NA", label: "Patient nonresponsive" },
    ],
  },
  {
    code: "M1720",
    label: "When Anxious",
    section: "cognitive",
    responses: [
      { value: "0", label: "None of the time" },
      { value: "1", label: "Less often than daily" },
      { value: "2", label: "Daily, but not constant" },
      { value: "3", label: "All of the time" },
      { value: "NA", label: "Patient nonresponsive" },
    ],
  },
  {
    code: "D0150A",
    label: "Little Interest or Pleasure in Doing Things",
    section: "mood",
    responses: [
      { value: "0", label: "Never or 1 day" },
      { value: "1", label: "2-6 days" },
      { value: "2", label: "7-11 days" },
      { value: "3", label: "12-14 days" },
    ],
  },
  {
    code: "D0150B",
    label: "Feeling Down, Depressed, or Hopeless",
    section: "mood",
    responses: [
      { value: "0", label: "Never or 1 day" },
      { value: "1", label: "2-6 days" },
      { value: "2", label: "7-11 days" },
      { value: "3", label: "12-14 days" },
    ],
  },
  {
    code: "M1745",
    label: "Disruptive Behavior Frequency",
    section: "mood",
    responses: [
      { value: "0", label: "Never" },
      { value: "1", label: "Less than monthly" },
      { value: "2", label: "Once a month" },
      { value: "3", label: "Several times a month" },
      { value: "4", label: "Several times a week" },
      { value: "5", label: "At least daily" },
    ],
  },
] as const satisfies readonly OasisItem[];

export type OasisItemCode = (typeof OASIS_ITEMS)[number]["code"];

const itemsByCode = new Map<string, OasisItem>(OASIS_ITEMS.map((item) => [item.code, item]));

export function getOasisItem(code: string): OasisItem | undefined {
  return itemsByCode.get(code);
}

export const oasisItemsBySection = {
  functional: OASIS_ITEMS.filter((item) => item.section === "functional"),
  cognitive: OASIS_ITEMS.filter((item) => item.section === "cognitive"),
  mood: OASIS_ITEMS.filter((item) => item.section === "mood"),
} satisfies Record<OasisSection, readonly OasisItem[]>;
