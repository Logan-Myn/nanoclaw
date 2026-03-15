import fs from 'fs';
import path from 'path';

import { Channel } from '../types.js';
import { ChannelOpts, registerChannel } from './registry.js';
import { DATA_DIR } from '../config.js';
import { logger } from '../logger.js';

class OfficeChannel implements Channel {
  name = 'office';

  ownsJid(jid: string): boolean {
    return jid.startsWith('office:');
  }

  isConnected(): boolean {
    return true; // filesystem-based, always available
  }

  async connect(): Promise<void> {
    // Ensure responses directory exists
    const responsesDir = path.join(DATA_DIR, 'ipc', 'office_main', 'responses');
    fs.mkdirSync(responsesDir, { recursive: true });
    logger.info('Office channel connected (filesystem-based)');
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    // Map JID to folder: "office:main" -> "office_main"
    const folder = jid.replace(':', '_');
    const responsesDir = path.join(DATA_DIR, 'ipc', folder, 'responses');
    fs.mkdirSync(responsesDir, { recursive: true });

    const timestamp = Date.now();
    const rand = Math.random().toString(36).slice(2, 6);
    const filename = `${timestamp}-${rand}.json`;
    const filepath = path.join(responsesDir, filename);
    const tmpPath = `${filepath}.tmp`;

    const payload = {
      from: 'bob',
      text,
      timestamp: new Date().toISOString(),
    };

    fs.writeFileSync(tmpPath, JSON.stringify(payload));
    fs.renameSync(tmpPath, filepath);

    logger.debug({ jid, file: filename }, 'Office response written');
  }

  async disconnect(): Promise<void> {
    // Nothing to disconnect
  }
}

registerChannel('office', (_opts: ChannelOpts) => new OfficeChannel());
