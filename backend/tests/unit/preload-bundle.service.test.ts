import { computeVersion, ttlForNetworkProfile } from "../../src/modules/low-connectivity/preload-bundle.service";

describe("preload helpers",()=>{test("hash is deterministic",()=>expect(computeVersion({a:1})).toBe(computeVersion({a:1})));test("TTL follows network profile",()=>{expect(ttlForNetworkProfile("OFFLINE")).toBe(1440);expect(ttlForNetworkProfile("POOR_2G")).toBe(1440);expect(ttlForNetworkProfile("SLOW_3G")).toBe(360);expect(ttlForNetworkProfile("MODERATE")).toBe(60);expect(ttlForNetworkProfile("GOOD")).toBe(15);});});
