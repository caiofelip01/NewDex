import { handleNodeRequest } from "../backend/server.js";

export default async function handler(req, res) {
  await handleNodeRequest(req, res);
}
