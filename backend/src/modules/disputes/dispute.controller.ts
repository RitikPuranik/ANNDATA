import { Request, Response } from "express";
import { sendSuccess } from "../../common/apiResponse";
import { AuthenticatedUserContext } from "../auth/auth.types";
import { CreateDisputeInput, DisputeService } from "./dispute.service";
import { DisputeListFilters } from "./dispute.types";

/** Thin-controller convention, same as DeliveryController — parses already
 * validated body/query/params and hands off to DisputeService; every
 * business rule lives there, not here. */
export class DisputeController {
  constructor(private readonly disputes: DisputeService) {}

  create = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const input = req.body as CreateDisputeInput;
    const result = await this.disputes.create(user, input);
    sendSuccess(res, result, "Dispute raised successfully", 201);
  };

  list = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const query = req.validatedQuery as unknown as DisputeListFilters;
    const result = await this.disputes.list(user, query);
    sendSuccess(res, result);
  };

  get = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const result = await this.disputes.get(user, req.params.publicId);
    sendSuccess(res, result);
  };

  addComment = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const result = await this.disputes.addComment(user, req.params.publicId, req.body);
    sendSuccess(res, result, "Comment added", 201);
  };

  listComments = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const result = await this.disputes.listComments(user, req.params.publicId);
    sendSuccess(res, result);
  };

  addEvidence = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const result = await this.disputes.addEvidence(user, req.params.publicId, req.body);
    sendSuccess(res, result, "Evidence attached", 201);
  };

  listEvidence = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const result = await this.disputes.listEvidence(user, req.params.publicId);
    sendSuccess(res, result);
  };

  removeEvidence = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    await this.disputes.removeEvidence(user, req.params.publicId, req.params.evidenceId);
    sendSuccess(res, null, "Evidence removed");
  };

  listHistory = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const result = await this.disputes.listHistory(user, req.params.publicId);
    sendSuccess(res, result);
  };

  assign = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const result = await this.disputes.assign(user, req.params.publicId, req.body.assignedToUserId);
    sendSuccess(res, result, "Dispute assigned");
  };

  unassign = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const result = await this.disputes.unassign(user, req.params.publicId);
    sendSuccess(res, result, "Dispute unassigned");
  };

  changeStatus = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const result = await this.disputes.changeStatus(user, req.params.publicId, req.body.status, req.body.reason);
    sendSuccess(res, result, "Status updated");
  };

  resolve = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const result = await this.disputes.resolve(user, req.params.publicId, req.body);
    sendSuccess(res, result, "Dispute resolved");
  };

  reject = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const result = await this.disputes.reject(user, req.params.publicId, req.body.resolutionSummary);
    sendSuccess(res, result, "Dispute rejected");
  };

  reopen = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const result = await this.disputes.reopen(user, req.params.publicId, req.body.reason);
    sendSuccess(res, result, "Dispute reopened");
  };

  close = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const result = await this.disputes.close(user, req.params.publicId);
    sendSuccess(res, result, "Dispute closed");
  };

  cancel = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const result = await this.disputes.cancel(user, req.params.publicId, req.body.reason);
    sendSuccess(res, result, "Dispute cancelled");
  };
}
