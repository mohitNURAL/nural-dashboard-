// What's new (SRS 16). Every update that changes what people see adds one entry here, newest first,
// with the steps that walk through it. People who have not seen an entry get a "New" dot on its
// tab and a toast; opening the tab walks them through it once. Entries for tabs a person cannot
// open are skipped.
import type { Tab } from '../filters/toParams';
import type { TourStep } from './steps';

export interface WhatsNew {
  /** Stable id, saved in each person's settings once seen. */
  id: string;
  date: string;
  tab: Tab;
  title: string;
  steps: TourStep[];
}

const slot = (group: string, id: string) => `[data-group="${group}"] [data-slot="${id}"]`;

export const WHATS_NEW: WhatsNew[] = [
  {
    id: '2026-10-11-drawer',
    date: '2026-10-11',
    tab: 'dev',
    title: 'New menu, page tools and Employee module',
    steps: [
      {
        target: '[data-tour="drawer"]',
        title: 'The new menu',
        text: 'All pages are now in this menu on the left. Hover it to open; click ☰ to pin it open, and again to unpin. Admins, PM and team leads also find the Employee module here: Company tree, People directory and, for admins, Access permissions.',
      },
      {
        target: '[data-tour="dock"]',
        title: 'Page tools',
        text: 'Customise, the guided tour, reading aloud and Reset layout are now icons on the right. Hover any icon for its name.',
      },
    ],
  },
  {
    id: '2026-10-11-customise',
    date: '2026-10-11',
    tab: 'dev',
    title: 'Customise, tour any point, export one card',
    steps: [
      {
        target: '[data-tour="customise"]',
        title: 'Customise',
        text: 'Choose which tiles and cards to show on each tab. Hidden ones leave no gap, and you bring them back here.',
      },
      {
        target: slot('dev.cards', 'assignees'),
        title: 'A toolbar on every data point',
        text: 'Hover any tile, card or list: ⠿ moves it, ? explains just that point, the eye hides it.',
      },
      {
        target: slot('dev.cards', 'ageing'),
        title: 'Export one card',
        text: 'Click a card’s title to bring it to the centre, then Excel or PDF exports only that card, with the filters and time on it.',
      },
    ],
  },
  {
    id: '2026-10-11-tour',
    date: '2026-10-11',
    tab: 'dev',
    title: 'Guided tour',
    steps: [
      {
        target: '[data-tour="profile"]',
        title: 'Guided tour',
        text: 'Your profile menu now has "Take the tour of this tab": it explains every tile, card and list on the tab you are on, for your role. Turn on "Read the tour aloud" to hear it. New features will be shown to you like this.',
      },
    ],
  },
  {
    id: '2026-10-11-layout',
    date: '2026-10-11',
    tab: 'dev',
    title: 'Arrange your dashboard',
    steps: [
      {
        target: slot('dev.tiles', 'total'),
        title: 'Drag to rearrange',
        text: 'Hover a tile, card or section and drag the grip ⠿ at its top to move it. Each stays in its own group, and cards resize to fill their row: drop a half card next to a full one and both become half. Your layout is saved for you on any computer; Profile → Layout → Reset puts it back.',
      },
      {
        target: slot('dev.cards', 'assignees'),
        title: 'Focus view',
        text: 'Click a card’s title or empty area to bring it to the centre, larger, with the page blurred behind. Click outside or press Escape to put it back.',
      },
    ],
  },
  {
    id: '2026-10-11-support-tab',
    date: '2026-10-11',
    tab: 'support',
    title: 'Support tab',
    steps: [
      {
        target: '[data-tour="support-hero"]',
        title: 'The Support tab',
        text: 'Coming soon, and built from your answers: tell us what you track, the reports you make by hand and the numbers you wish you had.',
      },
      {
        target: slot('support.cards', 'form'),
        title: 'Share your needs',
        text: 'A few ticks and one sentence about your biggest problem is enough.',
      },
    ],
  },
  {
    id: '2026-10-11-bulk-edit',
    date: '2026-10-11',
    tab: 'dev',
    title: 'Edit tasks in place and in bulk',
    steps: [
      {
        target: slot('dev.sections', 'all'),
        title: 'Edit in place and in bulk',
        text: 'Open a task list: click a Stage, Status or Tags cell to change it in Bitrix24 (team leads also Project, Assignee, Priority and Deadline). Tick rows, or the header box for all, then Check and Apply to change many at once. Pages of 10, 25, 50 or 100 rows.',
        member:
          'Open a task list: click a Stage, Status or Tags cell of your task to change it in Bitrix24. Tick rows, or the header box for all, then Check and Apply to change many at once.',
      },
    ],
  },
];
