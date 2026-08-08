import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  addBackupEntry,
  clearBackupEntries,
  getBackupEntries,
  removeBackupEntry,
} from './backup-mirror';

beforeEach(() => {
  fakeBrowser.reset();
});

describe('backup mirror', () => {
  it('starts empty', async () => {
    expect(await getBackupEntries()).toEqual([]);
  });

  it('appends an entry on add', async () => {
    await addBackupEntry('abc123', 'A video');
    const entries = await getBackupEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ videoId: 'abc123', title: 'A video' });
    expect(entries[0]?.queuedAt).toBeTypeOf('number');
  });

  it('removes an entry by videoId', async () => {
    await addBackupEntry('abc123', 'A video');
    await addBackupEntry('def456', 'Another video');
    await removeBackupEntry('abc123');
    const entries = await getBackupEntries();
    expect(entries.map((e) => e.videoId)).toEqual(['def456']);
  });

  it('removing an unknown videoId is a no-op', async () => {
    await addBackupEntry('abc123', 'A video');
    await removeBackupEntry('nope');
    expect(await getBackupEntries()).toHaveLength(1);
  });

  it('re-adding the same videoId dedupes and moves it to the end', async () => {
    await addBackupEntry('abc123', 'A video');
    await addBackupEntry('def456', 'Another video');
    await addBackupEntry('abc123', 'A video (retitled)');
    const entries = await getBackupEntries();
    expect(entries.map((e) => e.videoId)).toEqual(['def456', 'abc123']);
    expect(entries[1]?.title).toBe('A video (retitled)');
  });

  it('clears all entries', async () => {
    await addBackupEntry('abc123', 'A video');
    await clearBackupEntries();
    expect(await getBackupEntries()).toEqual([]);
  });

  it('caps at 100 entries, dropping the oldest', async () => {
    for (let i = 0; i < 105; i++) {
      await addBackupEntry(`v${i}`, `Video ${i}`);
    }
    const entries = await getBackupEntries();
    expect(entries).toHaveLength(100);
    expect(entries[0]?.videoId).toBe('v5');
    expect(entries[99]?.videoId).toBe('v104');
  });
});
