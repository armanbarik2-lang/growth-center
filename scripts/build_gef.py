"""Simulated GEF Mumbai sponsorship data (clearly labelled as simulated).

Built from the deck plan: 12-week outreach starting Mon 26 Oct 2026, fest 30-31 Jan 2027 (last weekend of January),
10 members with equal-load sector groups, 3 heads, base engine (1,000 prospects) + 5 bets + mass email.
The snapshot is generated for week 5 (26 Nov 2026, 9 pm). All companies and people are fictional.
Funnel rates follow the GES playbook: 100 called -> 10 good leads -> 5 meetings -> 1 signed.
"""
import json, random, datetime as dt, sys
random.seed(42)
OUT = sys.argv[1] if len(sys.argv) > 1 else 'data/gef.json'
DS = 'gef'
START = dt.datetime(2026, 10, 26, 9, 0)
NOW = dt.datetime(2026, 11, 26, 21, 0)      # snapshot moment (week 5)
FEST = dt.date(2027, 1, 30)
TZ = '+05:30'
def ts(d): return d.strftime('%Y-%m-%dT%H:%M:%S') + TZ
def day(d): return d.strftime('%Y-%m-%d')
def wk(n, dayoff=0, hour=11):  # datetime in week n (1-based)
    return START + dt.timedelta(days=7 * (n - 1) + dayoff, hours=hour - 9)
def rnd_time(a, b):
    a = max(a, START); b = min(b, NOW)
    if b <= a: return a
    t = a + dt.timedelta(seconds=random.randint(0, int((b - a).total_seconds())))
    return t.replace(hour=random.randint(10, 18), minute=random.choice([0, 15, 30, 45]))

STAGES = [
    {'key': 'prospect', 'label': 'To call', 'kind': 'open', 'funnel_label': 'Prospects'},
    {'key': 'call_attempted', 'label': 'Not connected: find new contact', 'kind': 'open', 'funnel_label': 'Call attempted'},
    {'key': 'called', 'label': 'Connected', 'kind': 'open', 'funnel_label': 'Connected'},
    {'key': 'proposal_mailed', 'label': 'Proposal mailed', 'kind': 'open'},
    {'key': 'follow_up', 'label': 'Follow-up', 'kind': 'open'},
    {'key': 'good_lead', 'label': 'Good lead', 'kind': 'open'},
    {'key': 'meeting', 'label': 'Meeting', 'kind': 'open'},
    {'key': 'negotiation', 'label': 'Negotiation', 'kind': 'open'},
    {'key': 'signed', 'label': 'Signed', 'kind': 'won'},
    {'key': 'advance_paid', 'label': 'Advance paid', 'kind': 'post'},
    {'key': 'branding_report_sent', 'label': 'Branding report sent', 'kind': 'post'},
    {'key': 'balance_paid', 'label': 'Balance paid', 'kind': 'post'},
    {'key': 'lost', 'label': 'Lost', 'kind': 'exit'},
    {'key': 'contact_switched', 'label': 'Contact switched', 'kind': 'exit'},
]
IDX = {s['key']: i for i, s in enumerate(STAGES)}

dataset = {
    'id': DS, 'name': 'GEF Mumbai 2027 (simulated plan)', 'simulated': True,
    'description': 'Simulated data for the Global Entrepreneurship Fest, Mumbai, built from our deck plan and the GES playbook. Fictional companies and people.',
    'as_of': None, 'outreach_start': day(START), 'fest_start': day(FEST), 'fest_end': '2027-01-31',
    'stages': STAGES, 'won_stage': 'signed',
    'stage_prob': {'prospect': 0.01, 'call_attempted': 0.003, 'called': 0.005, 'proposal_mailed': 0.005, 'follow_up': 0.003, 'good_lead': 0.10,
                   'meeting': 0.20, 'negotiation': 0.50},
    'prob_source': 'GES playbook funnel (100 called -> 10 good leads -> 5 meetings -> 1 signed): prospect 1%, good lead 10%, meeting 20%. Assumptions [A]: not connected yet 0.3%, connected or proposal mailed without a reply yet 0.5%, follow-up with no reply 0.3%, negotiation 50%.',
}

heads = [('gef:H1', 'Ishita Rao', 'Head 1: Active sponsors + Conglomerates'),
         ('gef:H2', 'Karan Mehta', 'Head 2: Government + CSR'),
         ('gef:H3', 'Neha Kulkarni', 'Head 3: Event titles + IT + AI')]
groups = ['Automobiles, EVs & Tyres', 'IT, SaaS & Consulting (A)', 'IT, SaaS & Consulting (B)', 'Fintech, Trading & Crypto',
          'Oil & Gas, Metals & Mining, PSUs', 'Banking, Insurance, AMCs & CVCs', 'Electronics & Semiconductors',
          'AI Tech, Gaming & OTT, Antivirus', 'FMCG, EdTech & Hiring, Quick Commerce',
          'Construction & Cement, Renewable Energy, Clean Tech']
mnames = ['Aarav Shah', 'Diya Nair', 'Kabir Joshi', 'Meera Pillai', 'Rohan Das', 'Sana Qureshi', 'Tanmay Bose',
          'Vani Iyer', 'Yash Gupta', 'Zoya Khan']
members = [{'id': i, 'ds': DS, 'name': n, 'role': 'head', 'sector_group': None, 'title': t} for i, n, t in heads]
for k, (n, g) in enumerate(zip(mnames, groups)):
    members.append({'id': f'gef:M{k+1:02d}', 'ds': DS, 'name': n, 'role': 'member', 'sector_group': g,
                    'title': f'Member, sector group: {g}'})
MEM = [m for m in members if m['role'] == 'member']

def camp(cid, name, kind, owner, w1, w2, budget, spent, rank, pact, tdeals, tval, test, kpi, rule, after=False, channel='mixed', objective='', audience=''):
    return {'id': cid, 'ds': DS, 'name': name, 'kind': kind, 'channel': channel, 'objective': objective, 'audience': audience,
            'owner_id': owner, 'start_at': ts(wk(w1, 0, 9)), 'end_at': ts(wk(w2, 4, 18)), 'budget': budget, 'spent': spent,
            'rank': rank, 'pact': pact, 'target_deals': tdeals, 'target_value': tval, 'test': test, 'kpi': kpi, 'rule': rule,
            'pays_after_fest': after, 'created_at': ts(START - dt.timedelta(days=5))}

campaigns = [
    camp('gef:BASE', 'Base engine: sector outreach', 'base', 'gef:H1', 1, 12, None, None, None, None, 10, 2200000,
         '1,000 prospects called over 12 weeks', 'Called -> good lead -> meeting -> signed',
         {'type': 'base', 'prospects': 1000, 'weeks': 12, 'close_rate': 0.01}, channel='call + email',
         objective='Call every qualified company in each member\'s sector group, email the proposal, follow up', audience='1,000 qualified companies across 10 sector groups'),
    camp('gef:B1', 'IT + AI sweep', 'bet', 'gef:H3', 3, 10, 6000, 2400, 1, {'p': 3, 'a': 4, 'c': 4, 't': 3}, 3, 150000,
         '1 deal by week 8', 'Deals per 100 contacted',
         {'type': 'deal_by_week', 'week': 8, 'min_deals': 1, 'value_low': 150000, 'value_high': 400000, 'deals_low': 3, 'deals_high': 4,
          'change_action': 'Add 200 more companies'}, channel='call + email',
         objective='Sweep IT firms that fests rarely approach, plus AI firms launching to students', audience='1,000+ IT firms and AI product companies'),
    camp('gef:B2', 'Active sponsors', 'bet', 'gef:H1', 1, 10, 9000, 4200, 2, {'p': 3, 'a': 5, 'c': 3, 't': 3}, 2, 300000,
         '8+ good leads from the first 50 contacted', 'Good leads per 50 contacted',
         {'type': 'leads_per_n', 'n': 50, 'green': 8, 'change_action': 'Re-order the list by recency and switch contacts'},
         channel='call + email', objective='Companies that sponsored fests or events this year or last', audience='This-year and last-year fest sponsors'),
    camp('gef:B3', 'Conglomerates (business units)', 'bet', 'gef:H1', 1, 10, 18000, 7600, 3, {'p': 3, 'a': 4, 'c': 2, 't': 4}, 1, 200000,
         '3+ meetings from the first 30 business units', 'Meetings per 30 business units',
         {'type': 'meetings_per_n', 'n': 30, 'green': 3, 'amber_min': 1, 'stop_after': 60,
          'change_action': 'Reach the units through speaker invites', 'stop_action': 'Keep only the best group'},
         after=True, channel='call + visit', objective='Pitch business units of 5 to 6 large groups one by one', audience='80 to 150 business units'),
    camp('gef:B4', 'Event titles', 'bet', 'gef:H3', 4, 9, 4000, 900, 4, {'p': 2, 'a': 3, 'c': 3, 't': 3}, 1, 150000,
         '1 title signed by week 9', 'Titles signed',
         {'type': 'title', 'green_week': 7, 'meeting_week': 6, 'signal_week': 9,
          'change_action': 'Offer the title inside a regular package', 'stop_action': 'Sell it as custom branding'},
         channel='call + meeting', objective='Sell the title of one event (MAS, Investor Startup Connect) to a targeted group', audience='Targeted groups per event'),
    camp('gef:B5', 'Government + CSR', 'bet', 'gef:H2', 1, 12, 18000, 8100, 4, {'p': 3, 'a': 3, 'c': 2, 't': 3}, 1, 400000,
         '2+ conversations by week 4 and 1 proposal in sanction by week 6', 'Conversations; proposals in sanction',
         {'type': 'gov', 'conv_week': 4, 'conv_min': 2, 'sanction_week': 6,
          'change_action': 'Focus on known contacts', 'stop_action': 'No new entities, keep warm ones'},
         after=True, channel='visit + printed proposal', objective='CSR arms, state tourism boards, PSUs; states split across members', audience='CSR and government entities'),
    camp('gef:EM', 'Mass email', 'bet', 'gef:H3', 1, 12, 5000, 2000, None, None, 1, 150000,
         'Reply rate ~0.5%', 'Reply rate',
         {'type': 'reply_rate', 'green': 0.005, 'red_bounce': 0.05, 'change_action': 'Change subject, timing or segment'},
         channel='email', objective='Timed email bursts growing toward the fest', audience='Wide list of companies'),
]

syl1 = ['Arun', 'Bharat', 'Coral', 'Delta', 'Everest', 'Falcon', 'Ganga', 'Horizon', 'Indus', 'Juniper', 'Kestrel', 'Lotus',
        'Meridian', 'Nimbus', 'Orion', 'Peak', 'Quartz', 'Ridge', 'Saffron', 'Tidal', 'Umber', 'Vantage', 'Willow', 'Zenith',
        'Apex', 'Banyan', 'Cobalt', 'Deccan', 'Ember', 'Fable', 'Granite', 'Harbor', 'Ivory', 'Jasper', 'Kaveri', 'Lumen']
syl2 = {'Automobiles': ['Motors', 'Mobility', 'Auto Parts', 'EV', 'Tyres'], 'IT': ['Systems', 'Softworks', 'Consulting', 'Cloud', 'Labs'],
        'Fintech': ['Pay', 'Capital', 'Trade', 'Finserv', 'Crypto'], 'Oil': ['Energy', 'Metals', 'Minerals', 'Petro', 'Resources'],
        'Banking': ['Bank', 'Insurance', 'AMC', 'Ventures', 'Finance'], 'Electronics': ['Electronics', 'Semicon', 'Devices', 'Circuits', 'Chips'],
        'AI': ['AI', 'Games', 'Media', 'Secure', 'Studios'], 'FMCG': ['Foods', 'Learning', 'Talent', 'Mart', 'Consumer'],
        'Construction': ['Infra', 'Cement', 'Solar', 'Green', 'Build']}
used = set()
def cname(group):
    key = group.split(',')[0].split(' ')[0]
    tail = syl2.get(key, ['Group'])
    for _ in range(1000):
        n = f'{random.choice(syl1)} {random.choice(tail)}'
        if random.random() < 0.3: n += random.choice([' Ltd', ' India', ' Pvt Ltd'])
        if n not in used:
            used.add(n); return n
    n = f'{random.choice(syl1)} {random.choice(tail)} {len(used)}'; used.add(n); return n

first = ['Amit', 'Priya', 'Rahul', 'Sneha', 'Vikram', 'Anjali', 'Nikhil', 'Pooja', 'Siddharth', 'Kavya', 'Arjun', 'Ritu',
         'Manish', 'Shreya', 'Gaurav', 'Neha', 'Harsh', 'Tanvi', 'Varun', 'Isha']
last = ['Sharma', 'Patel', 'Reddy', 'Menon', 'Desai', 'Chopra', 'Bhatt', 'Kapoor', 'Agarwal', 'Ghosh', 'Naidu', 'Saxena', 'Kulkarni', 'Jain']
titles = ['Brand Manager', 'Head of Marketing', 'Partnerships Head', 'Corporate Communications Lead', 'Marketing Manager (ATL/BTL)', 'CSR Head']

companies, contacts, activities, deals, history, payments, deliverables, tasks = [], [], [], [], [], [], [], []
cnt = {'c': 0, 'p': 0, 'a': 0, 'd': 0, 'h': 0, 'pay': 0, 'dl': 0, 't': 0}
def nid(k, prefix):
    cnt[k] += 1; return f'gef:{prefix}{cnt[k]:05d}'

PKG_DELIV = {
    'Associate': ['Hyperlinked logo on the website', 'Stall at the fest (10 x 10 ft)', '2 social media posts'],
    'IT': ['90-minute hands-on workshop for students', 'Resume access through the placement cell (opt-in students only)', 'Hyperlinked logo on the website'],
    'Corporate': ['Logo on the main-stage backdrop', 'Stall at the fest', '3 social media posts', 'Mention in 2 newsletters'],
    'Strategic': ['Speaker slot in a panel', 'Logo on participant kits and merch', 'Branded metal cube at the venue', 'Video ad on screens between sessions'],
    'Executive': ['Keynote speaker slot', 'Logo on the main-stage backdrop and all posters', 'Exclusive category rights', 'Interns from the participant pool'],
    'Event title': ['Event named after the sponsor ("X presents MAS")', 'Branding on the event stage', 'Judge seat for a company leader'],
    'CSR programme': ['Programme branded "supported by" the sponsor', 'Impact report for their CSR team', 'Speaker slot for their CSR head'],
}
PACKAGES = [('Associate', 100000), ('Corporate', 150000), ('Strategic', 200000), ('Strategic', 250000), ('Executive', 300000)]

def add_act(comp, contact, campaign, owner, typ, outcome, when, summary, channel):
    if when > NOW: when = NOW - dt.timedelta(hours=2)
    activities.append({'id': nid('a', 'A'), 'ds': DS, 'company_id': comp, 'contact_id': contact, 'campaign_id': campaign,
                       'owner_id': owner, 'channel': channel, 'type': typ, 'outcome': outcome, 'summary': summary,
                       'attempt_id': None, 'qty': 1, 'occurred_at': ts(when)})

def make(campaign, owner, group, stage, w_first, value=None, package=None, industry=None, name=None, silent=False, w_last=None):
    """Create company + contact + deal with consistent activity trail up to `stage`."""
    cid = nid('c', 'C'); nm = name or cname(group)
    companies.append({'id': cid, 'ds': DS, 'name': nm, 'industry': industry or group.split(',')[0], 'sector_group': group,
                      'owner_id': owner, 'campaign_id': campaign, 'qualification': 'qualified', 'qualification_reason': 'Meets selection criteria',
                      'qualification_at': ts(START - dt.timedelta(days=3)), 'created_at': ts(START - dt.timedelta(days=4))})
    pid = nid('p', 'P')
    cn = f'{random.choice(first)} {random.choice(last)}'
    dom = ''.join(ch for ch in nm.lower().replace(' pvt ltd', '').replace(' ltd', '').replace(' india', '') if ch.isalnum()) + '.example'
    contacts.append({'id': pid, 'ds': DS, 'company_id': cid, 'name': cn,
                     'title': random.choice(titles), 'email': cn.lower().replace(' ', '.') + '@' + dom, 'active': True, 'created_at': ts(START - dt.timedelta(days=4))})
    if package is None:
        package, value = random.choice(PACKAGES)
    did = nid('d', 'D')
    i = IDX[stage]
    trail = [s['key'] for s in STAGES[:min(i, IDX['signed']) + 1]] if STAGES[i]['kind'] != 'exit' else ['prospect', 'called', 'proposal_mailed', 'follow_up', stage]
    if STAGES[i]['kind'] == 'post':
        trail = [s['key'] for s in STAGES[:i + 1]]
    if stage != 'call_attempted':
        trail = [x for x in trail if x != 'call_attempted']
    t = wk(w_first, random.randint(0, 4))
    end = NOW if w_last is None else wk(w_last, 4, 18)
    t = min(t, end - dt.timedelta(hours=3))   # never start after the snapshot
    times = {}
    for k, s in enumerate(trail):
        if s == 'prospect':
            times[s] = START - dt.timedelta(days=4); continue
        if k > 1:
            gap = dt.timedelta(days=random.randint(2, 7))
            t = min(t + gap, end - dt.timedelta(hours=1)) if not silent else min(t + dt.timedelta(days=random.randint(1, 3)), end)
        times[s] = t
        if s == 'call_attempted':
            add_act(cid, pid, campaign, owner, 'call', 'no_answer', t, 'Called twice, no answer; number may be outdated', 'call')
        elif s == 'called': add_act(cid, pid, campaign, owner, 'call', 'connected', t, 'Cold call; asked for the right email id and sent intro', 'call')
        elif s == 'proposal_mailed': add_act(cid, pid, campaign, owner, 'proposal_mailed', 'sent', t, 'Proposal deck emailed', 'email')
        elif s == 'follow_up':
            add_act(cid, pid, campaign, owner, 'follow_up_email', 'sent', t, 'Follow-up email', 'email')
            if not silent: add_act(cid, pid, campaign, owner, 'follow_up_call', 'connected', t + dt.timedelta(days=1), 'Follow-up call', 'call')
        elif s == 'good_lead': add_act(cid, pid, campaign, owner, 'reply', 'positive', t, 'Interested; asked for package details', 'email')
        elif s == 'meeting': add_act(cid, pid, campaign, owner, 'meeting_held', 'attended', t, 'Meeting held with decision maker', 'meeting')
        elif s == 'negotiation': add_act(cid, pid, campaign, owner, 'negotiation', 'in_progress', t, 'Negotiating package and deliverables', 'call')
        elif s == 'signed': add_act(cid, pid, campaign, owner, 'signed', 'confirmed', t, f'{package} package confirmed', 'email')
        elif s == 'lost': add_act(cid, pid, campaign, owner, 'reply', 'not_interested', t, 'No budget this year', 'email')
        elif s == 'contact_switched': add_act(cid, pid, campaign, owner, 'contact_switched', 'switched', t, 'No reply in 3 weeks; moved to another contact', 'email')
    furthest = max(IDX[s] for s in trail if STAGES[IDX[s]]['kind'] != 'exit')
    last_t = max(times.values())
    signed = STAGES[i]['kind'] in ('won', 'post')
    deals.append({'id': did, 'ds': DS, 'name': f'{nm} x GEF Mumbai', 'company_id': cid, 'contact_id': pid, 'campaign_id': campaign,
                  'owner_id': owner, 'support_type': 'cash', 'stage': stage, 'furthest_idx': furthest,
                  'proposed_value': value, 'confirmed_value': value if signed else 0, 'package': package,
                  'created_at': ts(START - dt.timedelta(days=4)), 'updated_at': ts(last_t), 'stage_changed_at': ts(last_t)})
    for s in trail:
        cnt['h'] += 1
        history.append({'id': f'gef:H{cnt["h"]:05d}', 'ds': DS, 'deal_id': did, 'stage': s, 'proposed_value': value,
                        'confirmed_value': value if s in ('signed', 'advance_paid', 'branding_report_sent', 'balance_paid') else 0,
                        'owner_id': owner, 'changed_by': 'simulation', 'effective_at': ts(times[s])})
    if signed:
        st = times['signed']
        adv_paid = STAGES[i]['key'] in ('advance_paid', 'branding_report_sent', 'balance_paid')
        upfront = random.random() < 0.18
        if upfront:
            payments.append({'id': nid('pay', 'PAY'), 'ds': DS, 'deal_id': did, 'kind': 'full', 'amount': value,
                             'due_date': day(st + dt.timedelta(days=7)), 'paid_at': ts(min(st + dt.timedelta(days=5), NOW - dt.timedelta(days=1))) if adv_paid else None,
                             'status': 'paid' if adv_paid else 'due', 'note': 'Paid fully upfront'})
        else:
            payments.append({'id': nid('pay', 'PAY'), 'ds': DS, 'deal_id': did, 'kind': 'advance', 'amount': value / 2,
                             'due_date': day(st + dt.timedelta(days=7)), 'paid_at': ts(min(st + dt.timedelta(days=6), NOW - dt.timedelta(days=1))) if adv_paid else None,
                             'status': 'paid' if adv_paid else 'due', 'note': '50% advance'})
            payments.append({'id': nid('pay', 'PAY'), 'ds': DS, 'deal_id': did, 'kind': 'balance', 'amount': value / 2,
                             'due_date': '2027-02-15', 'paid_at': None, 'status': 'due', 'note': '50% after branding report'})
        items = PKG_DELIV.get('IT' if campaign == 'gef:B1' else package, PKG_DELIV['Corporate']) + ['Branding report sent (unlocks the 50% balance)']
        for item in items:
            deliverables.append({'id': nid('dl', 'DL'), 'ds': DS, 'deal_id': did, 'item': item, 'status': 'pending',
                                 'due_date': '2027-02-07' if item.startswith('Branding report') else '2027-01-28', 'done_at': None})
    return cid, did, nm

SIGN_PK = [('Executive', 300000), ('Corporate', 150000), ('Strategic', 250000)]
# ---------------- base engine: 1,000 prospects, 100 per member; week 5 progress ----------------
# per member: ~45 called so far; funnel follows GES rates with some noise
for m in MEM:
    g = m['sector_group']
    plan = (['signed'] * (1 if m['id'] in ('gef:M01', 'gef:M05') else 0) +
            ['advance_paid'] * (1 if m['id'] in ('gef:M06',) else 0) +
            ['negotiation'] * (1 if m['id'] in ('gef:M02', 'gef:M04', 'gef:M10') else 0) +
            ['meeting'] * random.choice([0, 1, 1]) + ['good_lead'] * random.choice([1, 1, 2]) +
            ['lost'] * random.choice([0, 1]))
    called_total = random.randint(40, 50)
    rest = called_total - len(plan)
    plan += ['follow_up'] * int(rest * 0.45) + ['proposal_mailed'] * int(rest * 0.25)
    rest_called = called_total - len(plan)
    plan += ['call_attempted'] * int(rest_called * 0.45) + ['called'] * (rest_called - int(rest_called * 0.45))
    plan += ['prospect'] * (100 - len(plan))
    for s in plan:
        if s in ('signed', 'advance_paid', 'negotiation'):
            w0 = random.randint(1, 2)
        elif s in ('meeting', 'good_lead', 'lost'):
            w0 = random.randint(1, 3)
        elif s == 'follow_up':
            w0 = random.randint(1, 4)
        else:
            w0 = random.randint(3, 5)
        silent = s == 'follow_up' and w0 <= 2 and random.random() < 0.5
        pk = SIGN_PK.pop(0) if s in ('signed', 'advance_paid') and SIGN_PK else None
        make('gef:BASE', m['id'], g, s, w0, silent=silent, w_last=(w0 + 1) if silent else None,
             value=pk[1] if pk else None, package=pk[0] if pk else None)

# ---------------- IT + AI sweep (started week 3): 250 listed, 120 contacted, 1 signed ----------------
it_members = ['gef:M02', 'gef:M03', 'gef:M08']
plan = ['signed'] + ['meeting'] * 2 + ['good_lead'] * 4 + ['follow_up'] * 49 + ['proposal_mailed'] * 40 + ['called'] * 14 + ['call_attempted'] * 10 + ['prospect'] * 130
for s in plan:
    owner = random.choice(it_members)
    grp = next(m['sector_group'] for m in MEM if m['id'] == owner)
    pk = random.choice([('Associate', 50000), ('Associate', 75000), ('Associate', 100000)])
    make('gef:B1', owner, grp, s, 3 if s in ('signed', 'meeting', 'good_lead') else random.randint(3, 5), value=pk[1], package=pk[0])

# ---------------- Active sponsors: 60 listed, 50 contacted, 9 good leads+, 1 signed ----------------
plan = ['negotiation'] * 2 + ['meeting'] * 3 + ['good_lead'] * 4 + ['follow_up'] * 20 + ['proposal_mailed'] * 12 + ['called'] * 6 + ['call_attempted'] * 3 + ['prospect'] * 10
for s in plan:
    m = random.choice(MEM)
    make('gef:B2', m['id'], m['sector_group'], s, random.randint(1, 3), value=150000, package='Corporate')

# ---------------- Conglomerates: 6 groups x 15 units listed, 30 contacted, 1 meeting -> amber ----------------
groups6 = ['Arunodaya Group', 'Bharatvarsh Industries', 'Coastline Conglomerate', 'Deccan Holdings', 'Everest Enterprises', 'Ganga Group']
units = ['Retail', 'Telecom', 'Chemicals', 'Hotels', 'Steel', 'Finance', 'Realty', 'Power', 'Auto', 'Digital', 'Pharma', 'Logistics', 'Textiles', 'Foods', 'Aviation']
plan = ['meeting'] + ['follow_up'] * 17 + ['proposal_mailed'] * 8 + ['called'] * 2 + ['call_attempted'] * 2 + ['prospect'] * 60
k = 0
for gname in groups6:
    for u in units:
        s = plan[k]; k += 1
        m = random.choice(MEM)
        make('gef:B3', m['id'], m['sector_group'], s, random.randint(1, 4), value=200000, package='Strategic',
             industry='Conglomerate business unit', name=f'{gname} - {u}')

# ---------------- Event titles (from week 4): 15 targets, 8 contacted, 1 meeting ----------------
plan = ['meeting'] + ['follow_up'] * 4 + ['called'] * 2 + ['call_attempted'] + ['prospect'] * 7
for s in plan:
    m = random.choice(MEM)
    make('gef:B4', 'gef:H3', m['sector_group'], s, 4 if s != 'prospect' else 5, value=150000, package='Event title')

# ---------------- Government + CSR: 20 entities, 1 conversation by week 4 -> amber ----------------
gov = ['Maharashtra Tourism Board', 'State Innovation Society', 'Coastal Power PSU', 'National Mineral PSU', 'Western Rail PSU',
       'Port Trust Authority', 'State Skills Mission', 'Startup Cell (State)', 'Rural Bank CSR', 'Oilfield PSU CSR',
       'Steel PSU CSR', 'Insurance PSU CSR', 'Housing Finance CSR', 'Agro Foundation', 'Heritage Tourism Board',
       'Karnataka Tourism Board', 'Gujarat Startup Mission', 'Telangana Innovation Cell', 'Defence PSU CSR', 'Shipping PSU CSR']
plan = ['good_lead'] + ['follow_up'] * 11 + ['proposal_mailed'] * 6 + ['called'] + ['call_attempted']
for nm, s in zip(gov, plan):
    owner = random.choice(['gef:H2', 'gef:M05', 'gef:M06'])
    make('gef:B5', owner, 'Government, PSUs and CSR', s, random.randint(1, 3), value=400000, package='CSR programme',
         industry='Government / PSU / CSR', name=nm)

# ---------------- Mass email: 4 bursts of 500, 7 replies, 1 good lead ----------------
for b, wkn in enumerate([1, 2, 3, 4]):
    activities.append({'id': nid('a', 'A'), 'ds': DS, 'company_id': None, 'contact_id': None, 'campaign_id': 'gef:EM',
                       'owner_id': 'gef:H3', 'channel': 'email', 'type': 'email_burst', 'outcome': 'sent',
                       'summary': f'Burst {b+1}: 500 emails sent', 'attempt_id': None, 'qty': 500, 'occurred_at': ts(wk(wkn, 1, 10))})
    activities.append({'id': nid('a', 'A'), 'ds': DS, 'company_id': None, 'contact_id': None, 'campaign_id': 'gef:EM',
                       'owner_id': 'gef:H3', 'channel': 'email', 'type': 'bounced', 'outcome': 'bounced',
                       'summary': f'Burst {b+1}: bounces', 'attempt_id': None, 'qty': random.randint(6, 12), 'occurred_at': ts(wk(wkn, 2, 10))})
plan = ['good_lead'] + ['follow_up'] * 6
for s in plan:
    m = random.choice(MEM)
    cid, did, nm = make('gef:EM', m['id'], m['sector_group'], s, random.randint(1, 4), value=100000, package='Associate')
    add_act(cid, None, 'gef:EM', m['id'], 'reply', 'positive' if s == 'good_lead' else 'neutral', wk(4, 3), 'Replied to email burst', 'email')

# ---------------- tasks ----------------
def task(title, owner, due, camp=None, deal=None, status='todo', prio='normal', details=None, created=None):
    tasks.append({'id': nid('t', 'T'), 'ds': DS, 'title': title, 'details': details, 'owner_id': owner, 'campaign_id': camp,
                  'deal_id': deal, 'company_id': None, 'due_date': day(due), 'status': status, 'priority': prio, 'source': 'manual',
                  'created_by': 'gef:H1', 'created_at': ts(created or (NOW - dt.timedelta(days=random.randint(2, 12)))), 'done_at': None})
deal_by = {}
for d in deals: deal_by.setdefault((d['campaign_id'], d['stage']), []).append(d)
for d in deals:
    if d['stage'] in ('meeting', 'negotiation', 'good_lead') and random.random() < 0.6:
        task({'meeting': 'Send revised proposal after meeting', 'negotiation': 'Close package terms and send agreement',
              'good_lead': 'Book a meeting with the decision maker'}[d['stage']] + f": {d['name'].split(' x ')[0]}",
             d['owner_id'], (NOW + dt.timedelta(days=random.randint(-4, 6))).date(), d['campaign_id'], d['id'],
             prio='high' if d['stage'] == 'negotiation' else 'normal')
for d in deals:
    if d['stage'] == 'signed':
        task(f"Collect 50% advance: {d['name'].split(' x ')[0]}", d['owner_id'], (NOW + dt.timedelta(days=random.randint(-2, 4))).date(),
             d['campaign_id'], d['id'], prio='high')
task('Map 2 more conglomerate groups', 'gef:H1', (NOW + dt.timedelta(days=3)).date(), 'gef:B3')
task('Print and courier CSR proposals to 6 PSUs', 'gef:H2', (NOW + dt.timedelta(days=2)).date(), 'gef:B5', prio='high')
task('Finalise event line-up for title sales', 'gef:H3', (NOW - dt.timedelta(days=1)).date(), 'gef:B4', status='doing')
task('Plan email burst 5 subject-line test', 'gef:H3', (NOW + dt.timedelta(days=4)).date(), 'gef:EM')
for i, m in enumerate(MEM):
    task(f'Call next 15 prospects in {m["sector_group"]}', m['id'], (NOW + dt.timedelta(days=1 + i % 3)).date(), 'gef:BASE')
    if i % 3 == 0:
        task(f'Weekly update of sheet: {m["sector_group"]}', m['id'], (NOW - dt.timedelta(days=3)).date(), 'gef:BASE', status='done')
for t in tasks:
    if t['status'] == 'done': t['done_at'] = ts(NOW - dt.timedelta(days=2))

# ---------------- notes: remarks on deals and meeting notes (MoM) ----------------
notes = []
def note(kind, deal, author, title, detail, brief, when, to_heads=('*',), to_members=True):
    notes.append({'id': f'gef:N{len(notes)+1:03d}', 'ds': DS, 'kind': kind, 'company_id': deal['company_id'], 'deal_id': deal['id'],
                  'author_id': author, 'title': title, 'detail': detail, 'brief': brief,
                  'meeting_at': ts(when) if kind == 'mom' else None, 'to_heads': list(to_heads), 'to_members': to_members, 'created_at': ts(when)})
signed_deals = [d for d in deals if d['stage'] in ('signed', 'advance_paid')]
remarks = [
    ('4 guests visiting for the fest', '4 people from their team attend on 30 and 31 Jan. Book guest-house rooms for 2 nights and arrange airport pickup on 29 Jan evening.', '4 guests on 30-31 Jan: rooms + pickup needed'),
    ('GST invoice needed before advance', 'Their finance team releases the advance only against a GST invoice addressed to the Mumbai office. Send it with the agreement.', 'Needs GST invoice before paying the advance'),
    ('Logo on participant kits', 'They want their logo on all participant kits. Share the kit design for approval by 15 Jan.', 'Kit design approval by 15 Jan'),
    ('CEO may judge MAS', 'Their CEO is open to judging MAS (Million At Stake). Confirm the slot and travel by 10 Jan.', 'CEO may judge MAS: confirm by 10 Jan'),
]
for d, (t, det, br) in zip(signed_deals, remarks):
    note('remark', d, d['owner_id'], t, det, br, NOW - dt.timedelta(days=random.randint(1, 4)), to_members=False)
meet = [d for d in deals if d['stage'] in ('meeting', 'negotiation') and d['campaign_id'] != 'gef:B3'][:5]
meet.insert(3, next(d for d in deals if d['campaign_id'] == 'gef:B3' and d['stage'] == 'meeting'))
moms = [
    ('Interested in the Strategic package; wants footfall proof and last year\'s branding report. Decision expected by 5 Dec. Next: send the GES branding report and a revised deck by Monday.', 'Interested in Strategic; decision by 5 Dec'),
    ('Marketing head liked the workshop idea. Budget is approved only for Q4; they asked to hold the price till 10 Dec. Next: send the workshop outline and hold the slab.', 'Likes the workshop idea; price hold till 10 Dec'),
    ('They sponsor another Mumbai fest in January. Pitched category exclusivity (+Rs 50K). They will reply after their internal review on 3 Dec.', 'Sponsors another fest; pitched exclusivity'),
    ('Group CMO prefers one combined deal across business units. Do not pitch the other units separately until the CMO replies.', 'Group wants one combined deal: do not pitch other units separately'),
    ('Asked for a stall plus 2 speaker passes instead of a panel slot. Negotiating Corporate at Rs 1.5L with 2 passes.', 'Negotiating Corporate with 2 speaker passes'),
    ('Needs approval from their Delhi office. Contact shared the approver\'s email; follow up with them directly.', 'Approval sits with Delhi office; follow up there'),
]
for d, (det, br) in zip(meet, moms):
    cname_ = d['name'].split(' x ')[0]
    when = NOW - dt.timedelta(days=random.randint(0, 6), hours=random.randint(1, 6))
    note('mom', d, d['owner_id'], f'Meeting with {cname_}', det, f'{cname_}: {br}', when)

# ---------------- email sequences: enroll every company whose proposal was mailed ----------------
import os
SEQ = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'ges_sequence.json')))
sequences = [{'id': 'gef:SEQ1', 'ds': DS, 'name': SEQ['name'], 'description': SEQ['description'], 'steps': SEQ['steps'],
              'auto_start': True, 'stop_on_reply': True, 'switch_after_days': SEQ['switch_after_days'], 'created_by': 'gef:H1',
              'created_at': ts(START - dt.timedelta(days=3))}]
enrollments, osteps = [], []
hist_by = {}
for h in history: hist_by.setdefault(h['deal_id'], []).append(h)
contact_by = {c['company_id']: c for c in contacts}
member_name = {m['id']: m['name'] for m in members}
comp_name = {c['id']: c['name'] for c in companies}
def render(t, d):
    ct = contact_by.get(d['company_id'])
    return (t.replace('{{first_name}}', (ct['name'] if ct else 'there').split(' ')[0]).replace('{{company}}', comp_name[d['company_id']])
             .replace('{{sender}}', member_name.get(d['owner_id'], 'GEF team')).replace('{{package}}', d['package'] or 'Corporate')
             .replace('{{fest}}', 'GEF Mumbai 2027'))
GI = IDX['good_lead']
for d in deals:
    hs = {h['stage']: h for h in hist_by.get(d['id'], [])}
    if 'proposal_mailed' not in hs or d['campaign_id'] == 'gef:EM':
        continue
    start = dt.datetime.fromisoformat(hs['proposal_mailed']['effective_at'][:19])
    eid = f'gef:E{len(enrollments)+1:04d}'
    status, stop_at, reason, outcome = 'active', None, None, None
    if d['furthest_idx'] >= GI and 'good_lead' in hs:
        status, stop_at, reason, outcome = 'replied', dt.datetime.fromisoformat(hs['good_lead']['effective_at'][:19]), 'Reply received', 'positive'
    elif d['stage'] == 'lost':
        status, stop_at, reason, outcome = 'replied', dt.datetime.fromisoformat(hs['lost']['effective_at'][:19]), 'Reply received', 'not_interested'
    elif d['stage'] == 'contact_switched':
        status, stop_at, reason = 'stopped', dt.datetime.fromisoformat(hs['contact_switched']['effective_at'][:19]), 'Contact switched'
    elif (NOW - start).days >= SEQ['switch_after_days']:
        status, stop_at, reason = 'switch_contact', start + dt.timedelta(days=SEQ['switch_after_days']), 'No reply in 3 weeks'
    enrollments.append({'id': eid, 'ds': DS, 'sequence_id': 'gef:SEQ1', 'deal_id': d['id'], 'company_id': d['company_id'],
                        'contact_id': d['contact_id'], 'owner_id': d['owner_id'], 'status': status, 'started_at': ts(start),
                        'stopped_at': ts(stop_at) if stop_at else None, 'stop_reason': reason, 'reply_outcome': outcome})
    for k, st in enumerate(SEQ['steps']):
        due = start + dt.timedelta(days=st['day'])
        if stop_at and due > stop_at:
            sstat, done = 'skipped', None
        elif due <= NOW - dt.timedelta(hours=1) and (k == 0 or random.random() < 0.97):
            sstat, done = ('sent' if st['type'] == 'email' else 'done'), due.replace(hour=random.randint(10, 17))
        elif due < NOW - dt.timedelta(days=3):
            sstat, done = 'skipped', None          # missed long ago; the owner moved on to the next step
        elif due <= NOW:
            sstat, done = 'pending', None          # recent overdue step still to do
        else:
            sstat, done = 'pending', None
        osteps.append({'id': f'gef:S{len(osteps)+1:05d}', 'ds': DS, 'enrollment_id': eid, 'step_no': k + 1, 'day': st['day'], 'type': st['type'],
                       'due_date': due.strftime('%Y-%m-%d'), 'status': sstat, 'subject': render(st['subject'], d), 'body': render(st['body'], d),
                       'outcome': ('no_answer' if st['type'] == 'call' and sstat == 'done' and (random.random() < 0.6 or status in ('switch_contact', 'stopped')) else ('connected' if st['type'] == 'call' and sstat == 'done' else None)),
                       'done_at': ts(done) if done else None})

targets = [
    {'id': 'gef:T1', 'ds': DS, 'version': 'Base plan', 'effective_at': ts(START), 'qualified_goal': 1000, 'deals_goal': 10,
     'signed_value_goal': 2600000, 'before_fest_goal': 1210000, 'note': 'Deck base case: 10 deals + CSR, Rs 26L signed, Rs 12.1L to 13.8L before fest'},
    {'id': 'gef:T2', 'ds': DS, 'version': 'Stretch (after 25% realism cut)', 'effective_at': ts(START), 'qualified_goal': 1000,
     'deals_goal': 18, 'signed_value_goal': 4030000, 'before_fest_goal': 2150000, 'note': 'Deck stretch: ~18 to 20 deals, Rs 33.7L to 40.3L signed, Rs 15.7L to 21.5L before fest'},
]
out = {'datasets': [dataset], 'members': members, 'campaigns': campaigns, 'companies': companies, 'qualification_history': [],
       'contacts': contacts, 'activities': activities, 'deals': deals, 'deal_history': history, 'payments': payments,
       'deliverables': deliverables, 'tasks': tasks, 'targets': targets, 'activations': [], 'notes': notes, 'sequences': sequences, 'enrollments': enrollments, 'outreach_steps': osteps}
json.dump(out, open(OUT, 'w'))
print({k: len(v) for k, v in out.items()})
from collections import Counter
print(Counter((d['campaign_id'], d['stage']) for d in deals if d['stage'] in ('signed', 'advance_paid', 'negotiation', 'meeting')))
