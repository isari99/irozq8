import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import quizRouter from "./quiz";
import seedRouter from "./seed";
import twitchRouter from "./twitch";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(quizRouter);
router.use(seedRouter);
router.use(twitchRouter);

export default router;
