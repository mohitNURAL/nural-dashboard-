// Frequently asked questions (Help › FAQs, SRS 20), by topic. Plain text; the page searches it.

export interface Faq {
  q: string;
  a: string;
}

export const FAQ: { topic: string; items: Faq[] }[] = [
  {
    topic: 'The numbers',
    items: [
      {
        q: 'Why does the same number differ between two places?',
        a: 'Each data point counts within its own department or group. Development counts the Development department’s tasks and issues, QA the bugs and feedback, KPI the whole company, Insights the period you chose. So "Open tasks" on KPI and "Pending" on Development can differ. Click any number to see exactly which tasks it counts.',
      },
      {
        q: 'What does the "i" next to a number mean?',
        a: 'It says exactly what that number counts and what your filters cover ("Showing: …").',
      },
      {
        q: 'A number looks different from Bitrix24.',
        a: 'Check the filters at the top and the All / Dev / Issues switch. Changes arrive within seconds; if Live in the top bar is not green, refresh the page.',
      },
      {
        q: 'What is "overdue" and "today"?',
        a: 'Times are Indian Standard Time. A task is overdue when its deadline has passed and it is still open (not in QA Backlog or later, not on hold).',
      },
    ],
  },
  {
    topic: 'Clicking and filtering',
    items: [
      {
        q: 'What happens when I click a number?',
        a: 'The page dims, the number stays lit, and its list opens in the middle of the screen. Escape, a click outside or ✕ puts it back. On Insights a tile first lists the projects or people it counts.',
      },
      {
        q: 'How do I clear the filters?',
        a: 'Reset filters at the right of the filter bar clears them all.',
      },
    ],
  },
  {
    topic: 'Changing tasks',
    items: [
      {
        q: 'Who can change what?',
        a: 'Members change the stage, status and tags of their tasks. Team leads, PM, product owners and admins change every field: project, assignee, priority and deadline too. Your rights are on the Access permissions screen (admins).',
      },
      {
        q: 'Bitrix24 refused my change.',
        a: 'The message says why: often no rights on that task in Bitrix24. Signing out and in again picks up new Bitrix24 permissions.',
      },
    ],
  },
  {
    topic: 'Making it yours',
    items: [
      {
        q: 'Can I rearrange the page?',
        a: 'Yes: drag ⠿ to move tiles, cards, lists and menu modules; hide data points with the eye or Customise; choose table columns with Columns; drag table rows into your own order. Reset layout puts everything back.',
      },
      {
        q: 'How do I export?',
        a: 'A card: open it in focus (click its title) and choose Excel or PDF. A whole page: Export page in the page tools on the right. A task list: its Excel button.',
      },
    ],
  },
  {
    topic: 'Access and sign-in',
    items: [
      {
        q: 'I cannot see a page.',
        a: 'Pages follow your rights. Ask a dashboard admin; they can open a page for you or your department.',
      },
      {
        q: 'Why was I signed out?',
        a: 'Sessions last 3 days from sign-in. Sign in again with Bitrix24 from the page that opens.',
      },
    ],
  },
  {
    topic: 'Insights and reports',
    items: [
      {
        q: 'Where do Insights come from?',
        a: 'From Bitrix24 tasks and their history on the dashboard. Leave and attendance from Infowan join once it is connected.',
      },
      {
        q: 'Why did I get a report by mail or Slack?',
        a: 'Admins set up performance reports in Integration › Mailing; each person gets only their own part.',
      },
    ],
  },
];
