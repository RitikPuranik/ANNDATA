import { Request, Response } from "express";
import { sendSuccess } from "../../common/apiResponse";
import { AuthenticatedUserContext, RequestMeta } from "../auth/auth.types";
import {
  AddEvidenceInput,
  CreateDeliveryInput,
  DeliveryService,
  PartialAcceptInput,
  ReceiveDeliveryInput,
  RecordQualityAssessmentInput,
  RecordWeighmentInput,
} from "./delivery.service";
import { DeliveryListFilters } from "./delivery.repository";

function requestMeta(req: Request): RequestMeta {
  return { ipAddress: req.ip, userAgent: req.get("user-agent") };
}

/** Same thin-controller convention as shipment.controller.ts — parses
 * already-validated body/query/params and hands off to DeliveryService;
 * every business rule lives there, not here. */
export class DeliveryController {
  constructor(private readonly deliveries: DeliveryService) {}

  create = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const input = req.body as CreateDeliveryInput;
    const result = await this.deliveries.create(user, input, requestMeta(req));
    sendSuccess(res, result, "Delivery recorded successfully", 201);
  };

  list = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const query = req.validatedQuery as unknown as Omit<DeliveryListFilters, "lotIds" | "shipmentIds">;
    const result = await this.deliveries.list(user, query);
    sendSuccess(res, result);
  };

  get = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const { publicId } = req.params;
    const result = await this.deliveries.get(user, publicId);
    sendSuccess(res, result);
  };

  getHandoff = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const { publicId } = req.params;
    const result = await this.deliveries.getHandoff(user, publicId);
    sendSuccess(res, result);
  };

  receive = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const { publicId } = req.params;
    const input = req.body as ReceiveDeliveryInput;
    const result = await this.deliveries.receive(user, publicId, input, requestMeta(req));
    sendSuccess(res, result, "Delivery marked as received");
  };

  recordWeighment = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const { publicId } = req.params;
    const input = req.body as RecordWeighmentInput;
    const result = await this.deliveries.recordWeighment(user, publicId, input, requestMeta(req));
    sendSuccess(res, result, "Weighment recorded successfully", 201);
  };

  recordQualityAssessment = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const { publicId } = req.params;
    const input = req.body as RecordQualityAssessmentInput;
    const result = await this.deliveries.recordQualityAssessment(user, publicId, input, requestMeta(req));
    sendSuccess(res, result, "Quality assessment recorded successfully", 201);
  };

  reconcile = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const { publicId } = req.params;
    const result = await this.deliveries.reconcile(user, publicId, requestMeta(req));
    sendSuccess(res, result, "Reconciliation calculated");
  };

  accept = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const { publicId } = req.params;
    const result = await this.deliveries.accept(user, publicId, requestMeta(req));
    sendSuccess(res, result, "Delivery accepted");
  };

  partialAccept = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const { publicId } = req.params;
    const input = req.body as PartialAcceptInput;
    const result = await this.deliveries.partialAccept(user, publicId, input, requestMeta(req));
    sendSuccess(res, result, "Delivery partially accepted");
  };

  reject = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const { publicId } = req.params;
    const { reason } = req.body as { reason: string };
    const result = await this.deliveries.reject(user, publicId, reason, requestMeta(req));
    sendSuccess(res, result, "Delivery rejected");
  };

  addEvidence = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const { publicId } = req.params;
    const input = req.body as AddEvidenceInput;
    const result = await this.deliveries.addEvidence(user, publicId, input, requestMeta(req));
    sendSuccess(res, result, "Evidence attached", 201);
  };
}
