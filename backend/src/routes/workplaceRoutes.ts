import { Router } from "express";
import { getActionCenter, getSearch } from "../controllers/workplaceController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

/** Every signed-in account; the services scope each result to the caller. */
export const searchRouter = Router();
searchRouter.use(authenticateToken);
searchRouter.get("/", getSearch);

export const actionCenterRouter = Router();
actionCenterRouter.use(authenticateToken);
actionCenterRouter.get("/", getActionCenter);
