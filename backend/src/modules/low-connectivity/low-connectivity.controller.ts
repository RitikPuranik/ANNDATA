import { Request, Response } from "express";
import { sendSuccess } from "../../common/apiResponse";
import { AuthenticatedUserContext } from "../auth/auth.types";
import { isPreloadSection } from "./low-connectivity.types";
import { PreloadBundleService } from "./preload-bundle.service";
import { SyncSessionService } from "./sync-session.service";

export class LowConnectivityController {
  constructor(private readonly sync: SyncSessionService, private readonly preload: PreloadBundleService) {}
  startSession = async (req: Request, res: Response) => sendSuccess(res, await this.sync.startSession(req.user as AuthenticatedUserContext, req.body), "Sync session started", 201);
  listSessions = async (req: Request, res: Response) => sendSuccess(res, await this.sync.listSessions(req.user as AuthenticatedUserContext));
  getSession = async (req: Request, res: Response) => sendSuccess(res, await this.sync.getStatus(req.user as AuthenticatedUserContext, req.params.publicId));
  submitPacket = async (req: Request, res: Response) => sendSuccess(res, await this.sync.submitPacket(req.user as AuthenticatedUserContext, req.params.publicId, req.body), "Packet processed");
  retryPacket = async (req: Request, res: Response) => sendSuccess(res, await this.sync.retryPacket(req.user as AuthenticatedUserContext, req.params.publicId, req.params.packetId), "Packet retried");
  completeSession = async (req: Request, res: Response) => sendSuccess(res, await this.sync.completeSession(req.user as AuthenticatedUserContext, req.params.publicId), "Sync session completed");
  abandonSession = async (req: Request, res: Response) => sendSuccess(res, await this.sync.abandonSession(req.user as AuthenticatedUserContext, req.params.publicId), "Sync session abandoned");
  getPreloadBundle = async (req: Request, res: Response) => {
    const query = req.validatedQuery as { sections?: string; knownVersion?: string; networkProfile?: string };
    const sections = query.sections?.split(",").map(s => s.trim()).filter(isPreloadSection);
    const result = await this.preload.buildBundle(req.user as AuthenticatedUserContext, { sections: sections?.length ? sections : undefined, knownVersion: query.knownVersion, networkProfile: query.networkProfile });
    if (result.notModified) return res.status(204).end();
    return sendSuccess(res, result.bundle);
  };
}
