import {expect,it} from "vitest";
import {coffeehouseLayout} from "./coffeehouseLayout";
it("fits every character within narrow and wide viewports without dropping agents",()=>{
  for(const width of [420,800,1280]) for(const count of [6,7,12,24,60]) {
    const places=coffeehouseLayout(count,width);
    expect(new Set(places.map(place=>place.id)).size).toBe(count);
    for(const place of places) {
      expect(place.x-56*place.scale).toBeGreaterThanOrEqual(-1);
      expect(place.x+63*place.scale).toBeLessThanOrEqual(760);
      expect(place.y-245*place.scale).toBeGreaterThanOrEqual(0);
      expect(place.y+3*place.scale).toBeLessThanOrEqual(320);
    }
  }
});
it("adds guests on alternating sides in one deepening crescent that only zooms out",()=>{
  expect(coffeehouseLayout(8).map(p=>p.id)).toEqual([6,0,1,2,3,4,5,7]);
  for(const count of [7,8,11,12,18,60]) {
    const crowd=coffeehouseLayout(count);
    const middle=(crowd.length-1)/2;
    for(let i=1;i<crowd.length;i++) {
      // Left to right in order, never close enough to hide a neighbour's face.
      expect(crowd[i].x-crowd[i-1].x).toBeGreaterThan(80*Math.max(crowd[i].scale,crowd[i-1].scale));
      // One row: every step away from the middle comes forward (lower on screen).
      const [inner,outer]=Math.abs(i-middle)<Math.abs(i-1-middle) ? [crowd[i],crowd[i-1]] : [crowd[i-1],crowd[i]];
      expect(outer.y).toBeGreaterThanOrEqual(inner.y);
    }
    expect(Math.max(...crowd.map(p=>p.scale))).toBeLessThan(Math.max(...coffeehouseLayout(count-1).map(p=>p.scale)));
    expect(coffeehouseLayout(count,420)).toEqual(crowd);
  }
});
