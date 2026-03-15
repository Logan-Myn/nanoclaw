import fs from 'fs';
import path from 'path';

import { ASSISTANT_NAME, DATA_DIR } from './config.js';
import { getRecentBotMessages } from './db.js';
import { GroupQueue } from './group-queue.js';
import { logger } from './logger.js';

const STATUS_FILE = path.join(DATA_DIR, 'office-status.json');
const WRITE_INTERVAL = 3000;
const CHATTING_WINDOW_MS = 60_000;

interface OfficeAgent {
  id: string;
  name: string;
  role: string;
  state: 'idle' | 'working' | 'thinking' | 'chatting';
  activity: string;
  group?: string;
  lastActive: string;
}

interface OfficeSnapshot {
  timestamp: string;
  assistantName: string;
  agents: OfficeAgent[];
  conversations?: {
    participants: string[];
    topic: string;
    messages?: { from: string; text: string; at: string }[];
  }[];
}

// Agent identity mapping — hardcoded for the 5-agent team
const AGENT_DEFS = [
  { id: 'bob', name: 'Bob', role: 'Team Manager' },
  { id: 'scout', name: 'Scout', role: 'Research Agent' },
  { id: 'designer', name: 'Designer', role: 'Design Agent' },
  { id: 'builder', name: 'Builder', role: 'Dev Agent' },
  { id: 'qa', name: 'QA', role: 'QA Agent' },
] as const;

// Which groups make which agents active
// Bob is active when main or telegram_main containers run
// Team agents are active when telegram_website-team runs
function getActiveAgents(queue: GroupQueue): Map<string, { group: string; startedRecently: boolean }> {
  const active = new Map<string, { group: string; startedRecently: boolean }>();
  const status = queue.getStatus();

  for (const [groupJid, state] of status) {
    if (!state.active) continue;

    const folder = state.groupFolder || '';
    const isRecent = false; // We don't track start time; simplify to just active

    if (folder === 'main' || folder === 'telegram_main' || folder === 'office_main') {
      active.set('bob', { group: folder, startedRecently: isRecent });
    }
    if (folder === 'telegram_website-team') {
      for (const agentId of ['scout', 'designer', 'builder', 'qa']) {
        active.set(agentId, { group: folder, startedRecently: isRecent });
      }
    }
  }

  return active;
}

function getChattingAgents(): Set<string> {
  const chatting = new Set<string>();
  const since = new Date(Date.now() - CHATTING_WINDOW_MS).toISOString();

  try {
    const recentMessages = getRecentBotMessages(since, 20);
    if (recentMessages.length > 0) {
      // If there are recent bot messages, Bob is chatting (he's the coordinator)
      chatting.add('bob');
      // If messages are from team group, team agents are also chatting
      for (const msg of recentMessages) {
        if (msg.chat_jid.includes('website-team') || msg.chat_jid.includes('telegram_website-team')) {
          chatting.add('scout');
          chatting.add('designer');
          chatting.add('builder');
          chatting.add('qa');
          break;
        }
      }
    }
  } catch {
    // DB not ready or query failed — ignore
  }

  return chatting;
}

function getRecentConversations(): OfficeSnapshot['conversations'] {
  try {
    const since = new Date(Date.now() - CHATTING_WINDOW_MS).toISOString();
    const recentMessages = getRecentBotMessages(since, 30);
    if (recentMessages.length === 0) return undefined;

    // Group by chat_jid and return as conversations
    const byChat = new Map<string, { from: string; text: string; at: string }[]>();
    for (const msg of recentMessages) {
      const msgs = byChat.get(msg.chat_jid) || [];
      // Strip the bot prefix (e.g. "Bob: ") from content
      let text = msg.content;
      if (text.startsWith(`${ASSISTANT_NAME}:`)) {
        text = text.slice(ASSISTANT_NAME.length + 1).trim();
      }
      msgs.push({
        from: 'bob',
        text,
        at: msg.timestamp,
      });
      byChat.set(msg.chat_jid, msgs);
    }

    const conversations: NonNullable<OfficeSnapshot['conversations']> = [];
    for (const [chatJid, msgs] of byChat) {
      conversations.push({
        participants: ['bob'],
        topic: chatJid,
        messages: msgs.reverse(), // chronological order
      });
    }
    return conversations.length > 0 ? conversations : undefined;
  } catch {
    return undefined;
  }
}

function buildSnapshot(queue: GroupQueue): OfficeSnapshot {
  const activeAgents = getActiveAgents(queue);
  const chattingAgents = getChattingAgents();
  const now = new Date().toISOString();

  const agents: OfficeAgent[] = AGENT_DEFS.map((def) => {
    const activeInfo = activeAgents.get(def.id);
    const isChatting = chattingAgents.has(def.id);

    let state: OfficeAgent['state'];
    let activity: string;

    if (activeInfo) {
      state = 'working';
      activity = `Processing messages in ${activeInfo.group}`;
    } else if (isChatting) {
      state = 'chatting';
      activity = 'Responding to conversation';
    } else {
      state = 'idle';
      activity = 'Standing by';
    }

    return {
      id: def.id,
      name: def.name,
      role: def.role,
      state,
      activity,
      group: activeInfo?.group,
      lastActive: activeInfo ? now : '',
    };
  });

  return {
    timestamp: now,
    assistantName: ASSISTANT_NAME,
    agents,
    conversations: getRecentConversations(),
  };
}

function writeSnapshot(queue: GroupQueue): void {
  try {
    const snapshot = buildSnapshot(queue);
    const json = JSON.stringify(snapshot, null, 2);
    const tmpPath = `${STATUS_FILE}.tmp`;
    fs.mkdirSync(path.dirname(STATUS_FILE), { recursive: true });
    fs.writeFileSync(tmpPath, json);
    fs.renameSync(tmpPath, STATUS_FILE);
  } catch (err) {
    logger.error({ err }, 'Failed to write office status snapshot');
  }
}

export function startOfficeStatusWriter(queue: GroupQueue): void {
  // Write immediately on start
  writeSnapshot(queue);

  setInterval(() => {
    writeSnapshot(queue);
  }, WRITE_INTERVAL);

  logger.info({ path: STATUS_FILE, intervalMs: WRITE_INTERVAL }, 'Office status writer started');
}
