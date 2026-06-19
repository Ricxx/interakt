import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import websocket, { type WebSocket } from "@fastify/websocket";
import multipart from "@fastify/multipart";
import { env } from "./env.js";
import { getUserFromRequest, loadUser } from "./auth.js";
import { hub } from "./lib/realtime.js";
import { onUserConnected, onUserDisconnected } from "./features/sessions/presence.js";
import { authRoutes } from "./features/auth/routes.js";
import { memberRoutes } from "./features/members/routes.js";
import { orgRoutes } from "./features/org/routes.js";
import { randomizerRoutes } from "./features/randomizer/routes.js";
import { groupRoutes } from "./features/groups/routes.js";
import { sessionRoutes } from "./features/sessions/routes.js";
import { activityRoutes } from "./features/activities/routes.js";
import { chatRoutes } from "./features/chat/routes.js";
import { boardRoutes } from "./features/boards/routes.js";
import { taskRoutes } from "./features/tasks/routes.js";
import { repoRoutes } from "./features/repo/routes.js";
import { agendaRoutes } from "./features/agenda/routes.js";
import { auditRoutes } from "./features/audit/routes.js";
import { permissionRoutes } from "./features/permissions/routes.js";
import { requestRoutes } from "./features/requests/routes.js";
import { listRoutes } from "./features/lists/routes.js";
import { refRoutes } from "./features/refs/routes.js";
import { artifactRoutes } from "./features/artifacts/routes.js";
import { surveyRoutes } from "./features/surveys/routes.js";
import { surveyRespondRoutes } from "./features/surveys/respond.js";
import { surveyResultsRoutes } from "./features/surveys/results.js";
import { surveyInsightRoutes } from "./features/surveys/insights.js";
import { quizRoutes } from "./features/quizzes/routes.js";
import { wellnessRoutes } from "./features/wellness/routes.js";
import { recognitionRoutes } from "./features/recognition/routes.js";
import { profileRoutes } from "./features/profile/routes.js";
import { tenantRoutes } from "./features/tenant/routes.js";
import { eventRoutes } from "./features/events/routes.js";
import { usageRoutes } from "./features/usage/routes.js";
import { tournamentRoutes } from "./features/tournaments/routes.js";
import { pointsRoutes } from "./features/points/routes.js";
import { achievementRoutes } from "./features/achievements/routes.js";
import { marketRoutes } from "./features/market/routes.js";
import { uploadRoutes } from "./features/uploads/routes.js";

// maxParamLength default is 100; our signed QR upload tokens (/u/:token) are ~150 base64url chars.
const app = Fastify({ logger: true, maxParamLength: 256 });

// Tolerate a body-less POST sent with Content-Type: application/json (Fastify's default parser 400s an
// empty body). Bodyless mutations like toggles/upvotes should just see {} instead of failing.
app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
  const s = (body as string).trim();
  if (s === "") return done(null, {});
  try {
    done(null, JSON.parse(s));
  } catch {
    const err = new Error("invalid_json") as Error & { statusCode?: number };
    err.statusCode = 400;
    done(err, undefined);
  }
});

await app.register(cors, { origin: true, credentials: true });
await app.register(cookie, { secret: env.sessionSecret });
await app.register(rateLimit, { global: false }); // opt-in per route (auth routes set limits)
await app.register(websocket);
await app.register(multipart);

// Load the current user onto every request before route handlers run.
app.decorateRequest("currentUser", null);
app.addHook("preHandler", loadUser);

app.get("/api/health", async () => ({ ok: true }));

// One realtime connection per browser/Tauri app. Auth via the session cookie.
app.register(async (scoped) => {
  scoped.get("/api/ws", { websocket: true }, async (socket: WebSocket, req) => {
    const user = await getUserFromRequest(req);
    if (!user) {
      socket.close(1008, "unauthenticated");
      return;
    }
    hub.add(socket, user.id);
    void onUserConnected(user.id);
    socket.on("close", () => {
      const offline = hub.remove(socket);
      if (offline) void onUserDisconnected(user.id);
    });
  });
});

authRoutes(app);
memberRoutes(app);
orgRoutes(app);
randomizerRoutes(app);
groupRoutes(app);
sessionRoutes(app);
activityRoutes(app);
chatRoutes(app);
boardRoutes(app);
taskRoutes(app);
repoRoutes(app);
agendaRoutes(app);
auditRoutes(app);
permissionRoutes(app);
requestRoutes(app);
listRoutes(app);
refRoutes(app);
artifactRoutes(app);
surveyRoutes(app);
surveyRespondRoutes(app);
surveyResultsRoutes(app);
surveyInsightRoutes(app);
quizRoutes(app);
wellnessRoutes(app);
recognitionRoutes(app);
profileRoutes(app);
tenantRoutes(app);
eventRoutes(app);
usageRoutes(app);
tournamentRoutes(app);
pointsRoutes(app);
achievementRoutes(app);
marketRoutes(app);
uploadRoutes(app);

app
  .listen({ port: env.port, host: "0.0.0.0" })
  .then(() => app.log.info(`CES server on :${env.port}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });

// Close the server on shutdown so the port frees immediately — without this, `tsx watch` restarts
// race on the listener and crash with EADDRINUSE, which looks like "auto-reload stopped working".
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.once(sig, () => {
    app.close().then(() => process.exit(0)).catch(() => process.exit(1));
  });
}
