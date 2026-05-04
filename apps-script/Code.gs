// =========================================================================
// chess-db backend — Google Apps Script
// =========================================================================
// 1. Open the Google Sheet you'll use as the database.
// 2. Extensions → Apps Script. Paste this entire file into Code.gs.
// 3. Click Save (disk icon, Ctrl+S).
// 4. In the function selector pick `setup`, click Run, accept the auth prompt.
// 5. Deploy → New deployment → Web app → Execute as: Me, Who has access:
//    Anyone. Click Deploy and copy the Web App URL.
// =========================================================================

const SCHEMA = {
  users: [
    "id", "username", "password_hash", "elo", "wins", "losses", "draws",
    "session_token", "session_expires", "created_at",
  ],
  games: [
    "id", "white_id", "white_username", "black_id", "black_username",
    "time_control_min", "is_ranked", "status", "fen", "moves_pgn",
    "white_ms", "black_ms", "last_move_at", "last_move_by",
    "result", "end_reason", "draw_offer_by", "created_at", "ended_at",
  ],
  queue: ["user_id", "username", "time_control_min", "elo", "joined_at"],
  invites: [
    "id", "from_id", "from_username", "to_username", "time_control_min",
    "status", "game_id", "created_at",
  ],
};

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ELO_K = 32;

// ============= SETUP — Run this once before deploying =============
function setup() {
  const ss = SpreadsheetApp.getActive();
  for (const [name, headers] of Object.entries(SCHEMA)) {
    let sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, headers.length);
  }
  // Remove default Sheet1 if it's empty and not in schema.
  const defaultNames = ["Sheet1", "시트1"];
  for (const n of defaultNames) {
    const s = ss.getSheetByName(n);
    if (s && !SCHEMA[n] && ss.getSheets().length > 1 && s.getLastRow() <= 1) {
      ss.deleteSheet(s);
    }
  }
  return "Setup complete: " + Object.keys(SCHEMA).join(", ");
}

// ============= HTTP entry =============
function doGet(e)  { return handle_(e); }
function doPost(e) { return handle_(e); }

function handle_(e) {
  let body = {};
  try {
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    } else if (e && e.parameter) {
      body = e.parameter;
    }
  } catch (err) {
    return resp_({ ok: false, error: "Invalid JSON" });
  }
  const action = body.action;
  if (!action) return resp_({ ok: false, error: "Missing action" });
  try {
    let result;
    switch (action) {
      case "signup":          result = signup_(body);          break;
      case "login":           result = login_(body);           break;
      case "logout":          result = logout_(body);          break;
      case "me":              result = me_(body);              break;
      case "ranking":         result = ranking_(body);         break;
      case "matchmake":       result = matchmake_(body);       break;
      case "unmatch":         result = unmatch_(body);         break;
      case "invite":          result = invite_(body);          break;
      case "invites_pending": result = invitesPending_(body);  break;
      case "invite_respond":  result = inviteRespond_(body);   break;
      case "game":            result = getGame_(body);         break;
      case "move":            result = makeMove_(body);        break;
      case "resign":          result = resign_(body);          break;
      case "draw":            result = drawAction_(body);      break;
      default: throw new Error("Unknown action: " + action);
    }
    return resp_({ ok: true, ...result });
  } catch (err) {
    return resp_({ ok: false, error: String((err && err.message) || err) });
  }
}

function resp_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============= Sheet helpers =============
function getSheet_(name) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sheet) throw new Error("Sheet not found: " + name + ". Run setup() first.");
  return sheet;
}

function readAll_(name) {
  const sheet = getSheet_(name);
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return { sheet, headers: data[0] || [], rows: [] };
  const headers = data[0];
  const rows = data.slice(1).map((row, idx) => {
    const obj = { _row: idx + 2 };
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
  return { sheet, headers, rows };
}

function findOne_(name, predicate) {
  const { rows } = readAll_(name);
  return rows.find(predicate) || null;
}

function findMany_(name, predicate) {
  const { rows } = readAll_(name);
  return rows.filter(predicate);
}

function appendRow_(name, obj) {
  const sheet = getSheet_(name);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = headers.map((h) => (obj[h] !== undefined ? obj[h] : ""));
  sheet.appendRow(row);
}

function updateRowAt_(name, rowIndex, obj) {
  const sheet = getSheet_(name);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  for (const [k, v] of Object.entries(obj)) {
    const idx = headers.indexOf(k);
    if (idx >= 0) sheet.getRange(rowIndex, idx + 1).setValue(v);
  }
}

function deleteRowAt_(name, rowIndex) {
  getSheet_(name).deleteRow(rowIndex);
}

function uuid_() {
  return Utilities.getUuid();
}

function sha256_(str) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    str,
    Utilities.Charset.UTF_8,
  );
  return bytes
    .map((b) => ("0" + (b & 0xff).toString(16)).slice(-2))
    .join("");
}

function nowMs_() {
  return Date.now();
}

function toPublicUser_(row) {
  return {
    id: row.id,
    username: row.username,
    elo: Number(row.elo),
    wins: Number(row.wins),
    losses: Number(row.losses),
    draws: Number(row.draws),
  };
}

function authenticate_(token) {
  if (!token) throw new Error("Not authenticated");
  const user = findOne_("users", (u) => u.session_token === token);
  if (!user) throw new Error("Invalid session");
  if (Number(user.session_expires) < nowMs_()) throw new Error("Session expired");
  return user;
}

// ============= AUTH =============
function signup_(body) {
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    throw new Error("아이디는 영문/숫자/_ 3-20자여야 합니다.");
  }
  if (password.length < 6) {
    throw new Error("비밀번호는 6자 이상이어야 합니다.");
  }
  const dup = findOne_(
    "users",
    (u) => String(u.username).toLowerCase() === username.toLowerCase(),
  );
  if (dup) throw new Error("이미 사용 중인 아이디입니다.");

  const id = uuid_();
  const token = uuid_();
  appendRow_("users", {
    id,
    username,
    password_hash: sha256_(password),
    elo: 1200,
    wins: 0,
    losses: 0,
    draws: 0,
    session_token: token,
    session_expires: nowMs_() + SESSION_TTL_MS,
    created_at: new Date().toISOString(),
  });
  return {
    token,
    user: { id, username, elo: 1200, wins: 0, losses: 0, draws: 0 },
  };
}

function login_(body) {
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  const user = findOne_(
    "users",
    (u) => String(u.username).toLowerCase() === username.toLowerCase(),
  );
  if (!user) throw new Error("아이디 또는 비밀번호가 잘못되었습니다.");
  if (user.password_hash !== sha256_(password)) {
    throw new Error("아이디 또는 비밀번호가 잘못되었습니다.");
  }

  const token = uuid_();
  updateRowAt_("users", user._row, {
    session_token: token,
    session_expires: nowMs_() + SESSION_TTL_MS,
  });
  return { token, user: toPublicUser_(user) };
}

function logout_(body) {
  const token = String(body.token || "");
  const user = findOne_("users", (u) => u.session_token === token);
  if (user) {
    updateRowAt_("users", user._row, {
      session_token: "",
      session_expires: "",
    });
  }
  return {};
}

function me_(body) {
  const user = authenticate_(String(body.token || ""));
  return { user: toPublicUser_(user) };
}

function ranking_() {
  const { rows } = readAll_("users");
  const sorted = rows
    .map((u) => ({
      username: u.username,
      elo: Number(u.elo),
      wins: Number(u.wins),
      losses: Number(u.losses),
      draws: Number(u.draws),
    }))
    .sort((a, b) => b.elo - a.elo)
    .slice(0, 100)
    .map((u, i) => ({ rank: i + 1, ...u }));
  return { ranking: sorted };
}

// ============= MATCHMAKING =============
function matchmake_(body) {
  const user = authenticate_(String(body.token || ""));
  const tc = Number(body.time_control_min);
  if (![3, 5, 10].includes(tc)) throw new Error("Invalid time_control");
  const myElo = Number(user.elo);

  const { rows } = readAll_("queue");
  for (const q of rows) {
    if (q.user_id === user.id) continue;
    if (Number(q.time_control_min) !== tc) continue;
    const oppElo = Number(q.elo);
    const waitedSec = (nowMs_() - Number(q.joined_at)) / 1000;
    const range = waitedSec < 30 ? 100 : waitedSec < 60 ? 200 : 500;
    if (Math.abs(myElo - oppElo) > range) continue;

    const opp = findOne_("users", (u) => u.id === q.user_id);
    if (!opp) continue;
    const meWhite = Math.random() < 0.5;
    const game = createGame_(meWhite ? user : opp, meWhite ? opp : user, tc, true);
    deleteRowAt_("queue", q._row);
    const myInQueue = findOne_("queue", (x) => x.user_id === user.id);
    if (myInQueue) deleteRowAt_("queue", myInQueue._row);
    return { game_id: game.id, matched: true };
  }

  const myExisting = findOne_("queue", (x) => x.user_id === user.id);
  if (myExisting) {
    updateRowAt_("queue", myExisting._row, {
      time_control_min: tc,
      elo: myElo,
      joined_at: nowMs_(),
    });
  } else {
    appendRow_("queue", {
      user_id: user.id,
      username: user.username,
      time_control_min: tc,
      elo: myElo,
      joined_at: nowMs_(),
    });
  }
  return { matched: false };
}

function unmatch_(body) {
  const user = authenticate_(String(body.token || ""));
  const myInQueue = findOne_("queue", (x) => x.user_id === user.id);
  if (myInQueue) deleteRowAt_("queue", myInQueue._row);
  return {};
}

function createGame_(white, black, tcMin, isRanked) {
  const id = uuid_();
  const initialFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const ms = tcMin * 60 * 1000;
  const createdAt = nowMs_();
  appendRow_("games", {
    id,
    white_id: white.id,
    white_username: white.username,
    black_id: black.id,
    black_username: black.username,
    time_control_min: tcMin,
    is_ranked: isRanked ? "yes" : "no",
    status: "active",
    fen: initialFen,
    moves_pgn: "",
    white_ms: ms,
    black_ms: ms,
    last_move_at: createdAt,
    last_move_by: "",
    result: "",
    end_reason: "",
    draw_offer_by: "",
    created_at: createdAt,
    ended_at: "",
  });
  return { id };
}

// ============= INVITES (friend match) =============
function invite_(body) {
  const user = authenticate_(String(body.token || ""));
  const toUsername = String(body.to_username || "").trim();
  const tc = Number(body.time_control_min);
  if (![3, 5, 10].includes(tc)) throw new Error("Invalid time_control");
  if (!toUsername) throw new Error("Missing to_username");
  if (toUsername.toLowerCase() === user.username.toLowerCase()) {
    throw new Error("자기 자신에게는 도전할 수 없습니다.");
  }
  const target = findOne_(
    "users",
    (u) => String(u.username).toLowerCase() === toUsername.toLowerCase(),
  );
  if (!target) throw new Error("해당 아이디를 찾을 수 없습니다.");
  const id = uuid_();
  appendRow_("invites", {
    id,
    from_id: user.id,
    from_username: user.username,
    to_username: target.username,
    time_control_min: tc,
    status: "pending",
    game_id: "",
    created_at: nowMs_(),
  });
  return { invite_id: id };
}

function invitesPending_(body) {
  const user = authenticate_(String(body.token || ""));
  const incoming = findMany_("invites", (i) =>
    String(i.to_username).toLowerCase() === user.username.toLowerCase()
      && i.status === "pending"
  );
  const outgoing = findMany_("invites", (i) =>
    i.from_id === user.id && i.status === "pending"
  );
  return {
    incoming: incoming.map((i) => ({
      id: i.id,
      from_username: i.from_username,
      time_control_min: Number(i.time_control_min),
      created_at: Number(i.created_at),
    })),
    outgoing: outgoing.map((i) => ({
      id: i.id,
      to_username: i.to_username,
      time_control_min: Number(i.time_control_min),
      created_at: Number(i.created_at),
    })),
  };
}

function inviteRespond_(body) {
  const user = authenticate_(String(body.token || ""));
  const inviteId = String(body.invite_id || "");
  const accept = !!body.accept;
  const inv = findOne_("invites", (i) => i.id === inviteId);
  if (!inv) throw new Error("초대를 찾을 수 없습니다.");
  if (String(inv.to_username).toLowerCase() !== user.username.toLowerCase()) {
    throw new Error("Not yours");
  }
  if (inv.status !== "pending") throw new Error("이미 처리됨");

  if (!accept) {
    updateRowAt_("invites", inv._row, { status: "declined" });
    return {};
  }
  const fromUser = findOne_("users", (u) => u.id === inv.from_id);
  if (!fromUser) throw new Error("상대 정보 없음");
  const meWhite = Math.random() < 0.5;
  const game = createGame_(
    meWhite ? user : fromUser,
    meWhite ? fromUser : user,
    Number(inv.time_control_min),
    false,
  );
  updateRowAt_("invites", inv._row, { status: "accepted", game_id: game.id });
  return { game_id: game.id };
}

// ============= GAMES =============
function getGame_(body) {
  const user = authenticate_(String(body.token || ""));
  const gameId = String(body.game_id || "");
  const game = findOne_("games", (g) => g.id === gameId);
  if (!game) throw new Error("Game not found");
  if (game.white_id !== user.id && game.black_id !== user.id) {
    throw new Error("Not in this game");
  }
  return { game: serializeGame_(game) };
}

function serializeGame_(game) {
  return {
    id: game.id,
    white_id: game.white_id,
    white_username: game.white_username,
    black_id: game.black_id,
    black_username: game.black_username,
    time_control_min: Number(game.time_control_min),
    is_ranked: game.is_ranked === "yes",
    status: game.status,
    fen: game.fen,
    moves_pgn: game.moves_pgn,
    white_ms: Number(game.white_ms),
    black_ms: Number(game.black_ms),
    last_move_at: Number(game.last_move_at),
    last_move_by: game.last_move_by,
    result: game.result,
    end_reason: game.end_reason,
    draw_offer_by: game.draw_offer_by,
  };
}

function makeMove_(body) {
  const user = authenticate_(String(body.token || ""));
  const gameId = String(body.game_id || "");
  const fen = String(body.fen || "");
  const movesPgn = String(body.moves_pgn || "");

  const game = findOne_("games", (g) => g.id === gameId);
  if (!game) throw new Error("Game not found");
  if (game.status !== "active") throw new Error("Game not active");

  const isWhite = game.white_id === user.id;
  const isBlack = game.black_id === user.id;
  if (!isWhite && !isBlack) throw new Error("Not in this game");

  const turn = String(game.fen).split(" ")[1]; // before-the-move turn
  const myColor = isWhite ? "w" : "b";
  if (turn !== myColor) throw new Error("Not your turn");

  const elapsed = nowMs_() - Number(game.last_move_at);
  const updates = {
    fen,
    moves_pgn: movesPgn,
    last_move_at: nowMs_(),
    last_move_by: user.id,
    draw_offer_by: "",
  };
  if (myColor === "w") {
    updates.white_ms = Math.max(0, Number(game.white_ms) - elapsed);
  } else {
    updates.black_ms = Math.max(0, Number(game.black_ms) - elapsed);
  }

  let result = "";
  let endReason = "";
  if (body.is_checkmate) {
    result = myColor === "w" ? "white_wins" : "black_wins";
    endReason = "checkmate";
  } else if (body.is_stalemate) {
    result = "draw";
    endReason = "stalemate";
  } else if (body.is_draw) {
    result = "draw";
    endReason = "draw";
  }

  if (result) {
    updates.status = "ended";
    updates.result = result;
    updates.end_reason = endReason;
    updates.ended_at = nowMs_();
    applyEloIfRanked_(game, result);
  }

  updateRowAt_("games", game._row, updates);
  return {};
}

function resign_(body) {
  const user = authenticate_(String(body.token || ""));
  const gameId = String(body.game_id || "");
  const game = findOne_("games", (g) => g.id === gameId);
  if (!game) throw new Error("Game not found");
  if (game.status !== "active") throw new Error("Game not active");
  const isWhite = game.white_id === user.id;
  const isBlack = game.black_id === user.id;
  if (!isWhite && !isBlack) throw new Error("Not in this game");

  const result = isWhite ? "black_wins" : "white_wins";
  updateRowAt_("games", game._row, {
    status: "ended",
    result,
    end_reason: "resign",
    ended_at: nowMs_(),
  });
  applyEloIfRanked_(game, result);
  return {};
}

function drawAction_(body) {
  const user = authenticate_(String(body.token || ""));
  const gameId = String(body.game_id || "");
  const op = String(body.op || "");
  const game = findOne_("games", (g) => g.id === gameId);
  if (!game) throw new Error("Game not found");
  if (game.status !== "active") throw new Error("Game not active");
  const isWhite = game.white_id === user.id;
  const isBlack = game.black_id === user.id;
  if (!isWhite && !isBlack) throw new Error("Not in this game");

  if (op === "offer") {
    updateRowAt_("games", game._row, { draw_offer_by: user.id });
    return {};
  }
  if (op === "decline") {
    if (!game.draw_offer_by || game.draw_offer_by === user.id) {
      throw new Error("거절할 제안 없음");
    }
    updateRowAt_("games", game._row, { draw_offer_by: "" });
    return {};
  }
  if (op === "accept") {
    if (!game.draw_offer_by || game.draw_offer_by === user.id) {
      throw new Error("수락할 제안 없음");
    }
    updateRowAt_("games", game._row, {
      status: "ended",
      result: "draw",
      end_reason: "agreement",
      draw_offer_by: "",
      ended_at: nowMs_(),
    });
    applyEloIfRanked_(game, "draw");
    return {};
  }
  throw new Error("Invalid op");
}

// ============= ELO =============
function applyEloIfRanked_(game, result) {
  if (game.is_ranked !== "yes") return;
  const white = findOne_("users", (u) => u.id === game.white_id);
  const black = findOne_("users", (u) => u.id === game.black_id);
  if (!white || !black) return;
  const ra = Number(white.elo);
  const rb = Number(black.elo);
  const ea = 1 / (1 + Math.pow(10, (rb - ra) / 400));
  const eb = 1 - ea;
  let sa, sb;
  if (result === "white_wins") { sa = 1;   sb = 0;   }
  else if (result === "black_wins") { sa = 0; sb = 1; }
  else { sa = 0.5; sb = 0.5; }
  const newRa = Math.round(ra + ELO_K * (sa - ea));
  const newRb = Math.round(rb + ELO_K * (sb - eb));
  updateRowAt_("users", white._row, {
    elo: newRa,
    wins: Number(white.wins) + (result === "white_wins" ? 1 : 0),
    losses: Number(white.losses) + (result === "black_wins" ? 1 : 0),
    draws: Number(white.draws) + (result === "draw" ? 1 : 0),
  });
  updateRowAt_("users", black._row, {
    elo: newRb,
    wins: Number(black.wins) + (result === "black_wins" ? 1 : 0),
    losses: Number(black.losses) + (result === "white_wins" ? 1 : 0),
    draws: Number(black.draws) + (result === "draw" ? 1 : 0),
  });
}
