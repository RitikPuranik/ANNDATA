import { Request, Response } from "express";
import { sendSuccess } from "../../common/apiResponse";
import { AuthenticatedUserContext, RequestMeta } from "../auth/auth.types";
import { PaymentObligationListFilters } from "./payment-obligation.repository";
import { PaymentRecordListFilters } from "./payment-record.repository";
import { CreatePaymentObligationInput, PaymentService, RecordPaymentInput } from "./payment.service";

function requestMeta(req: Request): RequestMeta {
  return { ipAddress: req.ip, userAgent: req.get("user-agent") };
}

/** Same thin-controller convention as delivery.controller.ts — parses
 * already-validated body/query/params and hands off to PaymentService;
 * every business rule lives there, not here. */
export class PaymentController {
  constructor(private readonly payments: PaymentService) {}

  createObligation = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const input = req.body as CreatePaymentObligationInput;
    const result = await this.payments.createObligation(user, input, requestMeta(req));
    sendSuccess(res, result, "Payment obligation created successfully", 201);
  };

  list = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const query = req.validatedQuery as unknown as Omit<
      PaymentObligationListFilters,
      "visibleBuyerIds" | "visibleSellerFarmerIds" | "visibleSellerFpoIds"
    >;
    const result = await this.payments.list(user, query);
    sendSuccess(res, result);
  };

  get = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const { publicId } = req.params;
    const result = await this.payments.get(user, publicId);
    sendSuccess(res, result);
  };

  recordPayment = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const { publicId } = req.params;
    const input = req.body as RecordPaymentInput;
    const result = await this.payments.recordPayment(user, publicId, input, requestMeta(req));
    sendSuccess(res, result, "Payment recorded successfully", 201);
  };

  listPayments = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const { publicId } = req.params;
    const query = req.validatedQuery as unknown as Omit<PaymentRecordListFilters, "paymentObligationId">;
    const result = await this.payments.listPayments(user, publicId, query);
    sendSuccess(res, result);
  };

  confirmPayment = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const { recordPublicId } = req.params;
    const result = await this.payments.confirmPayment(user, recordPublicId, requestMeta(req));
    sendSuccess(res, result, "Payment confirmed");
  };

  getRecordHandoff = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const { recordPublicId } = req.params;
    const result = await this.payments.getRecordHandoff(user, recordPublicId);
    sendSuccess(res, result);
  };

  markDisputed = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const { publicId } = req.params;
    const { reason } = req.body as { reason: string };
    const result = await this.payments.markDisputed(user, publicId, reason, requestMeta(req));
    sendSuccess(res, result, "Payment obligation marked as disputed");
  };

  cancel = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const { publicId } = req.params;
    const { reason } = req.body as { reason: string };
    const result = await this.payments.cancelObligation(user, publicId, reason, requestMeta(req));
    sendSuccess(res, result, "Payment obligation cancelled");
  };
}
