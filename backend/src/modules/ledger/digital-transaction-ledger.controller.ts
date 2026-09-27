import { Request, Response } from "express";
import { sendSuccess } from "../../common/apiResponse";
import { AuthenticatedUserContext, RequestMeta } from "../auth/auth.types";
import { LedgerListFilters } from "./digital-transaction-ledger.repository";
import { CreateManualAdjustmentInput, CreateReversalInput, DigitalTransactionLedgerService } from "./digital-transaction-ledger.service";

function requestMeta(req: Request): RequestMeta {
  return { ipAddress: req.ip, userAgent: req.get("user-agent") };
}

/** Same thin-controller convention as payment.controller.ts — parses
 * already-validated body/query/params and hands off to
 * DigitalTransactionLedgerService; every business rule lives there. */
export class DigitalTransactionLedgerController {
  constructor(private readonly ledger: DigitalTransactionLedgerService) {}

  getEntry = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const { publicId } = req.params;
    const result = await this.ledger.getEntry(user, publicId);
    sendSuccess(res, result);
  };

  getTransactionLedger = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const { transactionId } = req.params;
    const result = await this.ledger.getTransactionLedger(user, transactionId);
    sendSuccess(res, result);
  };

  getTransactionSummary = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const { transactionId } = req.params;
    const result = await this.ledger.getTransactionSummary(user, transactionId);
    sendSuccess(res, result);
  };

  listByFarmer = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const { farmerId } = req.params;
    const query = req.validatedQuery as unknown as Omit<LedgerListFilters, "farmerId">;
    const result = await this.ledger.listByFarmer(user, farmerId, query);
    sendSuccess(res, result);
  };

  listByBuyer = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const { buyerId } = req.params;
    const query = req.validatedQuery as unknown as Omit<LedgerListFilters, "buyerId">;
    const result = await this.ledger.listByBuyer(user, buyerId, query);
    sendSuccess(res, result);
  };

  createReversal = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const { publicId } = req.params;
    const input = req.body as CreateReversalInput;
    const result = await this.ledger.createReversal(user, publicId, input, requestMeta(req));
    sendSuccess(res, result, "Reversal entry created", 201);
  };

  createManualAdjustment = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const input = req.body as CreateManualAdjustmentInput;
    const result = await this.ledger.createManualAdjustment(user, input, requestMeta(req));
    sendSuccess(res, result, "Manual adjustment recorded", 201);
  };
}
