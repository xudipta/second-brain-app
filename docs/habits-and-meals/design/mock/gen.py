# Builds the approved design screens from the app's real stylesheet (assets/styles.css), so they double as a visual test of it.
#   python3 gen.py [output dir] [stylesheet href]
import os, sys
M = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
CSS = sys.argv[2] if len(sys.argv) > 2 else '../../../../assets/styles.css'
os.makedirs(M, exist_ok=True)
IC = {
 'sun': '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>',
 'moon': '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
 'dusk': '<path d="M4 18h16M7.5 18a4.5 4.5 0 0 1 9 0M12 8v2M5 11.5l1.4 1.4M19 11.5l-1.4 1.4"/>',
 'plus': '<path d="M12 5v14M5 12h14"/>', 'check': '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
}
def ic(n, cls='ic'): return f'<svg class="{cls}" viewBox="0 0 24 24" aria-hidden="true">{IC[n]}</svg>'
TABS = [('today','Today','<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>'),
        ('notes','Notes','<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7"/>'),
        ('review','Review','<path d="M5 20V11M12 20V5M19 20v-6"/>'),
        ('more','More','<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>')]
def tabs(active):
    a = ''.join(f'<a href="#" data-tab="{k}"{" aria-current=\"page\"" if k==active else ""}><svg viewBox="0 0 24 24" aria-hidden="true">{p}</svg><span>{l}</span></a>' for k,l,p in TABS)
    return f'<nav id="tabs"><div class="side-brand"></div>{a}</nav>'
WORDMARK = f'<span class="wordmark"><i>{ic("check","")}</i>Second Brain</span>'.replace('<svg class="" ','<svg ')
def page(top, body, active, modal=''):
    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="{CSS}"></head><body>
<div id="shell">{tabs(active)}<div id="col"><header id="topbar">{top}</header><main id="app"><div class="view" style="animation:none">{body}</div></main></div></div>{modal}</body></html>'''

def bar(p=0, v=0, c=0, o=0):
    segs = [(p,'g-protein'),(v,'g-veg'),(c,'g-carb'),(o,'g-other')]
    return '<div class="plate-bar">' + ''.join(f'<i class="{k}" style="flex:{w}"></i>' for w,k in segs if w) + '</div>'
def legend(p=0, v=0, c=0, o=0):
    items = [('Protein',p,'g-protein'),('Veg',v,'g-veg'),('Carbs',c,'g-carb'),('Other',o,'g-other')]
    return '<div class="legend-row">' + ''.join(f'<span class="{cls}">{n} {w}%</span>' for n,w,cls in items if w) + '</div>'
def dots(pattern):
    return '<div class="dots">' + ''.join(f'<i class="{"on" if x else ""}{" now" if i==len(pattern)-1 else ""}"></i>' for i,x in enumerate(pattern)) + '</div>'

# ---------- 1. Today ----------
today_top = WORDMARK + '<span class="spacer"></span><a class="link-btn" href="#">Close the day</a>'
today_body = f'''
<div class="today-head"><div><div class="eyebrow">Monday</div><h1 class="page-title">November 9</h1></div><div class="right progress-text"><b>1</b> of 5 tasks</div></div>
<div class="meter"><i style="width:20%"></i></div>

<div class="section"><h2>Habits</h2><span class="count-chip">1 of 2</span><a class="push link-btn" href="#">Edit</a></div>
<div class="habit"><button class="cb" role="checkbox" aria-checked="true">{ic("check","")}</button>
  <div class="name"><b>Gym</b><span class="when-chip">{ic("moon")} Evening</span></div>{dots([1,1,0,1,1,0,1])}</div>
<div class="habit"><button class="cb" role="checkbox" aria-checked="false">{ic("check","")}</button>
  <div class="name"><b>Read 20 minutes</b><small>Not yet today</small></div>{dots([0,1,0,0,1,0,0])}</div>
<div class="link-row"><button class="link-btn">+ Add habit</button></div>

<div class="section"><h2>Meals</h2><span class="count-chip">2 logged</span></div>
<div class="day-plate"><div class="cap"><span>Today's plate so far</span><span>rough portions</span></div>{bar(p=48,v=17,c=35)}{legend(p=48,v=17,c=35)}</div>
<div class="meal"><span class="lab">Breakfast</span><div class="mid">{bar(p=60,c=40)}<small>Protein shake</small></div><span></span></div>
<div class="meal"><span class="lab">Lunch</span><div class="mid">{bar(p=35,v=35,c=30)}<small>Dal, rice and salad</small></div><span></span></div>
<div class="meal"><span class="lab">Snack</span><div class="mid"></div><button class="btn secondary add">{ic("plus")} Add</button></div>
<div class="meal"><span class="lab">Dinner</span><div class="mid"></div><button class="btn secondary add">{ic("plus")} Add</button></div>

<div class="section"><h2>Carried over</h2><span class="count-chip">2</span></div>
<ul class="tasks"><li class="task"><button class="cb" role="checkbox" aria-checked="false">{ic("check","")}</button><div class="body"><div class="ttl">Renew library card</div><div class="meta"><span class="age">From Thu, Nov 5 · 4 days</span></div></div><button class="link-btn">Do today</button></li></ul>
'''
TODAY = page(today_top, today_body, 'today')

# ---------- 2. Gym: when did you go ----------
gym_modal = f'''<div class="modal"><div class="sheet"><h3>Gym<small>Monday, November 9</small></h3>
<div class="eyebrow" style="margin-top:.9rem">When did you go?</div>
<div class="big3"><button class="bigbtn">{ic("sun")}Morning<small>before 12</small></button><button class="bigbtn">{ic("dusk")}Afternoon<small>12 to 5</small></button><button class="bigbtn" aria-pressed="true">{ic("moon")}Evening<small>after 5</small></button></div>
<label class="field">Note<input type="text" placeholder="Optional. What did you do?"></label>
<div class="btn-row" style="margin-top:1rem"><button class="btn" style="flex:1">Save</button><button class="btn danger">Remove today's log</button></div></div></div>'''
GYM = page(today_top, today_body, 'today', gym_modal)

# ---------- 3. Add a meal ----------
def tile(name, hint, letter, group, level):
    word = ['None','Some','Half','Most'][level]
    pips = ''.join(f'<i class="{"f" if i<level else ""}"></i>' for i in range(3))
    return f'<button class="ptile g-{group}{" on" if level else ""}"><span class="top">{name}<em>{letter}</em></span><span class="eg">{hint}</span><span class="pips">{pips}</span><small>{word}</small></button>'
meal_modal = f'''<div class="modal"><div class="sheet"><h3>Breakfast<small>Tap a food group to change its share of the plate</small></h3>
<div class="recent"><button aria-pressed="true">Protein shake</button><button>Eggs and toast</button><button>Oats and banana</button></div>
<div class="tiles">{tile("Protein","eggs, dal, shake","P","protein",3)}{tile("Veg","vegetables, fruit","V","veg",0)}{tile("Carbs","rice, roti, bread","C","carb",1)}{tile("Other","oil, sweets, drinks","O","other",0)}</div>
<div class="live">{bar(p=75,c=25)}{legend(p=75,c=25)}</div>
<label class="field">What did you eat?<input type="text" value="Protein shake" placeholder="Optional"></label>
<div class="btn-row" style="margin-top:1rem"><button class="btn" style="flex:1">Save meal</button><button class="btn ghost">I skipped it</button></div></div></div>'''
MEAL = page(today_top, today_body, 'today', meal_modal)

# ---------- 4. Review: Habits ----------
review_top = WORDMARK
def seg(active):
    b = ''.join(f'<button aria-pressed="{"true" if n==active else "false"}">{n}</button>' for n in ['Tasks','Habits','Diet'])
    return f'<div class="seg" role="group" style="margin-top:1rem">{b}</div>'
done = {2:'moon',3:'moon',4:'sun',6:'moon',7:'sun',9:'moon'}
cells = ''.join(f'<div class="h">{d}</div>' for d in 'MTWTFSS') + '<div class="d x"></div>'*6
for day in range(1, 31):
    cls = 'd'; inner = str(day)
    if day in done: cls += ' on'; inner = ic(done[day]) + f'<span>{day}</span>'
    elif day > 9: cls += ' future'
    if day == 9: cls += ' today'
    cells += f'<div class="{cls}">{inner}</div>'
habit_body = f'''
<div class="eyebrow" style="margin-top:.5rem">Review</div><h1 class="page-title">Your days</h1>{seg("Habits")}
<div class="pick"><button aria-pressed="true">Gym</button><button>Read 20 minutes</button></div>
<div class="stats" style="margin-top:1rem">
<div class="stat"><div class="n">6 of 9</div><div class="l">Days this month</div></div>
<div class="stat"><div class="n">5 days</div><div class="l">This week (goal 4)</div></div>
<div class="stat"><div class="n">Evening</div><div class="l">Usual time, 4 of 6 days</div></div>
<div class="stat"><div class="n">3 of 3</div><div class="l">Back the day after a miss</div></div></div>
<div class="section"><h2>November</h2><span class="count-chip">{ic("sun")} morning {ic("dusk")} afternoon {ic("moon")} evening</span></div>
<div class="cal">{cells}</div>
<div class="section"><h2>Time of day</h2></div>
<div class="hbar"><span class="t">{ic("sun")} Morning</span><span class="tr"><i style="width:33%"></i></span><b>2</b></div>
<div class="hbar"><span class="t">{ic("dusk")} Afternoon</span><span class="tr"><i style="width:0%"></i></span><b>0</b></div>
<div class="hbar"><span class="t">{ic("moon")} Evening</span><span class="tr"><i style="width:67%"></i></span><b>4</b></div>
'''
HABITS = page(review_top, habit_body, 'review')

# ---------- 5. Review: Diet ----------
days = [('Tue',(40,30,30,0)),('Wed',(50,10,40,0)),('Thu',(35,25,30,10)),('Fri',None),('Sat',(30,20,50,0)),('Sun',(45,25,30,0)),('Mon',(48,17,35,0))]
cols = ''
for i,(d,vals) in enumerate(days):
    now = ' now' if d=='Mon' else ''
    if vals is None:
        cols += f'<div class="col"><div class="none"></div><div class="dl{now}">{d}</div></div>'; continue
    p,v,c,o = vals
    segs = ''.join(f'<i class="{cls}" style="height:calc({w}% - 2px)"></i>' for w,cls in [(p,'g-protein'),(v,'g-veg'),(c,'g-carb'),(o,'g-other')] if w)
    cols += f'<div class="col"><div class="stack">{segs}</div><div class="dl{now}">{d}</div></div>'
diet_body = f'''
<div class="eyebrow" style="margin-top:.5rem">Review</div><h1 class="page-title">Your days</h1>{seg("Diet")}
<div class="section"><h2>Average plate</h2><span class="count-chip">last 7 days · 6 days logged</span></div>
<div style="padding-top:.8rem">{bar(p=41,v=21,c=36,o=2)}{legend(p=41,v=21,c=36,o=2)}</div>
<div class="section"><h2>Each day</h2></div>
<div class="wk">{cols}</div>
<div class="section"><h2>Recent days</h2></div>
<div class="drow"><span class="d">Today</span>{bar(p=48,v=17,c=35)}<small>Protein shake · Dal, rice and salad</small></div>
<div class="drow"><span class="d">Sun</span>{bar(p=45,v=25,c=30)}<small>Egg bhurji · Chicken curry and roti</small></div>
<div class="drow"><span class="d">Sat</span>{bar(p=30,v=20,c=50)}<small>Poha · Biryani</small></div>
<p class="foot">Rough portions you chose for each plate, not nutrition facts.</p>
'''
DIET = page(review_top, diet_body, 'review')

# ---------- 6. Add habit ----------
add_modal = f'''<div class="modal"><div class="sheet"><h3>New habit</h3>
<label class="field" style="margin-top:.2rem">What do you want to track?<input type="text" value="Gym"></label>
<div class="chipset"><button aria-pressed="true">Gym</button><button>Walk</button><button>Read</button><button>Stretch</button><button>Water</button><button>Meditate</button></div>
<div class="rowline" style="margin-top:.9rem"><div><b>Track time of day</b><small>Morning, afternoon or evening when you log it</small></div><button class="switch" role="switch" aria-checked="true" aria-label="Track time of day"></button></div>
<div class="rowline"><div><b>Weekly goal</b><small>Optional. Shown in Review, never as a streak</small></div><div class="stepper"><b>–</b><span>4</span><b>+</b></div></div>
<div class="btn-row" style="margin-top:1rem"><button class="btn" style="flex:1">Add habit</button><button class="btn ghost">Cancel</button></div></div></div>'''
ADD = page(today_top, today_body, 'today', add_modal)

for name, html in [('1-today',TODAY),('2-gym-time',GYM),('3-add-meal',MEAL),('4-review-habits',HABITS),('5-review-diet',DIET),('6-add-habit',ADD)]:
    open(os.path.join(M, name + '.html'), 'w').write(html)
print('written')
