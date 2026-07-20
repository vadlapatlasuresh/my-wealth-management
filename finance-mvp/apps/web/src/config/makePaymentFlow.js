/**
 * Step definitions for the Make Payment wizard.
 *
 * Lives outside MakePaymentPage so App.jsx can reference DONE_STEP without eagerly
 * importing the page module — the page is lazy-loaded via the module registry and
 * importing from it directly would pull it into the main bundle.
 */

export const STEPS = [
  { label: "Payee", icon: "1" },
  { label: "Payment", icon: "2" },
  { label: "Review", icon: "3" },
  { label: "Done", icon: "4" },
];

/** Index of the confirmation screen — App.jsx jumps here after a successful submit. */
export const DONE_STEP = STEPS.length - 1;
