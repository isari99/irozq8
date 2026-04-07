import { Router } from "express";
import { getTwitchUser } from "../lib/twitchApi";

const router = Router();

router.get("/twitch/user/:username", async (req, res) => {
  const { username } = req.params;
  if (!username || !/^\w+$/.test(username)) {
    return res.status(400).json({ error: "invalid username" });
  }
  const user = await getTwitchUser(username);
  res.json(user);
});

export default router;
