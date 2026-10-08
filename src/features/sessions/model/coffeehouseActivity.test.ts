import { expect, it } from "vitest";
import type { Session } from "./session";
import { coffeehouseWorkingCount } from "./coffeehouseActivity";
const session = (props: Partial<Session> = {}) => ({ id: "s", blocks: [], ...props } as Session);
it("matches working sessions and includes every background agent", () => {
  expect(coffeehouseWorkingCount([session()])).toBe(0);
  expect(coffeehouseWorkingCount([session({busy:true})])).toBe(1);
  expect(coffeehouseWorkingCount(Array.from({length:5},()=>session({busy:true})))).toBe(5);
  expect(coffeehouseWorkingCount([session({busy:true,backgroundAgents:4,backgroundTasks:["a","b","c","d"]})])).toBe(4);
  expect(coffeehouseWorkingCount([session({busy:true,backgroundAgents:10})])).toBe(10);
  expect(coffeehouseWorkingCount([session({continuingElsewhere:true})])).toBe(1);
});
it("includes every distinct team across sessions without a seven-agent limit", () => {
  const sessions = [session({id:"team",busy:true,backgroundAgents:7}), session({id:"other",busy:true,backgroundAgents:4})];
  expect(coffeehouseWorkingCount(sessions)).toBe(11);
  expect(coffeehouseWorkingCount([sessions[0]])).toBe(7);
});
it("does not count internal worker sessions twice", () => {
  const sessions = [session({id:"lead",busy:true,backgroundAgents:7}),
    ...Array.from({length:7},(_,i)=>session({id:`worker-${i}`,busy:true,orchestrationLeadId:"lead"}))];
  expect(coffeehouseWorkingCount(sessions)).toBe(7);
});
it("keeps workers visible after their lead becomes idle", () => {
  expect(coffeehouseWorkingCount([session({id:"lead"}), session({id:"worker",busy:true,orchestrationLeadId:"lead"})])).toBe(1);
});
it("does not stand for idle background commands or completed agents", () => {
  expect(coffeehouseWorkingCount([session({busy:true,backgroundTasks:["server"],backgroundAgents:0})])).toBe(0);
  expect(coffeehouseWorkingCount([session({busy:false,backgroundAgents:4})])).toBe(0);
});
