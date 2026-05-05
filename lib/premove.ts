import { Chess } from "chess.js";

export type Premove = { from: string; to: string };

// Build a speculative chess instance with all queued premoves applied via
// put/remove (no chess.js turn validation, so chains of hypothetical moves
// — including ones that depend on earlier captures — render correctly).
export function buildSpeculative(realFen: string, queue: Premove[]): Chess {
  const spec = new Chess(realFen);
  for (const pm of queue) {
    const piece = spec.get(pm.from as Parameters<Chess["get"]>[0]);
    if (!piece) break;
    spec.remove(pm.from as Parameters<Chess["remove"]>[0]);
    spec.remove(pm.to as Parameters<Chess["remove"]>[0]);
    const isPromotion =
      piece.type === "p" && (pm.to[1] === "8" || pm.to[1] === "1");
    spec.put(
      isPromotion ? { type: "q", color: piece.color } : piece,
      pm.to as Parameters<Chess["put"]>[1],
    );
  }
  return spec;
}

// True iff the proposed premove is fully legal in the speculative position.
// Forces the side-to-move to my color so the unknown opponent reply doesn't
// gate validation. En passant target is dropped; castling rights from the
// real game are preserved.
export function isLegalPremove(
  spec: Chess,
  from: string,
  to: string,
  myColor: "w" | "b",
): boolean {
  const piece = spec.get(from as Parameters<Chess["get"]>[0]);
  if (!piece || piece.color !== myColor) return false;
  const parts = spec.fen().split(" ");
  parts[1] = myColor;
  parts[3] = "-";
  parts[4] = "0";
  const validator = new Chess();
  try {
    validator.load(parts.join(" "));
    const move = validator.move({ from, to, promotion: "q" });
    return !!move;
  } catch {
    return false;
  }
}
