import { Request, Response } from "express";
import { sendSuccess } from "../../common/apiResponse";
import { AuthenticatedUserContext, RequestMeta } from "../auth/auth.types";
import {
  CreateShipmentInput,
  ListLocationsInput,
  ListShipmentsInput,
  ShipmentService,
  SubmitLocationInput,
} from "./shipment.service";

function requestMeta(req: Request): RequestMeta {
  return { ipAddress: req.ip, userAgent: req.get("user-agent") };
}

export class ShipmentController {
  constructor(private readonly shipments: ShipmentService) {}

  create = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const input = req.body as CreateShipmentInput;
    const result = await this.shipments.createFromAcceptedQuote(user, input, requestMeta(req));
    sendSuccess(res, result, "Shipment created successfully", 201);
  };

  list = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const query = req.validatedQuery as unknown as {
      status?: ListShipmentsInput["status"];
      providerId?: string;
      vehicleId?: string;
      lotId?: string;
      page: number;
      limit: number;
    };
    const result = await this.shipments.listShipments(user, query);
    sendSuccess(res, result);
  };

  get = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const { publicId } = req.params;
    const result = await this.shipments.getShipment(user, publicId);
    sendSuccess(res, result);
  };

  getHandoff = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const { publicId } = req.params;
    const result = await this.shipments.getHandoff(user, publicId);
    sendSuccess(res, result);
  };

  confirm = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const { publicId } = req.params;
    const result = await this.shipments.confirm(user, publicId, requestMeta(req));
    sendSuccess(res, result, "Shipment confirmed successfully");
  };

  assignDriver = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const { publicId } = req.params;
    const result = await this.shipments.assignDriver(user, publicId, requestMeta(req));
    sendSuccess(res, result, "Driver assigned successfully");
  };

  readyForPickup = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const { publicId } = req.params;
    const result = await this.shipments.readyForPickup(user, publicId, requestMeta(req));
    sendSuccess(res, result, "Shipment marked ready for pickup");
  };

  pickup = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const { publicId } = req.params;
    const result = await this.shipments.pickup(user, publicId, requestMeta(req));
    sendSuccess(res, result, "Shipment picked up successfully");
  };

  startTransit = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const { publicId } = req.params;
    const result = await this.shipments.startTransit(user, publicId, requestMeta(req));
    sendSuccess(res, result, "Shipment is now in transit");
  };

  arrive = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const { publicId } = req.params;
    const result = await this.shipments.arrive(user, publicId, requestMeta(req));
    sendSuccess(res, result, "Shipment marked as arrived");
  };

  deliver = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const { publicId } = req.params;
    const result = await this.shipments.deliver(user, publicId, requestMeta(req));
    sendSuccess(res, result, "Shipment delivered successfully");
  };

  cancel = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const { publicId } = req.params;
    const { reason } = req.body as { reason?: string };
    const result = await this.shipments.cancel(user, publicId, reason, requestMeta(req));
    sendSuccess(res, result, "Shipment cancelled successfully");
  };

  submitLocation = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const { publicId } = req.params;
    const input = req.body as SubmitLocationInput;
    const result = await this.shipments.submitLocation(user, publicId, input, requestMeta(req));
    sendSuccess(res, result, "Location recorded successfully", 201);
  };

  listLocations = async (req: Request, res: Response) => {
    const user = req.user as AuthenticatedUserContext;
    const { publicId } = req.params;
    const query = req.validatedQuery as unknown as ListLocationsInput;
    const result = await this.shipments.listLocations(user, publicId, query);
    sendSuccess(res, result);
  };
}
