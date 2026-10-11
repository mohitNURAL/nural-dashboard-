"""Builds the two user guides (HTML, printed to PDF by print.mjs).

  python docs/guides/src/build_guides.py      -> docs/guides/src/user-guide.html, module-guide.html
  node docs/guides/src/print.mjs              -> docs/guides/*.pdf (needs Chrome on port 9333)

Data-point texts come from the dashboard itself (steps.json: the guided tour's steps and the "i"
definitions, exported from apps/web/src/features/tour/steps.ts), so the guides say exactly what
the app says. Screenshots (docs/guides/img) are taken from the live data with every person's and
project's name replaced by a stand-in, so the guides are safe to share.
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

IMG = '../img/'


def fig(name, caption, cls=''):
    return f'<figure class="{cls}"><img src="{IMG}{name}.jpg" alt=""><figcaption>{e(caption)}</figcaption></figure>'


def callout(kind, title, text):
    return f'<div class="callout {kind}"><b>{e(title)}</b> {text}</div>'


def chapter(n, title, sub, body):
    return f'''<section class="chapter" id="c{n}"><div class="chead"><div class="num">{n:02d}</div>
<div><h2>{e(title)}</h2><p>{e(sub)}</p></div></div>{body}</section>'''


def cover(title, lead):
    return f'''<div class="cover"><div class="orb"></div><div class="orb two"></div>
<div class="brand">Nural<span>Dev and QA Dashboard</span></div>
<h1>{e(title)}</h1><p class="lead">{e(lead)}</p>
<div class="meta"><span>NURALTECH · internal</span><span>{TODAY}</span></div></div>'''


def toc(items):
    lis = ''.join(f'<li>{e(t)}<small>{e(s)}</small></li>' for t, s in items)
    return f'<div class="toc"><h2>Contents</h2><ol>{lis}</ol></div>'


def doc(title, body):
    return f'<!doctype html><html lang="en"><head><meta charset="utf-8"><title>{e(title)}</title><style>{CSS}</style></head><body>{body}</body></html>'


# ---------------------------------------------------------------- User guide (entire project)

def user_guide():
    ch = []
    ch.append(('Welcome', 'What the dashboard is for', f'''
<p>The Nural Dev and QA Dashboard shows the work of the whole company in one place, live from Bitrix24: tasks, deadlines, bugs and feedback, testing, and how projects and people are doing. Nothing has to be copied in by hand. A change made in Bitrix24 reaches the dashboard within seconds, and a change made on the dashboard is made in Bitrix24, in your name.</p>
<div class="grid2">
<div class="card"><h4>For management</h4><p>KPI: open and overdue work, what was closed, on-time delivery, project health, workload and the people table, with insights worked out for you.</p></div>
<div class="card"><h4>For development</h4><p>What is due today, what is overdue, what has gone to QA, per person and per project, and every task one click away.</p></div>
<div class="card"><h4>For QA</h4><p>Bugs and feedback filed and resolved, rework, the retest queue and the testing team's workload.</p></div>
<div class="card"><h4>For support and admins</h4><p>The Support tab (coming soon, built from your feedback), the company tree, the people directory and access permissions.</p></div>
</div>
{fig('page-kpi', 'The KPI page: the menu on the left, page tools on the right.')}
'''))
    ch.append(('Signing in', 'Your Bitrix24 account is your key', f'''
<p>Open the dashboard and choose <b>Sign in with Bitrix24</b>. Use your Nural Bitrix24 account; the dashboard never sees your password. Only active people of the Nural portal can sign in.</p>
<ul><li>You stay signed in for <b>3 days</b>. Then the dashboard shows <i>Your session ended</i>; sign in again from there.</li>
<li><b>Sign out</b> is in your profile menu (your initials, top right).</li>
<li>If a change to a task says Bitrix24 refused it, sign out and in again so the dashboard picks up your Bitrix24 permissions.</li></ul>
{callout('tip', 'After an update', 'A toast says a new version is ready and lists what is new. Click <b>Refresh</b> to get it.')}
'''))
    ch.append(('What you can see and do', 'Your role and rights', f'''
<p>What you see depends on your rights. Admins set them per person or per department (Access permissions); until they do, your role decides.</p>
<table><tr><th>Role</th><th>Data</th><th>Pages</th><th>Can change on tasks</th></tr>
<tr><td class="name">Admin</td><td>Everything</td><td>All, including Access permissions</td><td>Every field</td></tr>
<tr><td class="name">Project manager, team lead</td><td>Everything</td><td>KPI, Development, QA, Support, Company tree, People directory</td><td>Every field</td></tr>
<tr><td class="name">Product owner</td><td>Everything</td><td>KPI, Development, QA</td><td>Every field</td></tr>
<tr><td class="name">Member</td><td>Tasks assigned to them or created by them</td><td>Development, QA (and Support for the Tech Support team)</td><td>Stage, status and tags</td></tr></table>
{callout('', 'Members', 'Every number, list, chart and export counts only your own tasks: those assigned to you or created by you.')}
'''))
    ch.append(('Finding your way', 'Menu, top bar and page tools', f'''
<figure class="side"><img src="{IMG}drawer.jpg" alt=""><figcaption><b>The menu</b> sits on the left. Closed, it shows icons; hover it to open it, and move away to close it. Click <b>☰</b> to pin it open until you click again.<br><br>
<b>Dashboard</b>: KPI, Development, QA, Support.<br><b>Employees</b>: Company tree, People directory, Access permissions (for those with the right).<br><br>A teal dot on an icon means something new is there.</figcaption></figure>
<h3>The top bar</h3>
<ul><li><b>Where you are</b>: e.g. Dashboard › QA.</li>
<li><b>Alerts</b> (bell): overdue tasks and tasks stuck over 5 days in one stage; click for the list.</li>
<li><b>Live</b>: green when updates are flowing in from Bitrix24.</li>
<li><b>Profile</b>: your name and role, the theme (Light, Dark, System), live-update toasts and Sign out.</li></ul>
<figure class="side"><img src="{IMG}dock.jpg" alt="" style="width:16mm"><figcaption><b>Page tools</b> float on the right, as icons; hover any icon for its name.<br><br>
<b>Customise</b>: choose the tiles and cards to show.<br><b>Guided tour</b>: a walk through the page.<br><b>Voice</b>: read tours aloud.<br><b>Reset layout</b>: back to the default, with Undo.</figcaption></figure>
'''))
    ch.append(('Reading the numbers', 'Tiles, cards, filters and drill-downs', f'''
{fig('tiles', 'Tiles: one number each, split into parts (e.g. Dev and Issues). Click a tile or a part to list its tasks.')}
<ul><li><b>Filters</b> under the top bar (project, assignee, tag or bug/feedback, date range) narrow every number on the page. <b>Reset filters</b> clears them.</li>
<li>The <b>i</b> next to any number says exactly what it counts, and what your filters cover.</li>
<li><b>Click any number</b>, bar or cell to see the tasks behind it. The list below opens, narrowed to that number.</li></ul>
{fig('tasklist', 'A task list: sortable columns, edit in place, tick boxes for bulk edit, Excel export and pages of 10 to 100 rows.')}
{fig('taskview', 'Clicking a task opens its view: every detail, the description and its history, with Open in Bitrix24.')}
'''))
    ch.append(('Changing tasks', 'Edit in place and in bulk', f'''
<p>Changes are made in Bitrix24, in your name, and show on the dashboard straight away.</p>
<ul><li><b>Edit in place</b>: click a Stage, Status or Tags cell (or a fact in the task view) and pick the new value. Team leads, PM and admins also change Project, Assignee, Priority and Deadline (future dates only).</li>
<li><b>Bulk edit</b>: tick rows (or the header box for the whole list), choose what to change, then <b>Check</b>. Rows that cannot take the change turn red with the reason; <b>Apply</b> changes the rest. Up to 100 tasks at a time.</li>
<li><b>Excel</b>: every list downloads as it is filtered and sorted.</li></ul>
{callout('warn', 'Bitrix24 decides.', 'If Bitrix24 refuses a change (for example, no rights on that task), the dashboard says why and nothing changes.')}
'''))
    ch.append(('Make it yours', 'Arrange, hide, focus and export', f'''
{fig('toolbar', 'Hover any tile, card or list: ⠿ moves it, ? explains it, the eye hides it.', 'narrow')}
<ul><li><b>Drag</b> by ⠿ to put tiles, cards and lists in your order. Each stays in its own group, and cards resize to fill their row: drop a half-width card next to a full one and both become half.</li>
<li><b>Hide</b> a tile or card with the eye; bring it back with <b>Customise</b>. Task lists cannot be hidden.</li>
<li>Your layout is saved for you and follows you to any computer. <b>Reset layout</b> puts everything back.</li></ul>
{fig('customise', 'Customise: tick the tiles and cards to show on this page.', 'narrow')}
<h3>Focus view and export</h3>
<p>Click a card's title (or an empty part of it) to bring it to the centre, larger, with the page blurred behind. Then <b>Excel</b> exports that card's data, and <b>PDF</b> saves a picture of the whole card with the filters and time on it. Press Escape or click outside to put it back.</p>
{fig('focus', 'Focus view: one card in the centre, with Excel, PDF and close.')}
'''))
    ch.append(('Guided tour and what\'s new', 'Let the dashboard show you around', f'''
{fig('tour', 'A tour bubble next to the part it explains, with a step count, Back / Next and Voice.')}
<ul><li>On your <b>first three sign-ins</b> each page explains itself when you open it: your role first, then every tile, card and list you can see. The last step offers the next page.</li>
<li>Any time: the <b>Guided tour</b> icon on the right, or <b>?</b> on a single data point.</li>
<li><b>Voice</b>: turn it on to hear each step read aloud (browser voice; Edge sounds most natural).</li>
<li><b>What's new</b>: after an update, the refresh toast lists the changes, the page with something new gets a dot, and opening it walks you through.</li></ul>
'''))
    ch.append(('The pages at a glance', 'See the Module guide for every data point', f'''
<div class="grid2">
<div class="card"><h4>KPI</h4><p>The management overview: open, on hold, overdue, closed, on-time, active projects, no deadline; insights, project health, overdue breakdown, workload, people and activity. Day, Week or Month.</p></div>
<div class="card"><h4>Development</h4><p>The Development department's tasks and issues: totals, pending, on hold, ready, deployed, overdue, done today; per person or project, ageing, ranking and stages; task lists and alerts.</p></div>
<div class="card"><h4>QA</h4><p>Bugs and feedback: filed, open, on hold, last filed and resolved, rework and retesting awaited; by person, rework, testing workload, retest queue, trend, ageing and stages.</p></div>
<div class="card"><h4>Support</h4><p>Coming soon. Tell us what the Support tab should show; your answers shape it.</p></div>
<div class="card"><h4>Company tree</h4><p>Departments as in Bitrix24, with heads and people.</p></div>
<div class="card"><h4>People directory</h4><p>Everyone's designation, department, access areas, dashboard status, last active, and open and overdue tasks.</p></div>
<div class="card"><h4>Access permissions</h4><p>Admins set each right per person or department; every change is logged.</p></div>
</div>
'''))
    ch.append(('Help', 'Common questions', f'''
<h3>A number looks different from Bitrix24</h3><p>Check the filters at the top and the switch (All, Dev, Issues); the <b>i</b> says what each number counts. Members see only their own tasks. Changes arrive within seconds; if Live is not green, refresh.</p>
<h3>I cannot change a task</h3><p>Members change stage, status and tags; other fields are for team leads, PM and admins. If Bitrix24 refuses, the message says why. Signing out and in again picks up new Bitrix24 permissions.</p>
<h3>I was signed out</h3><p>Sessions last 3 days from sign-in. Sign in again from the page that opens.</p>
<h3>A page or tab is missing</h3><p>Pages follow your rights. Ask an admin if you need more access.</p>
<h3>My layout looks odd</h3><p>Use <b>Reset layout</b> in the page tools on the right.</p>
{callout('tip', 'Still stuck?', 'Use the Support tab to tell us, or ask a dashboard admin.')}
'''))
    items = [(t, s) for t, s, _ in ch]
    body = cover('User guide', 'Everything about the Nural Dev and QA Dashboard: signing in, finding your way, reading the numbers, changing tasks and making it yours.')
    body += toc(items)
    body += ''.join(chapter(i + 1, t, s, b) for i, (t, s, b) in enumerate(ch))
    return doc('Nural Dashboard: User guide', body)


# ---------------------------------------------------------------- Module guide

MODULES = [
    ('kpi', 'KPI', 'page-kpi', 'Management overview', ['Admins', 'PM', 'Team leads', 'Product owners'],
     'The management overview of every project and department. Period: Day, Week or Month; "closed" and "on-time" compare with the period before.'),
    ('dev', 'Development', 'page-dev', 'Tasks, issues and deadlines', ['Everyone', 'Members: own tasks'],
     'The Development department\'s tasks and issues. The All / Dev / Issues switch at the top steers every number.'),
    ('qa', 'QA', 'page-qa', 'Bugs, feedback, testing and retesting', ['Everyone', 'Members: own tasks'],
     'Bugs and feedback (tasks tagged bug or feedback), testing work and the retest queue. The Bug or Feedback filter narrows the page.'),
    ('support', 'Support', 'page-support', 'Feedback for the coming Support tab', ['Tech Support team', 'PM', 'Team leads', 'Admins'],
     'Coming soon. Until then it collects what the support team and management need; admins and the Support lead read the answers.'),
    ('org', 'Company tree', 'page-org', 'Departments, heads and people', ['Admins', 'PM', 'Team leads'],
     'The company structure from Bitrix24: departments, their heads and people.'),
    ('people', 'People directory', 'page-people', 'Who has access, who is active', ['Admins', 'PM', 'Team leads'],
     'Everyone in Bitrix24 with what they can open on the dashboard and whether they use it.'),
    ('access', 'Access permissions', 'page-access', 'Rights per person or department', ['Admins'],
     'Who sees what and who may change what, set per person or department, with every change logged.'),
]

EXTRA = {
    'dev': '''<h3>Task lists</h3><p>Due today, Overdue, All tasks (follows the last number you clicked) and Alert details. Each list sorts, edits in place, bulk edits, pages and exports to Excel.</p>''',
    'qa': '''<h3>Issue lists</h3><p>Latest filed, Latest resolved and All issues (follows the last number you clicked), with the same editing and export as on Development.</p>''',
    'people': '''<h3>Dashboard status</h3><table><tr><th>Status</th><th>Meaning</th></tr>
<tr><td class="name">Active now</td><td>Used the dashboard in the last 5 minutes.</td></tr>
<tr><td class="name">Signed in</td><td>Signed in less than 3 days ago: the session is still open.</td></tr>
<tr><td class="name">Session ended</td><td>Last signed in more than 3 days ago.</td></tr>
<tr><td class="name">Signed in earlier</td><td>Signed in before sign-in times were kept.</td></tr>
<tr><td class="name">Never signed in</td><td>Active in Bitrix24, never used the dashboard.</td></tr></table>''',
    'access': '''<h3>The rights</h3><table><tr><th>Right</th><th>Values</th><th>What it controls</th></tr>
<tr><td class="name">Data</td><td>All data / Own tasks</td><td>Every project and person, or only tasks assigned to or created by them.</td></tr>
<tr><td class="name">KPI</td><td>On / Off</td><td>The KPI page.</td></tr>
<tr><td class="name">Support</td><td>On / Off</td><td>The Support page and its feedback form.</td></tr>
<tr><td class="name">Inbox</td><td>On / Off</td><td>The Support feedback inbox.</td></tr>
<tr><td class="name">Employees</td><td>On / Off</td><td>Company tree and People directory.</td></tr>
<tr><td class="name">Edit</td><td>All fields / Limited</td><td>Every task field, or only stage, status and tags.</td></tr>
<tr><td class="name">Admin</td><td>On / Off</td><td>This page.</td></tr></table>
<p>Each right is <b>inherited</b> unless set: from the role, then from departments (the deeper one wins), then the person's own setting. A dot shows where it comes from: grey the role, blue a department, teal the person, red a locked admin. Admins listed in the configuration are locked and keep every right.</p>''',
}


def module_guide():
    steps = D['TAB_STEPS']
    secs = []
    for key, title, img, sub, who, purpose in MODULES:
        rows = ''.join(
            f'<tr><td class="name">{e(s["title"])}</td><td>{e(s["text"])}'
            + (f'<br><span class="small">For members: {e(s["member"])}</span>' if s.get('member') else '')
            + '</td></tr>'
            for s in steps.get(key, [])
        )
        pills = ''.join(f'<span class="pill{" t" if i else ""}">{e(w)}</span>' for i, w in enumerate(who))
        body = f'''<div class="who">{pills}</div><p>{e(purpose)}</p>{fig(img, f'{title}, as an admin sees it (names replaced).')}
<h3>Every data point</h3><table><tr><th>Data point</th><th>What it shows and how to use it</th></tr>{rows}</table>{EXTRA.get(key, '')}'''
        secs.append((title, sub, body))
    common = ''.join(
        f'<tr><td class="name">{e(s["title"])}</td><td>{e(s["text"])}</td></tr>' for s in D['COMMON_STEPS']
    )
    defs = D['INFO']
    glossary = [('Pending', defs['pending']), ('On hold', defs['hold']), ('Completed (done)', defs['colDone']),
                ('Overdue', defs['overdue']), ('Done today', defs['doneToday']), ('Due today', defs['dueToday']),
                ('Rework', defs['qaRework']), ('Retesting awaited', defs['retestAwaited']), ('Closed (KPI)', D['KPI_INFO']['closed']),
                ('On-time (KPI)', D['KPI_INFO']['onTime']), ('Working time', D['KPI_INFO']['workingTime'])]
    gl = ''.join(f'<tr><td class="name">{e(a)}</td><td>{e(b)}</td></tr>' for a, b in glossary)
    secs.insert(0, ('On every page', 'The parts every page shares', f'<table><tr><th>Part</th><th>What it does</th></tr>{common}</table>'))
    secs.append(('Definitions', 'The rules behind the numbers', f'<table><tr><th>Term</th><th>Rule</th></tr>{gl}</table>'))
    body = cover('Module guide', 'Every page of the Nural Dev and QA Dashboard, module by module: who can open it and what every tile, card and list shows.')
    body += toc([(t, s) for t, s, _ in secs])
    body += ''.join(chapter(i + 1, t, s, b) for i, (t, s, b) in enumerate(secs))
    return doc('Nural Dashboard: Module guide', body)


if __name__ == '__main__':
    for name, build in (('user-guide', user_guide), ('module-guide', module_guide)):
        with open(os.path.join(HERE, f'{name}.html'), 'w', encoding='utf8') as f:
            f.write(build())
        print('wrote', name)
