import { describe, it, expect, beforeEach } from "vitest";
import { MockBandAdapter, verifyChain } from "../src/band/adapter";
import { BandMessage } from "../src/band/types";

function findingFrom(agent: string, incidentId = "inc-1") {
  return {
    msg_type: "finding" as const,
    from_agent: agent,
    incident_id: incidentId,
    step: agent,
    payload: { ok: true },
    confidence: 0.8,
    requires_human_approval: false,
  };
}

describe("MockBandAdapter — rooms and messages", () => {
  let band: MockBandAdapter;

  beforeEach(() => {
    band = new MockBandAdapter();
  });

  it("creates rooms, joins agents, and stores posted messages in order", async () => {
    const room = await band.createRoom("inc-1");
    await band.joinRoom(room.room_id, "intake-normalization");
    await band.joinRoom(room.room_id, "intake-normalization"); // idempotent

    expect((await band.getRoom(room.room_id))?.participants).toEqual(["intake-normalization"]);

    await band.post(room.room_id, findingFrom("intake-normalization"));
    await band.post(room.room_id, findingFrom("classification"));

    const messages = await band.getMessages(room.room_id);
    expect(messages).toHaveLength(2);
    expect(messages[0].from_agent).toBe("intake-normalization");
    expect(messages[1].from_agent).toBe("classification");
    expect(messages[0].id).toBeTruthy();
    expect(messages[0].room_id).toBe(room.room_id);
  });

  it("rejects posting to a nonexistent room", async () => {
    await expect(band.post("no-such-room", findingFrom("x"))).rejects.toThrow(/not found/);
  });

  it("delivers messages to room listeners and supports unsubscribe", async () => {
    const room = await band.createRoom("inc-1");
    const seen: BandMessage[] = [];
    const unsubscribe = band.onMessage(room.room_id, m => seen.push(m));

    await band.post(room.room_id, findingFrom("a"));
    unsubscribe();
    await band.post(room.room_id, findingFrom("b"));

    expect(seen).toHaveLength(1);
    expect(seen[0].from_agent).toBe("a");
  });

  it("builds a tamper-evident hash chain that detects edits", async () => {
    const room = await band.createRoom("inc-1");
    await band.post(room.room_id, findingFrom("intake-normalization"));
    await band.post(room.room_id, findingFrom("classification"));
    await band.post(room.room_id, findingFrom("severity-blast-radius"));

    const messages = await band.getMessages(room.room_id);
    // Genesis chains from GENESIS; every message links to the previous hash.
    expect(messages[0].prev_hash).toBe("GENESIS");
    expect(messages[1].prev_hash).toBe(messages[0].hash);
    expect(verifyChain(messages).ok).toBe(true);

    // Tamper with a stored payload — the chain must now report a break.
    messages[1].payload = { ok: false, tampered: true };
    const result = verifyChain(messages);
    expect(result.ok).toBe(false);
    expect(result.brokenAt).toBe(1);
  });

  it("hydrate() restores rooms and deduplicates messages", async () => {
    const room = { room_id: "r1", incident_id: "inc-1", participants: ["a"], created_at: new Date().toISOString(), status: "open" as const };
    const msg: BandMessage = { ...findingFrom("a"), id: "m1", room_id: "r1", ts: new Date().toISOString() };

    band.hydrate([room], [msg, msg]); // duplicate on purpose
    expect(await band.getMessages("r1")).toHaveLength(1);
    expect((await band.getRoom("r1"))?.incident_id).toBe("inc-1");
  });
});

describe("MockBandAdapter — authority rules (separation of duties)", () => {
  let band: MockBandAdapter;
  let roomId: string;

  beforeEach(async () => {
    band = new MockBandAdapter();
    roomId = (await band.createRoom("inc-1")).room_id;
  });

  it("any agent may post findings and status", async () => {
    await expect(band.post(roomId, findingFrom("runbook-advisor"))).resolves.toBeTruthy();
    await expect(band.post(roomId, { ...findingFrom("anyone"), msg_type: "status" as const })).resolves.toBeTruthy();
  });

  it("only incident-commander may post proposals and approval_requests", async () => {
    await expect(
      band.post(roomId, { ...findingFrom("runbook-advisor"), msg_type: "proposal" as const })
    ).rejects.toThrow(/Authority violation/);
    await expect(
      band.post(roomId, { ...findingFrom("incident-commander"), msg_type: "approval_request" as const })
    ).resolves.toBeTruthy();
  });

  it("only human-commander may post approvals — agents cannot approve their own proposals", async () => {
    await expect(
      band.post(roomId, { ...findingFrom("incident-commander"), msg_type: "approval" as const })
    ).rejects.toThrow(/Authority violation/);
    await expect(
      band.post(roomId, { ...findingFrom("human-commander"), msg_type: "approval" as const })
    ).resolves.toBeTruthy();
  });

  it("retractions are limited to commander and human", async () => {
    await expect(
      band.post(roomId, { ...findingFrom("classification"), msg_type: "retraction" as const })
    ).rejects.toThrow(/Authority violation/);
    await expect(
      band.post(roomId, { ...findingFrom("human-commander"), msg_type: "retraction" as const })
    ).resolves.toBeTruthy();
  });
});
