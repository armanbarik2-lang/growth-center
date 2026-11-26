"""Import the provided CampusFest 2025 sponsorship dataset (sponsor.xlsx) into Growth Center seed rows.

Rules (documented in README):
- exact duplicate rows are removed (interactions 953 -> 950, qualification 434 -> 433, opportunity history 230 -> 228)
- current deal stage / values = latest history row on or before the dataset end (20 Apr 2025, 23:59:59 IST)
- nothing else is changed; original IDs are kept with a 'cf:' prefix
"""
import json, sys, math
import pandas as pd, warnings
warnings.filterwarnings('ignore')

SRC = sys.argv[1] if len(sys.argv) > 1 else 'sponsor.xlsx'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'data/campusfest.json'
DS = 'campusfest'
AS_OF = pd.Timestamp('2025-04-20 23:59:59')
TZ = '+05:30'

def sheet(name):
    df = pd.read_excel(SRC, sheet_name=name).dropna(how='all')
    return df.drop_duplicates().reset_index(drop=True)

def ts(v):
    if v is None or (isinstance(v, float) and math.isnan(v)) or pd.isna(v):
        return None
    return pd.Timestamp(v).strftime('%Y-%m-%dT%H:%M:%S') + TZ

def P(x):
    return None if x is None or (isinstance(x, float) and math.isnan(x)) or pd.isna(x) else f'cf:{x}'

def clean(v):
    if v is None: return None
    if isinstance(v, float) and math.isnan(v): return None
    try:
        if pd.isna(v): return None
    except Exception: pass
    if hasattr(v, 'item'): return v.item()
    return v

ev = sheet('Event'); tg = sheet('Targets'); br = sheet('Brands'); co = sheet('Sponsor contacts')
ca = sheet('Sponsor campaigns'); it = sheet('Sponsor interactions'); qh = sheet('Brand qualification')
op = sheet('Partner opportunities'); oh = sheet('Opportunity history'); ac = sheet('Sponsor activations')
counts = {'interactions': len(it), 'qualification': len(qh), 'opportunity_history': len(oh)}

STAGES = [
    {'key': 'prospecting', 'label': 'Prospecting', 'kind': 'open'},
    {'key': 'contacted', 'label': 'Contacted', 'kind': 'open'},
    {'key': 'proposal_sent', 'label': 'Proposal sent', 'kind': 'open'},
    {'key': 'negotiating', 'label': 'Negotiating', 'kind': 'open'},
    {'key': 'partner_confirmed', 'label': 'Partner confirmed', 'kind': 'won'},
    {'key': 'lost', 'label': 'Lost', 'kind': 'exit'},
    {'key': 'withdrawn', 'label': 'Withdrawn', 'kind': 'exit'},
]
IDX = {s['key']: i for i, s in enumerate(STAGES)}
FUNNEL_KEYS = [s['key'] for s in STAGES if s['kind'] != 'exit']

# owners -> members (all members); one demo head added
owners = {}
for df in (br, ca, oh):
    for _, r in df[['owner_id', 'owner_name']].dropna().drop_duplicates().iterrows():
        owners[r.owner_id] = r.owner_name
for k in it.owner_id.dropna().unique():
    owners.setdefault(k, f'Team member {k}')
members = [{'id': P(k), 'ds': DS, 'name': v, 'role': 'member', 'sector_group': None, 'title': 'Festival team member'} for k, v in sorted(owners.items())]
members.insert(0, {'id': 'cf:HEAD', 'ds': DS, 'name': 'Sponsorship Lead (demo head)', 'role': 'head', 'sector_group': None,
                   'title': 'Demo head account; not in the source data'})

e = ev.iloc[0]
dataset = {
    'id': DS, 'name': 'CampusFest 2025 (provided dataset)', 'simulated': False,
    'description': 'Original sponsorship dataset from the brief (fictional event, synthetic records). Snapshot ends 20 Apr 2025.',
    'as_of': ts(AS_OF), 'outreach_start': '2025-01-15', 'fest_start': '2025-04-12', 'fest_end': '2025-04-13',
    'stages': STAGES, 'won_stage': 'partner_confirmed',
}

campaigns = [{
    'id': P(r.sponsor_campaign_id), 'ds': DS, 'name': r.campaign_name, 'kind': 'campaign', 'channel': r.channel,
    'objective': r.objective, 'audience': r.audience, 'owner_id': P(r.owner_id), 'start_at': ts(r.planned_start_at),
    'end_at': ts(r.planned_end_at), 'budget': None, 'spent': None, 'created_at': ts(r.created_at),
    'rule': {'type': 'campusfest_default'}
} for r in ca.itertuples()]

# latest qualification on or before AS_OF
qh['effective_at'] = pd.to_datetime(qh['effective_at'])
qlast = qh[qh.effective_at <= AS_OF].sort_values(['effective_at', 'history_id']).groupby('brand_id').tail(1).set_index('brand_id')
companies = []
for r in br.itertuples():
    q = qlast.loc[r.brand_id] if r.brand_id in qlast.index else None
    companies.append({'id': P(r.brand_id), 'ds': DS, 'name': r.brand_name, 'industry': r.industry, 'sector_group': r.industry,
                      'owner_id': P(r.owner_id), 'campaign_id': None,
                      'qualification': None if q is None else q.qualification_status,
                      'qualification_reason': None if q is None else q.reason,
                      'qualification_at': None if q is None else ts(q.effective_at), 'created_at': ts(r.created_at)})
qual_hist = [{'id': P(r.history_id), 'ds': DS, 'company_id': P(r.brand_id), 'campaign_id': P(r.sponsor_campaign_id),
              'status': r.qualification_status, 'reason': r.reason, 'effective_at': ts(r.effective_at)} for r in qh.itertuples()]

contacts = [{'id': P(r.contact_id), 'ds': DS, 'company_id': P(r.brand_id), 'name': r.contact_name, 'title': r.job_title,
             'email': None, 'active': True, 'created_at': ts(r.created_at)} for r in co.itertuples()]

activities = [{'id': P(r.interaction_id), 'ds': DS, 'company_id': P(r.brand_id), 'contact_id': P(r.contact_id),
               'campaign_id': P(r.sponsor_campaign_id), 'owner_id': P(r.owner_id), 'channel': r.channel, 'type': r.event_type,
               'outcome': r.outcome, 'summary': r.summary, 'attempt_id': clean(r.attempt_id), 'qty': 1,
               'occurred_at': ts(r.occurred_at)} for r in it.itertuples()]

oh['effective_at'] = pd.to_datetime(oh['effective_at'])
ohv = oh[oh.effective_at <= AS_OF].sort_values(['effective_at', 'history_id'])
deals, history = [], []
for r in op.itertuples():
    h = ohv[ohv.opportunity_id == r.opportunity_id]
    last = h.iloc[-1] if len(h) else None
    furthest = max([IDX[s] for s in h.stage if STAGES[IDX[s]]['kind'] != 'exit'] or [0])
    deals.append({'id': P(r.opportunity_id), 'ds': DS, 'name': r.opportunity_name, 'company_id': P(r.brand_id),
                  'contact_id': P(r.primary_contact_id), 'campaign_id': P(r.sponsor_campaign_id),
                  'owner_id': None if last is None else P(last.owner_id), 'support_type': r.support_type,
                  'stage': 'prospecting' if last is None else last.stage, 'furthest_idx': furthest,
                  'proposed_value': 0 if last is None else float(last.proposed_value_inr),
                  'confirmed_value': 0 if last is None else float(last.confirmed_value_inr), 'package': None,
                  'created_at': ts(r.created_at), 'updated_at': ts(last.effective_at) if last is not None else ts(r.created_at),
                  'stage_changed_at': ts(last.effective_at) if last is not None else ts(r.created_at)})
for r in oh.itertuples():
    history.append({'id': P(r.history_id), 'ds': DS, 'deal_id': P(r.opportunity_id), 'stage': r.stage,
                    'proposed_value': float(r.proposed_value_inr), 'confirmed_value': float(r.confirmed_value_inr),
                    'owner_id': P(r.owner_id), 'changed_by': 'source data', 'effective_at': ts(r.effective_at)})

# empirical probability of confirming, by furthest open stage reached, among closed deals
closed = [d for d in deals if d['stage'] in ('partner_confirmed', 'lost', 'withdrawn')]
prob = {}
for k in ['prospecting', 'contacted', 'proposal_sent', 'negotiating']:
    i = IDX[k]
    pool = [d for d in closed if d['furthest_idx'] >= i]
    won = [d for d in pool if d['stage'] == 'partner_confirmed']
    prob[k] = round(len(won) / len(pool), 3) if pool else None
dataset['stage_prob'] = prob
dataset['prob_source'] = 'Measured from this dataset: share of closed opportunities that reached each stage and ended confirmed.'

targets = [{'id': f'cf:T{i+1}', 'ds': DS, 'version': r.target_version, 'effective_at': ts(r.effective_at),
            'qualified_goal': int(r.qualified_brands_goal), 'deals_goal': int(r.confirmed_partnerships_goal),
            'signed_value_goal': None, 'before_fest_goal': None, 'note': 'From the provided Targets sheet'}
           for i, r in enumerate(tg.itertuples())]

activations = [{'id': P(r.activation_id), 'ds': DS, 'deal_id': P(r.opportunity_id), 'company_id': P(r.brand_id),
                'attendee_campaign': r.attendee_campaign_name, 'note': r.activation_note, 'linked_at': ts(r.linked_at)}
               for r in ac.itertuples()]

import os
SEQ = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'ges_sequence.json')))
sequences = [{'id': 'cf:SEQ1', 'ds': DS, 'name': SEQ['name'], 'description': SEQ['description'], 'steps': SEQ['steps'],
              'auto_start': False, 'stop_on_reply': True, 'switch_after_days': SEQ['switch_after_days'], 'created_by': 'cf:HEAD',
              'created_at': ts(pd.Timestamp('2025-01-15 09:00'))}]
out = {'datasets': [dataset], 'members': members, 'campaigns': campaigns, 'companies': companies,
       'qualification_history': qual_hist, 'contacts': contacts, 'activities': activities, 'deals': deals,
       'deal_history': history, 'payments': [], 'deliverables': [], 'tasks': [], 'targets': targets,
       'activations': activations, 'sequences': sequences}
def default(o):
    if hasattr(o, 'item'): return o.item()
    raise TypeError(type(o))
json.dump(out, open(OUT, 'w'), default=default)
won = [d for d in deals if d['stage'] == 'partner_confirmed']
print('rows after dedupe', counts, {k: len(v) for k, v in out.items()})
print('confirmed', len(won), sum(d['confirmed_value'] for d in won),
      'cash', sum(d['confirmed_value'] for d in won if d['support_type'] == 'cash'), 'prob', prob)
