"""Builds the user guides, one set per level of access (HTML, printed to PDF by print.mjs).

  python docs/guides/src/build_guides.py   -> docs/guides/src/<set>/user-guide.html, module-guide.html
  node docs/guides/src/print.mjs           -> docs/guides/<set>/*.pdf (needs Chrome on port 9333)

Sets (SETS): member, support, owner, manager, admin. Each has only the pages that level can open,
its own wording (members: "your tasks") and screenshots taken as a person of that level
(docs/guides/img/<set>), so every guide matches what its reader sees. Data-point texts come from
the dashboard itself (steps.json: the guided tour's steps and the "i" definitions, exported from
apps/web/src/features/tour/steps.ts). Every person's and project's name in the screenshots is
replaced by a stand-in, so the guides are safe to share.
"""
import html
import json
import os
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, 'steps.json'), encoding='utf8'))
TODAY = date.today().strftime('%d %B %Y').lstrip('0')
e = html.escape

CSS = """
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@500;700;800&family=Work+Sans:wght@400;500;600&display=swap');
@page { size: A4; margin: 16mm 15mm 18mm; }
@page :first { margin: 0; }
:root { --navy: #18244e; --blue: #32499f; --teal: #13b5c1; --ink: #231f20; --muted: #6b6567; --line: #e3e1e6; --soft: #f3f5fb; }
* { box-sizing: border-box; }
body { font-family: 'Work Sans', system-ui, sans-serif; color: var(--ink); font-size: 10.5pt; line-height: 1.55; margin: 0; }
h1, h2, h3, h4 { font-family: Manrope, system-ui, sans-serif; color: var(--navy); line-height: 1.25; }
.cover { height: 297mm; width: 210mm; padding: 34mm 22mm; color: #fff; position: relative; overflow: hidden; page-break-after: always;
  background: radial-gradient(circle at 85% 15%, rgba(19,181,193,.55), transparent 45%), radial-gradient(circle at 10% 90%, rgba(50,73,159,.9), transparent 55%), linear-gradient(160deg, #0f1836, #18244e 55%, #1d3a7a); }
.cover .brand { font-family: Manrope; font-weight: 800; font-size: 26pt; letter-spacing: .5px; }
.cover .brand span { font-weight: 500; font-size: 13pt; opacity: .75; margin-left: 10px; }
.cover h1 { color: #fff; font-size: 38pt; margin: 58mm 0 6mm; letter-spacing: -.5px; }
.cover p.lead { font-size: 14pt; max-width: 140mm; opacity: .9; }
.cover .meta { position: absolute; bottom: 26mm; left: 22mm; right: 22mm; display: flex; justify-content: space-between; font-size: 10pt; opacity: .8; border-top: 1px solid rgba(255,255,255,.25); padding-top: 5mm; }
.cover .orb { position: absolute; right: -30mm; top: 70mm; width: 120mm; height: 120mm; border-radius: 50%; border: 1px solid rgba(255,255,255,.18); }
.cover .orb.two { right: -10mm; top: 95mm; width: 80mm; height: 80mm; border-color: rgba(19,181,193,.45); }
.toc { page-break-after: always; }
.toc h2 { font-size: 20pt; margin: 0 0 6mm; }
.toc ol { list-style: none; padding: 0; margin: 0; counter-reset: c; }
.toc li { counter-increment: c; display: flex; align-items: baseline; gap: 4mm; padding: 2.6mm 0; border-bottom: 1px solid var(--line); font-family: Manrope; font-weight: 700; color: var(--navy); }
.toc li::before { content: counter(c, decimal-leading-zero); color: var(--teal); font-weight: 800; width: 9mm; }
.toc li small { margin-left: auto; font-family: 'Work Sans'; font-weight: 400; color: var(--muted); }
section.chapter { page-break-before: always; }
section.chapter:first-of-type { page-break-before: auto; }
.chead { display: flex; align-items: center; gap: 4mm; margin-bottom: 4mm; }
.num { width: 13mm; height: 13mm; border-radius: 4mm; display: grid; place-items: center; color: #fff; font-family: Manrope; font-weight: 800; font-size: 13pt; background: linear-gradient(135deg, var(--blue), var(--teal)); box-shadow: 0 4px 12px rgba(50,73,159,.3); }
.chead h2 { margin: 0; font-size: 19pt; }
.chead p { margin: 0; color: var(--muted); }
h3 { font-size: 12.5pt; margin: 6mm 0 2mm; }
p { margin: 0 0 3mm; }
ul { margin: 0 0 3mm; padding-left: 5mm; }
li { margin: 1mm 0; }
figure { margin: 4mm 0 5mm; page-break-inside: avoid; }
figure img { width: 100%; border-radius: 3mm; border: 1px solid var(--line); box-shadow: 0 6px 18px rgba(24,36,78,.12); display: block; }
figure.narrow img { width: auto; max-width: 100%; max-height: 120mm; margin: 0 auto; }
figure.side { display: flex; gap: 6mm; align-items: flex-start; }
figure.side img { width: 50mm; flex: none; }
figure.side figcaption { margin-top: 0; }
figcaption { font-size: 9pt; color: var(--muted); margin-top: 2mm; text-align: center; }
figure.side figcaption { text-align: left; }
.callout { border-radius: 3mm; padding: 3.5mm 4.5mm; margin: 4mm 0; background: var(--soft); border-left: 3px solid var(--blue); page-break-inside: avoid; }
.callout.tip { border-left-color: var(--teal); background: #eefafb; }
.callout.warn { border-left-color: #e0a100; background: #fff8e6; }
.callout b { font-family: Manrope; color: var(--navy); }
table { width: 100%; border-collapse: separate; border-spacing: 0; margin: 3mm 0 5mm; font-size: 9.5pt; page-break-inside: auto; }
th { text-align: left; font-family: Manrope; font-size: 8pt; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); padding: 2mm 3mm; border-bottom: 1.5px solid var(--navy); }
td { padding: 2.4mm 3mm; border-bottom: 1px solid var(--line); vertical-align: top; }
tr { page-break-inside: avoid; }
td.name { font-family: Manrope; font-weight: 700; color: var(--navy); width: 30%; }
.pill { display: inline-block; padding: .4mm 2.2mm; border-radius: 9mm; font-family: Manrope; font-size: 8pt; font-weight: 700; background: #e8ecf8; color: var(--blue); margin: 0 1mm 1mm 0; }
.pill.t { background: #e2f7f8; color: #0b8f99; }
.who { display: flex; flex-wrap: wrap; gap: 1mm; margin: 0 0 3mm; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; }
.card { border: 1px solid var(--line); border-radius: 3mm; padding: 3.5mm 4mm; page-break-inside: avoid; }
.card h4 { margin: 0 0 1.5mm; font-size: 11pt; }
.card p { margin: 0; font-size: 9.5pt; color: #3a3537; }
.small { font-size: 9pt; color: var(--muted); }
"""

IMG = '../../img/'

# What each level can open, and how it reads (the dock picks the set from the person's rights).
SETS = {
    'member': dict(label='Members', who='a team member', pages=['dev', 'qa', 'insights', 'feedback', 'docs', 'faq'], member=True, edit='limited'),
    'support': dict(label='Support team', who='a member of the Tech Support team', pages=['dev', 'qa', 'support', 'insights', 'feedback', 'docs', 'faq'], member=True, edit='limited'),
    'owner': dict(label='Product owners', who='a product owner', pages=['kpi', 'dev', 'qa', 'insights', 'feedback', 'docs', 'faq'], member=False, edit='all'),
    'manager': dict(label='Team leads and PM', who='a team lead or project manager', pages=['kpi', 'dev', 'qa', 'support', 'insights', 'org', 'people', 'feedback', 'docs', 'faq'], member=False, edit='all'),
    'admin': dict(label='Admins', who='an admin', pages=['kpi', 'dev', 'qa', 'support', 'insights', 'org', 'people', 'access', 'connections', 'mailing', 'feedback', 'docs', 'faq', 'finance'], member=False, edit='all'),
}


def fig(set_, name, caption, cls=''):
    return f'<figure class="{cls}"><img src="{IMG}{set_}/{name}.jpg" alt=""><figcaption>{e(caption)}</figcaption></figure>'


def callout(kind, title, text):
    return f'<div class="callout {kind}"><b>{e(title)}</b> {text}</div>'


def chapter(n, title, sub, body):
    return (f'<section class="chapter" id="c{n}"><div class="chead"><div class="num">{n:02d}</div>'
            f'<div><h2>{e(title)}</h2><p>{e(sub)}</p></div></div>{body}</section>')


def cover(title, lead, label):
    return (f'<div class="cover"><div class="orb"></div><div class="orb two"></div>'
            f'<div class="brand">Nural<span>Pulse</span></div>'
            f'<h1>{e(title)}</h1><p class="lead">{e(lead)}</p>'
            f'<p class="lead" style="margin-top:6mm;font-size:12pt;opacity:.75">For {e(label)}</p>'
            f'<div class="meta"><span>NURALTECH · internal · Powered by Bitrix24 and Nural</span><span>{TODAY}</span></div></div>')


def toc(items):
    lis = ''.join(f'<li>{e(t)}<small>{e(s)}</small></li>' for t, s in items)
    return f'<div class="toc"><h2>Contents</h2><ol>{lis}</ol></div>'


def doc(title, body):
    return f'<!doctype html><html lang="en"><head><meta charset="utf-8"><title>{e(title)}</title><style>{CSS}</style></head><body>{body}</body></html>'


PAGE_CARD = {
    'kpi': ('KPI', 'The management overview: open, on hold, overdue, closed, on-time, active projects, no deadline; insights, project health, overdue breakdown, workload, people and activity. Day, Week or Month.'),
    'dev': ('Development', "The Development department's tasks and issues: totals, pending, on hold, ready, deployed, overdue, done today; per person or project, ageing, ranking and stages; task lists and alerts."),
    'qa': ('QA', 'Bugs and feedback: filed, open, on hold, last filed and resolved, rework and retesting awaited; by person, rework, testing workload, retest queue, trend, ageing and stages.'),
    'support': ('Support', 'Coming soon. Tell us what the Support tab should show; your answers shape it.'),
    'insights': ('Insights', 'What is holding us back: lagging projects and people, overload, people with room to help, projects pulling people off others, and releases at risk. Every finding opens its tasks.'),
    'connections': ('Connections', 'Microsoft 365 mail, Slack and Infowan: connected or not, a test to yourself, and how to connect each.'),
    'mailing': ('Mailing', 'Performance reports by mail and Slack: when, to whom, what and how. New reports go only to admins until switched to Live.'),
    'feedback': ('Feedback', 'Tell us about an issue or idea: about the dashboard, a page, a project or a person, with screenshots, PDF, Excel or Word files. Follow your own; the inbox reads everyone\'s.'),
    'docs': ('Documents', 'These guides to download: the whole dashboard, or one page at a time.'),
    'faq': ('FAQs', 'Answers to the questions people ask most, by topic, with search.'),
    'finance': ('Cost to company', 'Coming soon, for admins only: tell us what it should show.'),
    'org': ('Company tree', 'Departments as in Bitrix24, with heads and people.'),
    'people': ('People directory', "Everyone's designation, department, access areas, dashboard status, last active, and open and overdue tasks."),
    'access': ('Access permissions', 'Set each right per person or department; every change is logged.'),
}

LEVELS_TABLE = '''<table><tr><th>Level</th><th>Data</th><th>Pages</th><th>Can change on tasks</th></tr>
<tr><td class="name">Admin</td><td>Everything</td><td>All, including Access permissions, Integration (Connections, Mailing) and Finance</td><td>Every field</td></tr>
<tr><td class="name">Project manager, team lead</td><td>Everything</td><td>KPI, Development, QA, Support, Insights, Company tree, People directory</td><td>Every field</td></tr>
<tr><td class="name">Product owner</td><td>Everything</td><td>KPI, Development, QA, Insights</td><td>Every field</td></tr>
<tr><td class="name">Member</td><td>Tasks assigned to them or created by them</td><td>Development, QA, My insights (and Support for the Tech Support team)</td><td>Stage, status and tags</td></tr></table>'''


def user_guide(key):
    S = SETS[key]
    pages = S['pages']
    member = S['member']
    names = ', '.join(PAGE_CARD[p][0] for p in pages)
    scope = ('Every number, list, chart and export counts <b>only your own tasks</b>: those assigned to you or created by you.'
             if member else 'You see <b>every project and every person</b>.')
    edits = ('the stage, status and tags of your tasks' if S['edit'] == 'limited'
             else 'every field of a task: stage, status, tags, project, assignee, priority and deadline')
    cells = ('a Stage, Status or Tags cell' if S['edit'] == 'limited'
             else 'a Stage, Status, Tags, Project, Assignee, Priority or Deadline cell (deadlines in the future only)')
    ch = []

    ch.append(('Welcome', 'What the dashboard is for',
        '<p>Nural Pulse, the live heartbeat of every project and person, shows work in one place, live from Bitrix24: tasks, deadlines, bugs and feedback, and how things are going. '
        'A change made in Bitrix24 reaches the dashboard within seconds, and a change made on the dashboard is made in Bitrix24, in your name.</p>'
        f'<p>This guide is for <b>{e(S["label"].lower())}</b>. {scope} It covers the pages you can open: {e(names)}.</p>'
        + fig(key, 'page-' + pages[0], f'The {PAGE_CARD[pages[0]][0]} page as you see it: the menu on the left, page tools on the right (names replaced).')))

    ch.append(('Signing in', 'Your Bitrix24 account is your key',
        '<p>Open the dashboard and choose <b>Sign in with Bitrix24</b>. Use your Nural Bitrix24 account; the dashboard never sees your password.</p>'
        '<ul><li>You stay signed in for <b>3 days</b>. Then the dashboard shows <i>Your session ended</i>; sign in again from there.</li>'
        '<li><b>Sign out</b> is in your profile menu (your initials, top right).</li>'
        '<li>If a change to a task says Bitrix24 refused it, sign out and in again so the dashboard picks up your Bitrix24 permissions.</li></ul>'
        + callout('tip', 'After an update', 'A toast says a new version is ready and lists what is new. Click <b>Refresh</b> to get it.')))

    ch.append(('What you can see and do', 'Your access',
        f'<p>As {e(S["who"])} you open {e(names)}. {scope} You can change {e(edits)}.</p>'
        + callout('', 'Rights can change.', "Admins can widen or narrow anyone's access per person or per department; the menu always shows exactly what you can open.")
        + ('' if member else LEVELS_TABLE)))

    groups = ['<b>Dashboard</b>: ' + ', '.join(PAGE_CARD[p][0] for p in pages if p in ('kpi', 'dev', 'qa', 'support')) + '.']
    groups.append('<b>Insights</b>: ' + ('My insights' if member else 'Insights') + '.')
    emp = [PAGE_CARD[p][0] for p in pages if p in ('org', 'people', 'access')]
    if emp:
        groups.append('<b>Employees</b>: ' + ', '.join(emp) + '.')
    integ = [PAGE_CARD[p][0] for p in pages if p in ('connections', 'mailing')]
    if integ:
        groups.append('<b>Integration</b>: ' + ', '.join(integ) + '.')
    groups.append('<b>Help</b>: Feedback, Documents, FAQs.')
    if 'finance' in pages:
        groups.append('<b>Finance</b>: Cost to company (admins only).')
    ch.append(('Finding your way', 'Menu, top bar and page tools',
        f'<figure class="side"><img src="{IMG}{key}/drawer.jpg" alt=""><figcaption><b>The menu</b> sits on the left, by module, each with its icon. Closed, it shows icons; hover it to open it, and move away to close it. '
        'Click <b>☰</b> to pin it open. The module of the page you are on is highlighted and open; click another module to open it. Drag ⠿ to put modules, and pages within their module, in your order.<br><br>'
        + '<br>'.join(groups) + '<br><br>A teal dot on an icon means something new is there.</figcaption></figure>'
        '<h3>The top bar</h3><ul><li><b>Where you are</b>: e.g. Dashboard › QA.</li>'
        f'<li><b>Alerts</b> (bell): overdue tasks and tasks stuck over 5 days in one stage{" (yours)" if member else ""}; click for the list.</li>'
        '<li><b>Live</b>: green when updates are flowing in from Bitrix24.</li>'
        '<li><b>Profile</b>: your name and role, the theme (Light, Dark, System), live-update toasts and Sign out.</li></ul>'
        f'<figure class="side"><img src="{IMG}{key}/dock.jpg" alt="" style="width:16mm"><figcaption><b>Page tools</b> float on the right, as icons; hover any icon for its name.<br><br>'
        '<b>Customise</b>: choose the tiles and cards to show.<br><b>Guided tour</b>: a walk through the page.<br><b>Guides</b>: this guide and the Module guide.<br>'
        '<b>Voice</b>: read tours aloud.<br><b>Reset layout</b>: back to the default, with Undo.</figcaption></figure>'))

    ch.append(('Reading the numbers', 'Tiles, cards, filters and drill-downs',
        fig(key, 'tiles', 'Tiles: one number each, split into parts (e.g. Dev and Issues). Click a tile or a part to list its tasks.')
        + '<ul><li><b>Filters</b> under the top bar (project, assignee, tag or bug/feedback, date range) narrow every number on the page. <b>Reset filters</b> clears them.</li>'
        '<li>The <b>i</b> next to any number says exactly what it counts, and what your filters cover.</li>'
        '<li><b>Click any number</b>, bar or cell to see the tasks behind it: the page dims, the number stays lit and its list opens in the middle of the screen. Escape or ✕ puts it back.</li>'
        '<li><b>Switches</b> at the top (Day / Week / Month, All / Dev / Issues, 7 / 14 / 30 days) change only some data points; the guided tour lights up exactly which.</li></ul>'
        + callout('', 'One number, two places.', 'The same data point can show a different number on two pages, because each counts within its own department or group: Development counts the Development department, QA the bugs and feedback, KPI the whole company, Insights the period you chose. Click the number to see exactly which tasks it counts.')
        + (callout('', 'Your scope.', scope) if member else '')
        + fig(key, 'tasklist', 'A task list: sortable columns, edit in place, tick boxes for bulk edit, Excel export and pages of 10 to 100 rows.')
        + fig(key, 'taskview', 'Clicking a task opens its view: every detail, the description and its history, with Open in Bitrix24.')))

    ch.append(('Insights', 'What is holding us back',
        ('<p><b>My insights</b> looks at your own tasks: what is overdue, what is due soon, and where your work is split across projects.</p>' if member else
         '<p><b>Insights</b> ranks what is holding the work back: projects pulling people off other projects, releases at risk, lagging projects, overloaded people, lagging people and people with room to help.</p>')
        + '<ul><li>Choose the period (7, 14 or 30 days) at the top.</li><li>Every finding names its numbers; <b>click it</b> to list the tasks behind it.</li>'
        '<li>Leave and attendance from Infowan join the findings once Infowan is connected; until then Insights uses Bitrix24 and dashboard data only.</li></ul>'
        + fig(key, 'page-insights', ('My insights' if member else 'Insights') + ', as you see it (names replaced).')))

    ch.append(('Changing tasks', 'Edit in place and in bulk',
        f'<p>Changes are made in Bitrix24, in your name, and show on the dashboard straight away. You can change {e(edits)}.</p>'
        f'<ul><li><b>Edit in place</b>: click {cells} (or a fact in the task view) and pick the new value.</li>'
        '<li><b>Bulk edit</b>: tick rows (or the header box for the whole list), choose what to change, then <b>Check</b>. Rows that cannot take the change turn red with the reason; <b>Apply</b> changes the rest. Up to 100 tasks at a time.</li>'
        '<li><b>Excel</b>: every list downloads as it is filtered and sorted.</li></ul>'
        + callout('warn', 'Bitrix24 decides.', 'If Bitrix24 refuses a change (for example, no rights on that task), the dashboard says why and nothing changes.')))

    ch.append(('Make it yours', 'Arrange, hide, focus and export',
        fig(key, 'toolbar', 'Hover any tile, card or list: ⠿ moves it, ? explains it, the eye hides it.', 'narrow')
        + '<ul><li><b>Drag</b> by ⠿ to put tiles, cards and lists in your order. Each stays in its own group, and cards resize to fill their row: drop a half-width card next to a full one and both become half.</li>'
        '<li><b>Hide</b> a tile or card with the eye; bring it back with <b>Customise</b>. Task lists cannot be hidden.</li>'
        '<li><b>Tables</b>: <b>Columns</b> chooses and orders the columns (or drag a column header); drag a row by ⠿ to put rows in your own order (<b>Your order</b>). Excel files follow your columns and order.</li>'
        '<li><b>Export page</b> in the page tools: every data point on the page as one Excel workbook or a PDF.</li>'
        '<li>Your layout is saved for you and follows you to any computer. <b>Reset layout</b> puts everything back.</li></ul>'
        + fig(key, 'customise', 'Customise: tick the tiles and cards to show on this page.', 'narrow')
        + '<h3>Focus view and export</h3><p>Click a card\'s title (or an empty part of it) to bring it to the centre, larger, with the page blurred behind. '
        'Then <b>Excel</b> exports that card\'s data, and <b>PDF</b> saves a picture of the whole card with the filters and time on it. Press Escape or click outside to put it back.</p>'
        + fig(key, 'focus', 'Focus view: one card in the centre, with Excel, PDF and close.')))

    ch.append(("Guided tour and what's new", 'Let the dashboard show you around',
        fig(key, 'tour', 'A tour bubble next to the part it explains, with a step count, Back / Next and Voice.')
        + '<ul><li>On your <b>first three sign-ins</b> each page explains itself when you open it: your role first, then every tile, card and list you can see. The last step offers the next page.</li>'
        '<li>Any time: the <b>Guided tour</b> icon on the right, or <b>?</b> on a single data point.</li>'
        '<li><b>Voice</b>: turn it on to hear each step read aloud (browser voice; Edge sounds most natural).</li>'
        "<li><b>What's new</b>: after an update, the refresh toast lists the changes, the page with something new gets a dot, and opening it walks you through.</li></ul>"))

    cards = ''.join(f'<div class="card"><h4>{e(PAGE_CARD[p][0])}</h4><p>{e(PAGE_CARD[p][1])}</p></div>' for p in pages)
    ch.append(('Your pages at a glance', 'See the Module guide for every data point', f'<div class="grid2">{cards}</div>'))

    ch.append(('Help', 'Common questions',
        '<h3>A number looks different from Bitrix24</h3><p>Check the filters at the top and the switch (All, Dev, Issues); the <b>i</b> says what each number counts.'
        + (' You see only your own tasks.' if member else '') + ' Changes arrive within seconds; if Live is not green, refresh.</p>'
        f'<h3>I cannot change a task</h3><p>You can change {e(edits)}.'
        + (' Other fields are for team leads, PM and admins.' if S['edit'] == 'limited' else '')
        + ' If Bitrix24 refuses, the message says why. Signing out and in again picks up new Bitrix24 permissions.</p>'
        '<h3>I was signed out</h3><p>Sessions last 3 days from sign-in. Sign in again from the page that opens.</p>'
        '<h3>I need a page I do not see</h3><p>Pages follow your rights. Ask a dashboard admin.</p>'
        '<h3>My layout looks odd</h3><p>Use <b>Reset layout</b> in the page tools on the right.</p>'
        + callout('tip', 'Still stuck?', 'Ask a dashboard admin' + (', or use the Support page to tell us.' if 'support' in pages else '.'))))

    body = cover('User guide', 'Signing in, finding your way, reading the numbers, changing tasks and making the dashboard yours.', S['label'])
    body += toc([(t, s) for t, s, _ in ch])
    body += ''.join(chapter(i + 1, t, s, b) for i, (t, s, b) in enumerate(ch))
    return doc(f'Nural Pulse: User guide ({S["label"]})', body)


# ---------------------------------------------------------------- Module guide

MODULES = [
    ('kpi', 'KPI', 'Management overview', 'The management overview of every project and department. Period: Day, Week or Month; "closed" and "on-time" compare with the period before.'),
    ('dev', 'Development', 'Tasks, issues and deadlines', "The Development department's tasks and issues. The All / Dev / Issues switch at the top steers every number."),
    ('qa', 'QA', 'Bugs, feedback, testing and retesting', 'Bugs and feedback (tasks tagged bug or feedback), testing work and the retest queue. The Bug or Feedback filter narrows the page.'),
    ('support', 'Support', 'Feedback for the coming Support tab', 'Coming soon. Until then it collects what the support team and management need; admins and the Support lead read the answers.'),
    ('insights', 'Insights', 'What is holding us back', 'Findings from Bitrix24 and dashboard data, ranked: causes first (projects pulling people away), then releases at risk, lagging projects, overload, lagging people and people with room. Period: 7, 14 or 30 days. Every finding opens its tasks.'),
    ('org', 'Company tree', 'Departments, heads and people', 'The company structure from Bitrix24: departments, their heads and people.'),
    ('people', 'People directory', 'Who has access, who is active', 'Everyone in Bitrix24 with what they can open on the dashboard and whether they use it.'),
    ('access', 'Access permissions', 'Rights per person or department', 'Who sees what and who may change what, set per person or department, with every change logged.'),
    ('feedback', 'Feedback', 'Issues and ideas, with attachments', 'Send feedback about the dashboard, a page, a project or a person (only those you can see), with up to 5 attachments of 8 MB: images (paste a screenshot with Ctrl+V), PDF, Excel, Word. My feedback shows what you sent and the reply. The Feedback inbox (admins, PM and team leads) reads everyone\'s, replies and exports to Excel.'),
    ('docs', 'Documents', 'The PDF guides', 'The guides for your level of access: the whole dashboard (User guide, Module guide) and one short guide per page you can open.'),
    ('faq', 'FAQs', 'Common questions', 'Answers by topic: the numbers, clicking and filtering, changing tasks, making it yours, access and sign-in, Insights and reports. Search at the top.'),
    ('finance', 'Cost to company', 'Finance, admins only', 'Coming soon. Admins tell us what Cost to company should show and which decisions it should help with; only admins read the answers.'),
    ('connections', 'Connections', 'Microsoft 365, Slack and Infowan', 'Where reports go and where leave comes from. Keys are kept only on the server; each service shows whether it is connected and sends a test to you.'),
    ('mailing', 'Mailing', 'Performance reports by mail and Slack', 'Design reports: when they go, to whom, what they hold and how they are sent. Each person gets their own part.'),
]

EXTRA = {
    'insights': """<h3>The rules</h3><table><tr><th>Finding</th><th>Rule</th></tr>
<tr><td class="name">Lagging project</td><td>3+ overdue and 25 % or more of its open tasks; or no action for 10+ working days; or closing half or less of the period before.</td></tr>
<tr><td class="name">Lagging person</td><td>3+ overdue and 30 % or more of their open tasks; or under 50 % on time; or closing half or less of the period before with 5+ open.</td></tr>
<tr><td class="name">Overloaded</td><td>10+ open and twice the team median, or 8+ due in the next 5 working days.</td></tr>
<tr><td class="name">Has room</td><td>2 or fewer open and closed while one of their projects has overdue work.</td></tr>
<tr><td class="name">Pulling people away</td><td>One project takes 70 % or more of a person's actions while their tasks in another project are overdue.</td></tr>
<tr><td class="name">Release risk</td><td>Open tasks due this week or next: high if overdue, or not started and due within 2 working days.</td></tr></table>""",
    'mailing': """<h3>A report</h3><table><tr><th>Part</th><th>Choices</th></tr>
<tr><td class="name">When</td><td>Daily (working days), weekly, monthly, or when someone's own numbers are very poor or very good (checked daily, at most once a week each). Times are IST; reports before 12:00 cover the period before.</td></tr>
<tr><td class="name">Who</td><td>Roles and named people. Admins get the company, team leads their team and projects, product owners their projects, members their own tasks.</td></tr>
<tr><td class="name">What</td><td>Topics (how it went, due today, tasks in hand, releases, what went well, what to improve, lagging, load, what is holding us back, leave) and questions for the reader.</td></tr>
<tr><td class="name">How</td><td>Mail with CC, Slack message to each person, Slack channels (one company copy each).</td></tr></table>
<h3>States</h3><table><tr><th>State</th><th>Who gets it</th></tr>
<tr><td class="name">Preview</td><td>Admins only, marked PREVIEW, with the list of who would get it. Every new report starts here.</td></tr>
<tr><td class="name">Live</td><td>Every recipient, on schedule.</td></tr>
<tr><td class="name">Paused</td><td>Nobody.</td></tr></table>
<p><b>Preview</b> on a card shows the mail as any person would get it, sending nothing. <b>Send test</b> sends it to you only. <b>Last runs</b> shows what went out, failed or was skipped.</p>""",
    'dev': '''<h3>Task lists</h3><p>Due today, Overdue, All tasks (follows the last number you clicked) and Alert details. Each list sorts, edits in place, bulk edits, pages and exports to Excel.</p>''',
    'qa': '''<h3>Issue lists</h3><p>Latest filed, Latest resolved and All issues (follows the last number you clicked), with the same editing and export as on Development.</p>''',
    'people': '''<h3>Dashboard status</h3><table><tr><th>Status</th><th>Meaning</th></tr>
<tr><td class="name">Active now</td><td>Used the dashboard in the last 5 minutes.</td></tr>
<tr><td class="name">Signed in</td><td>Signed in less than 3 days ago: the session is still open.</td></tr>
<tr><td class="name">Session ended</td><td>Last signed in more than 3 days ago.</td></tr>
<tr><td class="name">Signed in earlier</td><td>Signed in before sign-in times were kept.</td></tr>
<tr><td class="name">Never signed in</td><td>Active in Bitrix24, never used the dashboard.</td></tr></table>
<h3>Editing (admins)</h3><p><b>Edit</b> on a row changes the person's dashboard role (on the dashboard) and their designation and departments (in Bitrix24, in your name). <b>Manage departments</b> adds, renames and moves departments and sets their heads in Bitrix24. Each change is confirmed first and logged.</p>''',
    'access': '''<h3>The screen</h3><p>Pick a person or a department on the left. On the right every menu module is a card with a master switch; open it for its pages, each with its own switch, and the permissions under them. A dot shows where each value comes from (grey the role, blue a department, teal the person, red a locked admin, amber not saved yet); ↺ goes back to inherited. <b>Allow all modules</b>, <b>Remove all</b>, then <b>Save</b>.</p>
<h3>The rights</h3><table><tr><th>Right</th><th>Values</th><th>What it controls</th></tr>
<tr><td class="name">Data</td><td>All data / Own tasks</td><td>Every project and person, or only tasks assigned to or created by them.</td></tr>
<tr><td class="name">KPI</td><td>On / Off</td><td>The KPI page.</td></tr>
<tr><td class="name">Support</td><td>On / Off</td><td>The Support page and its feedback form.</td></tr>
<tr><td class="name">Inbox</td><td>On / Off</td><td>The Support feedback inbox.</td></tr>
<tr><td class="name">Employees</td><td>On / Off</td><td>Company tree and People directory.</td></tr>
<tr><td class="name">Edit</td><td>All fields / Limited</td><td>Every task field, or only stage, status and tags.</td></tr>
<tr><td class="name">Admin</td><td>On / Off</td><td>This page.</td></tr></table>
<p>Each right is <b>inherited</b> unless set: from the role, then from departments (the deeper one wins), then the person's own setting. A dot shows where it comes from: grey the role, blue a department, teal the person, red a locked admin. Admins listed in the configuration are locked and keep every right.</p>''',
}



def text_for(st, member):
    """The step's text, in members' own wording where it has one."""
    return st['member'] if member and st.get('member') else st['text']


def module_guide(key):
    S = SETS[key]
    steps = D['TAB_STEPS']
    secs = []
    for mod, title, sub, purpose in MODULES:
        if mod not in S['pages']:
            continue
        rows = ''.join(
            f'<tr><td class="name">{e(st["title"])}</td><td>{e(text_for(st, S["member"]))}</td></tr>'
            for st in steps.get(mod, [])
        )
        scope = ('<div class="callout">Every number on this page counts <b>only your own tasks</b>: assigned to you or created by you.</div>'
                 if S['member'] and mod in ('dev', 'qa', 'insights') else '')
        body = (f'<p>{e(purpose)}</p>{scope}' + fig(key, 'page-' + mod, f'{title}, as you see it (names replaced).')
                + f'<h3>Every data point</h3><table><tr><th>Data point</th><th>What it shows and how to use it</th></tr>{rows}</table>'
                + EXTRA.get(mod, ''))
        secs.append((title, sub, body))
    common = ''.join(
        f'<tr><td class="name">{e(st["title"])}</td><td>{e(text_for(st, S["member"]))}</td></tr>' for st in D['COMMON_STEPS']
    )
    defs = D['INFO']
    glossary = [('Pending', defs['pending']), ('On hold', defs['hold']), ('Completed (done)', defs['colDone']),
                ('Overdue', defs['overdue']), ('Done today', defs['doneToday']), ('Due today', defs['dueToday']),
                ('Rework', defs['qaRework']), ('Retesting awaited', defs['retestAwaited'])]
    if 'kpi' in S['pages']:
        glossary += [('Closed (KPI)', D['KPI_INFO']['closed']), ('On-time (KPI)', D['KPI_INFO']['onTime']),
                     ('Working time', D['KPI_INFO']['workingTime'])]
    gl = ''.join(f'<tr><td class="name">{e(a)}</td><td>{e(b)}</td></tr>' for a, b in glossary)
    secs.insert(0, ('On every page', 'The parts every page shares', f'<table><tr><th>Part</th><th>What it does</th></tr>{common}</table>'))
    secs.append(('Definitions', 'The rules behind the numbers', f'<table><tr><th>Term</th><th>Rule</th></tr>{gl}</table>'))
    body = cover('Module guide', 'Every page you can open, module by module: what every tile, card and list shows and how to use it.', S['label'])
    body += toc([(t, s) for t, s, _ in secs])
    body += ''.join(chapter(i + 1, t, s, b) for i, (t, s, b) in enumerate(secs))
    return doc(f'Nural Pulse: Module guide ({S["label"]})', body)


def page_guide(key, mod):
    """One page's guide (Help > Documents, module by module): what it is and every data point."""
    S = SETS[key]
    m = next(x for x in MODULES if x[0] == mod)
    _, title, sub, purpose = m
    rows = ''.join(
        f'<tr><td class="name">{e(st["title"])}</td><td>{e(text_for(st, S["member"]))}</td></tr>'
        for st in D['TAB_STEPS'].get(mod, [])
    )
    img = os.path.join(HERE, '..', 'img', key, f'page-{mod}.jpg')
    body = cover(f'{title} guide', f'{sub}. What the page shows and how to use it.', S['label'])
    body += chapter(1, title, sub,
                    f'<p>{e(purpose)}</p>'
                    + (fig(key, 'page-' + mod, f'{title}, as you see it (names replaced).') if os.path.exists(img) else '')
                    + (f'<h3>Every data point</h3><table><tr><th>Data point</th><th>What it shows and how to use it</th></tr>{rows}</table>' if rows else '')
                    + EXTRA.get(mod, ''))
    return doc(f'Nural Pulse: {title} guide ({S["label"]})', body.replace(IMG, '../' + IMG))


if __name__ == '__main__':
    for key in SETS:
        os.makedirs(os.path.join(HERE, key, 'modules'), exist_ok=True)
        for name, build in (('user-guide', user_guide), ('module-guide', module_guide)):
            with open(os.path.join(HERE, key, f'{name}.html'), 'w', encoding='utf8') as f:
                f.write(build(key))
        # One guide per page this set can open: "<page label> guide" (Help > Documents).
        for mod in SETS[key]['pages']:
            if not any(x[0] == mod for x in MODULES):
                continue
            label = next(x[1] for x in MODULES if x[0] == mod)
            with open(os.path.join(HERE, key, 'modules', f'{label} guide.html'), 'w', encoding='utf8') as f:
                f.write(page_guide(key, mod))
        print('wrote', key)
