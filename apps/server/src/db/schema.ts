import { pgTable, uuid, text, timestamp, bigserial, jsonb, boolean, integer, primaryKey, unique, date } from "drizzle-orm/pg-core";

// Foundation tables only. Feature tables get added per feature, in that feature's folder.

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  registrationMode: text("registration_mode").notNull().default("INVITE_ONLY"), // INVITE_ONLY | OPEN (self-register → pending)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Org hierarchy: Org > Division > Department > Unit > Team (+ virtual groups).
// `path` is a materialized path (e.g. "acme.sales.east"); we'll move to ltree
// when subtree queries actually need it — a plain text path is enough for now.
export const orgNodes = pgTable("org_nodes", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  parentId: uuid("parent_id"),
  nodeType: text("node_type").notNull(), // ORG|DIVISION|DEPARTMENT|UNIT|TEAM|VIRTUAL
  name: text("name").notNull(),
  path: text("path").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Real accounts. Email + scrypt password hash today; OIDC subjects get added later
// (passwordHash stays null for SSO users). One deployment = one company = one tenant.
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  nodeId: uuid("node_id").references(() => orgNodes.id), // home node in the org tree (nullable)
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash"), // null = no local password (SSO-only / directory-only)
  role: text("role").notNull().default("MEMBER"), // TENANT_ADMIN|NODE_ADMIN|FACILITATOR|MEMBER
  status: text("status").notNull().default("ACTIVE"), // ACTIVE|DISABLED
  emailVerified: boolean("email_verified").notNull().default(false),
  // 2FA lands here later: totpSecret + a verification step in /login. Not built yet.
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Invite-only registration: an admin creates one of these and emails the token link.
export const invites = pgTable("invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  email: text("email").notNull(),
  role: text("role").notNull().default("MEMBER"),
  token: text("token").notNull().unique(),
  invitedBy: uuid("invited_by").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  acceptedAt: timestamp("accepted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// A Session is the hosted "room" / activity-group for a meeting. The host runs
// activities inside it; people join once and stay for the whole session.
export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  hostId: uuid("host_id").notNull(), // current host (can change via pass/failover)
  creatorId: uuid("creator_id"), // who created it — can always reclaim host
  title: text("title").notNull(),
  joinCode: text("join_code"), // short shareable code: "Join session ABC123"
  scopeKind: text("scope_kind"), // ALL | NODE | GROUP auto-invite (null = invite-only)
  scopeId: uuid("scope_id"), // node or group id (null for ALL)
  activeAgendaId: uuid("active_agenda_id"), // the agenda item currently in focus

  // Extensible meeting settings (grows over time). joinPolicy: OPEN | APPROVAL (lobby).
  // participantStart: can non-hosts start activities; participantTypes: which ones they may start.
  settings: jsonb("settings").$type<{ joinPolicy?: "OPEN" | "APPROVAL"; participantStart?: boolean; participantTypes?: string[] }>(),
  state: text("state").notNull().default("DRAFT"), // DRAFT | SCHEDULED | LIVE | ENDED
  scheduledAt: timestamp("scheduled_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
});

// One row per invited person. Tracks the join lifecycle.
export const sessionParticipants = pgTable(
  "session_participants",
  {
    sessionId: uuid("session_id").notNull().references(() => sessions.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    // INVITED | JOINED | DECLINED | MISSED | LEFT | REMOVED
    state: text("state").notNull().default("INVITED"),
    sessionRole: text("session_role"), // null = member; COHOST = can drive activities + invite/remove
    accessRevoked: boolean("access_revoked").notNull().default(false), // can no longer see the session/log
    batchId: uuid("batch_id"), // set when invited as part of a bulk group invite
    invitedAt: timestamp("invited_at").defaultNow().notNull(),
    respondedAt: timestamp("responded_at"),
  },
  (t) => ({ pk: primaryKey({ columns: [t.sessionId, t.userId] }) }),
);

// An activity runs inside a session. One LIVE at a time; the host drives it.
export const activities = pgTable("activities", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => sessions.id),
  type: text("type").notNull(), // RANDOMIZER (more later)
  title: text("title").notNull(),
  startedBy: uuid("started_by"), // host or cohost who launched it (for the log)
  agendaItemId: uuid("agenda_item_id"), // the agenda item this activity ran under (set at launch)
  config: jsonb("config").$type<{
    removeAfterPick?: boolean; // randomizer
    includeHost?: boolean; // randomizer — include the host in the draw
    anonymous?: boolean; // nomination — default true; named voting must be host-enabled
    showCounts?: boolean; // nomination — results visible to participants (host can toggle)
    timerSeconds?: number; // nomination — optional voting countdown
    description?: string; // brainstorm — what we're brainstorming about
    bestOf?: number; // rps — 1 | 3 | 5 | 10
    agreementKind?: "LOSER" | "WINNER"; // rps — "Loser has to" / "Winner gets"
    agreementText?: string; // rps — the stakes
    listNodeId?: string; // tasks — the standing team/dept list this activity's tasks feed
    spotlightTaskId?: string; // task review — the task currently focused for the room
    triviaPhase?: "COLLECTING" | "ASSIGNED" | "REVEALED"; // team trivia phase
    triviaDeadline?: string; // team trivia — submission deadline (ISO)
    pollOptions?: string[]; // live poll — the choices
    anonymity?: "NAMED" | "ANON_ROOM" | "ANON_ALL"; // poll — who can see individual votes
    resultsVisibility?: "LIVE" | "AFTER_VOTE" | "HIDDEN"; // poll — when participants see results
    chartType?: "BAR" | "DONUT"; // poll — chart style
    pollCloseAt?: string; // poll — auto-close deadline (ISO)
    pollClosed?: boolean; // poll — voting closed
    closeSeconds?: number; // poll/draft — raw auto-close seconds (turned into pollCloseAt at launch)
    launchAt?: string; // draft — optional scheduled auto-launch time (ISO)
    player1Id?: string; // rps
    player2Id?: string; // rps
  }>(),
  state: text("state").notNull().default("LIVE"), // DRAFT (pre-planned) | LIVE | ENDED
  createdAt: timestamp("created_at").defaultNow().notNull(),
  endedAt: timestamp("ended_at"),
});

// Ordered record of who the randomizer picked (also the history/outcome).
export const activityPicks = pgTable("activity_picks", {
  id: uuid("id").primaryKey().defaultRandom(),
  activityId: uuid("activity_id").notNull().references(() => activities.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  manual: boolean("manual").notNull().default(false), // host chose this person specifically
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Per-session chat, so a session can settle things without a separate meeting.
export const sessionMessages = pgTable("session_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => sessions.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  replyToId: uuid("reply_to_id"), // message this one replies to (self-ref, nullable)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const chatReactions = pgTable(
  "chat_reactions",
  {
    messageId: uuid("message_id").notNull().references(() => sessionMessages.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    emoji: text("emoji").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.messageId, t.userId, t.emoji] }) }),
);

// Per-user read marker for a session's chat (drives the unread badge).
export const sessionChatReads = pgTable(
  "session_chat_reads",
  {
    sessionId: uuid("session_id").notNull().references(() => sessions.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    lastReadAt: timestamp("last_read_at").defaultNow().notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.sessionId, t.userId] }) }),
);

// A persistent, scoped board. `type` defines its content; visible to its scope.
export const boards = pgTable("boards", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  type: text("type").notNull().default("BRAINSTORM"), // NOTICE | BRAINSTORM (more later)
  scopeKind: text("scope_kind").notNull(), // ALL | NODE | GROUP — who can see it
  scopeId: uuid("scope_id"),
  title: text("title").notNull(),
  description: text("description"),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Generic board posts (used by NOTICE now; events/suggestions/etc. extend later).
export const boardPosts = pgTable("board_posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  boardId: uuid("board_id").notNull().references(() => boards.id),
  authorId: uuid("author_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  body: text("body"),
  activeUntil: timestamp("active_until"), // notice expiry; null = no expiry
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const boardPostComments = pgTable("board_post_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  postId: uuid("post_id").notNull().references(() => boardPosts.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Ideas belong to a live brainstorm activity OR a persistent board (exactly one).
export const brainstormIdeas = pgTable("brainstorm_ideas", {
  id: uuid("id").primaryKey().defaultRandom(),
  activityId: uuid("activity_id").references(() => activities.id),
  boardId: uuid("board_id").references(() => boards.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  body: text("body"), // optional explanation
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const brainstormLikes = pgTable(
  "brainstorm_likes",
  {
    ideaId: uuid("idea_id").notNull().references(() => brainstormIdeas.id),
    userId: uuid("user_id").notNull().references(() => users.id),
  },
  (t) => ({ pk: primaryKey({ columns: [t.ideaId, t.userId] }) }),
);

export const brainstormComments = pgTable("brainstorm_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  ideaId: uuid("idea_id").notNull().references(() => brainstormIdeas.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Rock-paper-scissors rounds (best-of-N between two players).
export const rpsRounds = pgTable(
  "rps_rounds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    activityId: uuid("activity_id").notNull().references(() => activities.id),
    roundNo: integer("round_no").notNull(),
    p1Choice: text("p1_choice"), // ROCK | PAPER | SCISSORS
    p2Choice: text("p2_choice"),
    p1Forfeit: boolean("p1_forfeit").notNull().default(false), // didn't lock in before the deadline
    p2Forfeit: boolean("p2_forfeit").notNull().default(false),
    winner: text("winner"), // P1 | P2 | TIE
    deadlineAt: timestamp("deadline_at"), // lock-in deadline; past it, a non-locker forfeits
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({ uniqRound: unique().on(t.activityId, t.roundNo) }), // makes concurrent round-advance safe
);

// Tasks activity: a shared to-do board jotted during a session. status: TODO | DOING | DONE.
export const sessionTasks = pgTable("session_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  activityId: uuid("activity_id").references(() => activities.id), // null = added directly on the team board

  title: text("title").notNull(),
  assigneeId: uuid("assignee_id").references(() => users.id), // who it's for (null = unassigned)
  createdBy: uuid("created_by").notNull().references(() => users.id), // who assigned it
  listNodeId: uuid("list_node_id").references(() => orgNodes.id), // standing team/dept list this feeds
  parentId: uuid("parent_id"), // a subtask points at its parent task (one level); FK added in SQL
  seq: bigserial("seq", { mode: "number" }), // stable per-deployment number for the human key (e.g. MRKT-3)
  dueDate: date("due_date"), // optional, date only
  status: text("status").notNull().default("TODO"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Session agenda: an ordered checklist; activities tie to the currently-active item.
export const agendaItems = pgTable("agenda_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => sessions.id),
  title: text("title").notNull(),
  time: text("time"), // optional start time, e.g. "10:00"
  durationMins: integer("duration_mins"), // optional run time in minutes
  note: text("note"), // optional detail
  position: integer("position").notNull(),
  done: boolean("done").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Live poll (Mentimeter-style): one vote per person per poll; changeable until the poll closes.
export const pollVotes = pgTable(
  "poll_votes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    activityId: uuid("activity_id").notNull().references(() => activities.id),
    optionIndex: integer("option_index").notNull(),
    voterId: uuid("voter_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({ uniqVoter: unique().on(t.activityId, t.voterId) }),
);

// Team trivia: each participant submits one prompt about themselves; at close it's randomly
// assigned to a teammate to guess aloud; at reveal all answers are shown. format: OPEN | MC.
export const triviaSubmissions = pgTable(
  "trivia_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    activityId: uuid("activity_id").notNull().references(() => activities.id),
    authorId: uuid("author_id").notNull().references(() => users.id),
    format: text("format").notNull(), // OPEN | MC
    prompt: text("prompt").notNull(),
    answer: text("answer"), // OPEN: the true answer (optional, for reveal)
    options: jsonb("options").$type<string[]>(), // MC: the choices
    correctIndex: integer("correct_index"), // MC: index of the right choice
    assignedToId: uuid("assigned_to_id").references(() => users.id), // who guesses it (set at close)
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({ uniqAuthor: unique().on(t.activityId, t.authorId) }), // one submission per person
);

// Repository: useful tidbits/links shared at an org level. Links (and wide scopes) need approval
// from an admin or an appointed approver; whitelisted-domain links and team/dept text auto-publish.
export const repoItems = pgTable("repo_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  nodeId: uuid("node_id").notNull().references(() => orgNodes.id), // target scope (team/dept/div/org)
  kind: text("kind").notNull(), // TEXT | LINK
  category: text("category").notNull().default("GENERAL"), // POLICY|TOOLS|PROTOCOL|MEETING|NEWS|GENERAL (the tabs)
  title: text("title").notNull(),
  url: text("url"), // LINK
  body: text("body"), // description / note (or the text content for a TEXT item)
  itemDate: date("item_date"), // optional relevant date (e.g. a meeting/event/news date)
  domain: text("domain"), // hostname of url, for whitelist checks
  submittedBy: uuid("submitted_by").notNull().references(() => users.id),
  status: text("status").notNull().default("PENDING"), // PENDING | APPROVED | REJECTED
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Appointed approvers for a node — an approver here also covers the node's sub-tree.
export const repoApprovers = pgTable(
  "repo_approvers",
  {
    nodeId: uuid("node_id").notNull().references(() => orgNodes.id),
    userId: uuid("user_id").notNull().references(() => users.id),
  },
  (t) => ({ pk: primaryKey({ columns: [t.nodeId, t.userId] }) }),
);

// Comments on a repository item (visible to anyone who can see the item).
export const repoComments = pgTable("repo_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  itemId: uuid("item_id").notNull().references(() => repoItems.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Whitelisted link domains — links to these skip review.
export const repoDomains = pgTable(
  "repo_domains",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    domain: text("domain").notNull(),
  },
  (t) => ({ uniq: unique().on(t.tenantId, t.domain) }),
);

// Append-only log of task changes — drives the "Name M. updated MRKT-3" activity feed.
// Keys are stored as text so the line survives the task being deleted.
export const taskEvents = pgTable("task_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id").notNull().references(() => users.id),
  action: text("action").notNull(), // created | updated | completed | removed
  taskKey: text("task_key").notNull(),
  relatedKey: text("related_key"), // the parent task's key, if this is a subtask
  listNodeId: uuid("list_node_id").references(() => orgNodes.id), // for scoping the feed to your units
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Nomination activity: one vote per participant for who goes next.
export const activityVotes = pgTable(
  "activity_votes",
  {
    activityId: uuid("activity_id").notNull().references(() => activities.id),
    voterId: uuid("voter_id").notNull().references(() => users.id),
    nomineeId: uuid("nominee_id").notNull().references(() => users.id),
  },
  (t) => ({ pk: primaryKey({ columns: [t.activityId, t.voterId] }) }),
);

// Timeline of who joined/left/was removed, for the session log.
export const sessionEvents = pgTable("session_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => sessions.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  kind: text("kind").notNull(), // joined | left | declined | removed
  at: timestamp("at").defaultNow().notNull(),
});

// A bulk "invite a group" action — so it can be reviewed and cancelled as a unit.
export const inviteBatches = pgTable("invite_batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => sessions.id),
  scopeLabel: text("scope_label").notNull(), // "Entire org" / dept / group name
  count: integer("count").notNull(),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  cancelledAt: timestamp("cancelled_at"),
  cancelReason: text("cancel_reason"),
});

// Custom groups: committees / squads / ad-hoc teams that don't fit the org tree.
// Many-to-many — a person can be in several groups.
export const groups = pgTable("groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const groupMembers = pgTable(
  "group_members",
  {
    groupId: uuid("group_id").notNull().references(() => groups.id),
    userId: uuid("user_id").notNull().references(() => users.id),
  },
  (t) => ({ pk: primaryKey({ columns: [t.groupId, t.userId] }) }),
);

// Permission groups: capability bundles (distinct from session-audience `groups` above).
// Tenant-admin defines them; users are assigned; each scoped capability carries an org level.
export const permissionGroups = pgTable("permission_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(),
  level: integer("level").notNull().default(1), // rank; higher = more senior. drives defaults + N-approver rule
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// A group inherits all capabilities of its parent groups (live composition, e.g. Director ⊃ Staff).
export const permissionGroupParents = pgTable(
  "permission_group_parents",
  {
    groupId: uuid("group_id").notNull().references(() => permissionGroups.id),
    parentId: uuid("parent_id").notNull().references(() => permissionGroups.id),
  },
  (t) => ({ pk: primaryKey({ columns: [t.groupId, t.parentId] }) }),
);

export const permissionGroupCaps = pgTable(
  "permission_group_caps",
  {
    groupId: uuid("group_id").notNull().references(() => permissionGroups.id),
    capability: text("capability").notNull(),
    scope: text("scope"), // SELF | DEPT | DIVISION | ORG for scoped caps; null for boolean caps
  },
  (t) => ({ pk: primaryKey({ columns: [t.groupId, t.capability] }) }),
);

export const userPermissionGroups = pgTable(
  "user_permission_groups",
  {
    userId: uuid("user_id").notNull().references(() => users.id),
    groupId: uuid("group_id").notNull().references(() => permissionGroups.id),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.groupId] }) }),
);

// Requests & approvals: escalations (join a permission group) and free-form asks (e.g. "pin to org
// board"). Multi-sign — a request needs `requiredApprovals` distinct approvers before it's applied.
export const requests = pgTable("requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  kind: text("kind").notNull(), // PERMISSION_GRANT | GENERIC
  subjectUserId: uuid("subject_user_id").references(() => users.id), // who it's for (PERMISSION_GRANT)
  groupId: uuid("group_id").references(() => permissionGroups.id), // requested group
  title: text("title"), // GENERIC description
  status: text("status").notNull().default("PENDING"), // PENDING | APPROVED | REJECTED
  requiredApprovals: integer("required_approvals").notNull().default(1),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const requestApprovals = pgTable(
  "request_approvals",
  {
    requestId: uuid("request_id").notNull().references(() => requests.id),
    approverId: uuid("approver_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.requestId, t.approverId] }) }),
);

// Short-lived password reset tokens (emailed link). Single-use.
export const passwordResets = pgTable("password_resets", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Append-only, hash-chained. App role must never UPDATE/DELETE this (enforce in prod grants).
export const auditLog = pgTable("audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  tenantId: uuid("tenant_id"),
  actorId: uuid("actor_id"),
  action: text("action").notNull(),
  meta: jsonb("meta"),
  prevHash: text("prev_hash"),
  hash: text("hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Listy — collaborative checklists. A list has a required title; anyone can add items
// and check them on/off. recurrence stores the cadence; auto-reset is a later slice.
export const lists = pgTable("lists", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  title: text("title").notNull(),
  status: text("status").notNull().default("OPEN"), // OPEN | CLOSED
  recurrence: text("recurrence").notNull().default("NONE"), // NONE | DAILY | WEEKLY | QUARTERLY
  scopeKind: text("scope_kind").notNull().default("ALL"), // ALL | NODE | GROUP — who can see it
  scopeId: uuid("scope_id"),
  lastResetAt: timestamp("last_reset_at").defaultNow().notNull(), // for recurring lists (lazy reset on read)
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const listItems = pgTable("list_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  listId: uuid("list_id").notNull().references(() => lists.id),
  text: text("text").notNull(),
  done: boolean("done").notNull().default(false),
  doneBy: uuid("done_by").references(() => users.id),
  doneAt: timestamp("done_at"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Per-list activity log (created / item_added / item_checked / item_unchecked / closed / reopened / reset).
export const listEvents = pgTable("list_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  listId: uuid("list_id").notNull().references(() => lists.id),
  actorId: uuid("actor_id").notNull().references(() => users.id),
  action: text("action").notNull(),
  detail: text("detail"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const listItemComments = pgTable("list_item_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  itemId: uuid("item_id").notNull().references(() => listItems.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// When each user last opened a list → drives "updated since you looked" badges.
export const listReads = pgTable(
  "list_reads",
  {
    listId: uuid("list_id").notNull().references(() => lists.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.listId, t.userId] }) }),
);
