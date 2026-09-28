import { SyncPacketRecord, SyncSessionRecord } from "../../src/modules/low-connectivity/low-connectivity.types";
import { CreatePacketData, CreateSessionData, LowConnectivitySyncRepository } from "../../src/modules/low-connectivity/low-connectivity.repository";

function uniqueError(): never { throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" }); }

export class InMemoryLowConnectivitySyncRepository implements LowConnectivitySyncRepository {
  sessions: SyncSessionRecord[] = [];
  packets: SyncPacketRecord[] = [];
  private n = 0;
  async createSession(data: CreateSessionData) { const now=new Date(); const s: SyncSessionRecord={id:`s-${++this.n}`,publicId:`00000000-0000-4000-8000-${String(this.n).padStart(12,"0")}`,...data,status:"OPEN",lastAppliedSequence:0,startedAt:now,completedAt:null,createdAt:now,updatedAt:now}; this.sessions.push(s); return s; }
  async findOpenSessionForDevice(userId:string,deviceId:string){return this.sessions.find(s=>s.userId===userId&&s.deviceId===deviceId&&s.status==="OPEN")??null;}
  async findSessionByPublicId(publicId:string){return this.sessions.find(s=>s.publicId===publicId)??null;}
  async listSessionsForUser(userId:string){return this.sessions.filter(s=>s.userId===userId);}
  async completeSession(id:string){const s=this.sessions.find(x=>x.id===id)!; s.status="COMPLETED";s.completedAt=new Date();return s;}
  async abandonSession(id:string){const s=this.sessions.find(x=>x.id===id)!; s.status="ABANDONED";s.completedAt=new Date();return s;}
  async advanceSessionSequence(id:string,sequence:number){const s=this.sessions.find(x=>x.id===id);if(!s||s.lastAppliedSequence!==sequence-1)return null;s.lastAppliedSequence=sequence;s.updatedAt=new Date();return s;}
  async createPacket(data:CreatePacketData){if(this.packets.some(p=>p.sessionId===data.sessionId&&p.sequence===data.sequence))return uniqueError();if(this.packets.some(p=>p.userId===data.userId&&p.idempotencyKey===data.idempotencyKey))return uniqueError();const now=new Date();const p:SyncPacketRecord={id:`p-${++this.n}`,publicId:`00000000-0000-4000-8000-${String(this.n).padStart(12,"0")}`,...data,status:"PROCESSING",attempts:1,resultSummary:null,errorCode:null,errorMessage:null,appliedAt:null,createdAt:now,updatedAt:now};this.packets.push(p);return p;}
  async findPacketByIdempotencyKey(userId:string,key:string){return this.packets.find(p=>p.userId===userId&&p.idempotencyKey===key)??null;}
  async findPacketByPublicId(publicId:string){return this.packets.find(p=>p.publicId===publicId)??null;}
  async listPackets(sessionId:string){return this.packets.filter(p=>p.sessionId===sessionId).sort((a,b)=>a.sequence-b.sequence);}
  async markApplied(id:string,resultSummary:unknown){const p=this.packets.find(x=>x.id===id)!;p.status="APPLIED";p.resultSummary=resultSummary;p.appliedAt=new Date();return p;}
  async markFailed(id:string,errorCode:string,errorMessage:string){const p=this.packets.find(x=>x.id===id)!;p.status="FAILED";p.errorCode=errorCode;p.errorMessage=errorMessage;return p;}
}
