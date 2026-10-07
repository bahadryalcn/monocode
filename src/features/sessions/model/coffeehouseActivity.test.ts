import { expect, it } from "vitest";
import type { Session } from "./session";
import { coffeehouseWorkingCount } from "./coffeehouseActivity";
const session = (props: Partial<Session> = {}) => ({ id: "s", blocks: [], ...props } as Session);
it("matches working sessions and includes every background agent", () => {
  expect(coffeehouseWorkingCount([session()])).toBe(0);
  expect(coffeehouseWorkingCount([session({busy:true})])).toBe(1);
  expect(coffeehouseWorkingCount(Array.from({length:5},()=>session({busy:true})))).toBe(5);
  expect(coffeehouseWorkingCount([session({busy:true,backgroundAgents:4,backgroundTasks:["a","b","c","d"]})])).toBe(5);
  expect(coffeehouseWorkingCount([session({busy:true,backgroundAgents:10})])).toBe(11);
  expect(coffeehouseWorkingCount([session({continuingElsewhere:true})])).toBe(1);
});
it("does not stand for idle background commands or completed agents", () => {
  expect(coffeehouseWorkingCount([session({busy:true,backgroundTasks:["server"],backgroundAgents:0})])).toBe(0);
  expect(coffeehouseWorkingCount([session({busy:false,backgroundAgents:4})])).toBe(0);
});
