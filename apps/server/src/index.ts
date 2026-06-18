import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import websocket, { type WebSocket } from "@fastify/websocket";
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

const app = Fastify({ logger: true });

await app.register(cors, { origin: true, credentials: true });
await app.register(cookie, { secret: env.sessionSecret });
await app.register(rateLimit, { global: false }); // opt-in per route (auth routes set limits)
await app.register(websocket);

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

app
  .listen({ port: env.port, host: "0.0.0.0" })
  .then(() => app.log.info(`CES server on :${env.port}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
