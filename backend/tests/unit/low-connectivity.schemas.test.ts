import { submitPacketBody, startSyncSessionBody } from "../../src/modules/low-connectivity/low-connectivity.schemas";

describe("low connectivity schemas",()=>{
 test("accepts valid packet",()=>expect(submitPacketBody.safeParse({sequence:"1",idempotencyKey:"abcdefgh",targetModule:"SYSTEM",action:"PING",payload:{x:1},clientCreatedAt:new Date().toISOString()}).success).toBe(true));
 test("rejects payload over 20KB and unknown fields",()=>{const huge={x:"a".repeat(20001)};expect(submitPacketBody.safeParse({sequence:1,idempotencyKey:"abcdefgh",targetModule:"SYSTEM",action:"PING",payload:huge,clientCreatedAt:new Date(),extra:true}).success).toBe(false);});
 test("strictly validates session body",()=>expect(startSyncSessionBody.safeParse({deviceId:"d",unknown:true}).success).toBe(false));
});
