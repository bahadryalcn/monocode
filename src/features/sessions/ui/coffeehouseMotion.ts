export type CoffeehouseActivity = {
  stand: number; talk: number; gesture?: number; kick?: number; jump?: number; impact?: number; arrival?: number;
  turn?: number; nod?: number; listening?: boolean; armRest?: number;
  smoking?: boolean; smokeLift?: number; exhale?: number; smokeTime?: number;
  laugh?: number; thought?: number; emphasis?: number; chuckle?: number;
  blink?: number; breath?: number; sway?: number;
};

const ease = (n: number) => n * n * (3 - 2 * n);
function track(time: number, keys: readonly (readonly [number, number])[]): number {
  for (let i = 1; i < keys.length; i++) {
    if (time <= keys[i][0]) {
      const [start, from] = keys[i - 1];
      const [end, to] = keys[i];
      return from + (to - from) * ease(Math.max(0, (time - start) / (end - start)));
    }
  }
  return keys[keys.length - 1][1];
}

/** Mostly quiet conversation, with staggered short reactions and soft transitions. */
export function applyConversationMood(state: CoffeehouseActivity, id: number, elapsed: number, animate: boolean): void {
  if(!animate || state.stand<.95) return;
  const phase=(elapsed+id*3700)%28000;
  state.laugh=track(phase,[[0,0],[11500,0],[12200,1],[14000,1],[15000,0],[28000,0]]);
  state.thought=track(phase,[[0,0],[17000,0],[18100,1],[21400,1],[22500,0],[28000,0]]);
  state.emphasis=0;
  state.chuckle=state.laugh*Math.sin(phase/170)*1.7;
  state.talk*=1-state.thought;
  state.gesture=(state.gesture??0)*(.4+.6*state.emphasis)*(1-state.thought);
  state.kick=0; state.jump=0; state.impact=0;
  applyAngryReaction(state,phase-23500);
}

/** One shared reaction clock keeps anger and the stomp from cancelling each other. */
export function applyAngryReaction(state: CoffeehouseActivity, time:number, stomp=true): void {
  if(time<0 || time>3500) return;
  state.emphasis=track(time,[[0,0],[450,1],[2400,1],[3500,0]]);
  const strength=state.emphasis;
  state.talk=Math.max(state.talk,strength*(.45+.55*Math.abs(Math.sin(time/150))));
  state.gesture=Math.max(state.gesture??0,strength*.85);
  state.armRest=(state.armRest??.65)*(1-strength);
  if(strength>.2) state.listening=false;
  if(stomp) {
    state.kick=track(time,[[0,0],[900,0],[1150,.15],[1450,1],[1640,1],[1800,0],[3500,0]]);
    state.impact=track(time,[[0,0],[1790,0],[1830,1],[2110,0],[3500,0]]);
  }
}

/** Two original regulars take separate breaks. No particles or timers are retained. */
export function applySmokingBreak(state: CoffeehouseActivity, id: number, elapsed: number, animate: boolean): void {
  if (!animate || (id !== 1 && id !== 4) || (state.stand > 0 && state.stand < .95)) return;
  const phase = (elapsed + (id === 1 ? 27000 : 13000)) % 32000;
  if (phase >= 6800) return;
  state.smoking = true;
  state.smokeLift = track(phase, [[0,0],[750,1],[1700,1],[2500,0],[6800,0]]);
  state.exhale = track(phase, [[0,0],[2000,0],[2600,1],[4200,1],[4900,0],[6800,0]]);
  state.smokeTime = Math.max(0, phase - 2300);
  state.talk = 0; state.kick = 0; state.jump = 0; state.impact = 0;
  state.turn = 0; state.nod = 0; state.listening = true;
  state.laugh=0; state.thought=0; state.emphasis=0; state.chuckle=0;
}

/** Phrases have pauses; an occasional accent has anticipation, action and recovery. */
export function coffeehouseMotionAt(id: number, elapsed: number, stand: number, animate: boolean): CoffeehouseActivity {
  if (!animate || stand < .95) return { stand, talk: 0, gesture: 0, kick: 0, jump: 0, impact: 0 };
  const phrase = (elapsed + id * 710) % (3400 + id * 170);
  const syllable = [0.25, 1, .45, .8, .15, .65][Math.floor(phrase / 130) % 6];
  const talking = phrase < 2200;
  const accent = (elapsed + id * 2300) % 15000;
  const kick = id % 3 !== 1 ? track(accent, [[0,0],[7600,0],[7850,.15],[8150,1],[8340,1],[8500,0],[15000,0]]) : 0;
  const jump = id % 3 === 1 ? track(accent, [[0,0],[7700,0],[7930,-.2],[8170,1],[8450,0],[8590,-.12],[8820,0],[15000,0]]) : 0;
  const impact = track(accent, [[0,0],[8490,0],[8530,1],[8810,0],[15000,0]]);
  const rhythms = [
    [[0,.2],[330,.75],[740,1],[1050,.65],[1420,.85],[1880,.45],[2350,0],[4400,0]],
    [[0,0],[600,.2],[850,1],[1500,1],[1900,.2],[2350,0],[4400,0]],
    [[0,.3],[450,.65],[950,.35],[1600,.65],[2200,.3],[4400,.3]],
    [[0,0],[300,.9],[600,.15],[1000,.8],[1300,.2],[2100,0],[4400,0]],
    [[0,.1],[900,.15],[1500,.75],[1900,.8],[2300,.1],[4400,.1]],
    [[0,.4],[700,.7],[1800,.7],[2350,.4],[4400,.4]],
  ] as const;
  const gesture = track(phrase, rhythms[id%6]);
  return { stand, talk: talking ? syllable : 0, gesture, kick, jump, impact };
}

/** Decorative turn-taking only: no provider communication is inferred from these pairs. */
export function converseWithNeighbours(activity: CoffeehouseActivity[], places: readonly {id:number;x:number;y:number}[], elapsed:number): void {
  const present=places.filter(p=>activity[p.id]?.stand>=.95 && (activity[p.id].arrival??1)>.95)
    .sort((a,b)=>Math.round(a.y/60)-Math.round(b.y/60)||a.x-b.x);
  for(let i=0;i+1<present.length;i+=2) {
    const left=present[i],right=present[i+1];
    const phase=(elapsed+i*370)%6800;
    const facing=track(phase,[[0,0],[600,1],[5600,1],[6400,0],[6800,0]]);
    const firstSpeaks=phase<2700;
    const secondSpeaks=phase>=3200 && phase<5700;
    for(const [person,other,speaks] of [[left,right,firstSpeaks],[right,left,secondSpeaks]] as const) {
      const state=activity[person.id];
      state.turn=Math.sign(other.x-person.x)*facing*.8;
      state.listening=!speaks;
      state.armRest=person.id===left.id
        ? track(phase,[[0,1],[450,0],[2300,0],[2900,1],[6800,1]])
        : track(phase,[[0,1],[2800,1],[3300,0],[5300,0],[5900,1],[6800,1]]);
      state.nod=!speaks ? Math.sin(phase/230)*facing*1.6 : 0;
      if(!speaks) {state.talk=0;state.gesture=(state.gesture??0)*.25;state.kick=0;state.jump=0;state.impact=0;}
    }
  }
}

/** Small signs of life for everyone, seated or standing: staggered blinks, breathing, sway.
 * Values are quantized so a still crowd repaints at the shared 8 Hz clock at most. */
export function applyIdleLife(state: CoffeehouseActivity, id: number, elapsed: number, animate: boolean): void {
  if(!animate) return;
  const period=3900+(id*1370)%2600;
  const local=(elapsed+id*977)%period;
  // A double blink every third cycle; never blink while laughing (eyes are already shut).
  const doubled=Math.floor((elapsed+id*977)/period)%3===1;
  const closed=local<130 || (doubled && local>260 && local<380);
  state.blink=closed && (state.laugh??0)<.3 ? 1 : 0;
  state.breath=Math.round((Math.sin(elapsed/(1650+id*110)+id)*.5+.5)*4)/4;
  state.sway=state.stand<.95 ? Math.round(Math.sin(elapsed/(2900+id*230)+id*2)*2)/2 : 0;
}
