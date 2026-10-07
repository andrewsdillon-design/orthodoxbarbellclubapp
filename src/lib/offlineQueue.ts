// Workouts logged without signal wait here and go up when the phone is back online. Lifters train in
// garages; a save must never be lost because the bars dropped to zero.
import { ApiError } from '../api/client';
import type { LogBody, LogResult } from '../api/types';

export interface QueuedLog {
  id: string;
  week: number;
  day_index: number;
  day: string;
  body: LogBody;
  queued_at: string;
  /** Set when the server refused it (a validation problem), so the lifter can fix or discard it. */
  error?: string;
}

export interface QueueStore {
  load(): Promise<QueuedLog[] | null>;
  save(items: QueuedLog[]): Promise<void>;
}

export type Sender = (item: QueuedLog) => Promise<LogResult>;

export interface FlushResult {
  sent: { item: QueuedLog; result: LogResult }[];
  failed: QueuedLog[];
  stoppedOffline: boolean;
}

export class OfflineQueue {
  private items: QueuedLog[] = [];
  private listeners = new Set<() => void>();
  private loaded: Promise<void> | null = null;
  private flushing: Promise<FlushResult> | null = null;

  constructor(
    private readonly send: Sender,
    private readonly store: QueueStore,
  ) {}

  load(): Promise<void> {
    this.loaded ??= this.store.load().then((items) => {
      this.items = items ?? [];
      this.emit();
    });
    return this.loaded;
  }

  snapshot = (): QueuedLog[] => this.items;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private emit() {
    this.items = [...this.items];
    this.listeners.forEach((fn) => fn());
  }

  private async persist() {
    this.emit();
    await this.store.save(this.items);
  }

  /** Queue a session's log. A newer save of the same session replaces the older one, as on the server. */
  async add(entry: Omit<QueuedLog, 'id' | 'queued_at'>): Promise<QueuedLog> {
    await this.load();
    const item: QueuedLog = {
      ...entry,
      id: `${entry.week}/${entry.day_index}/${Date.now()}`,
      queued_at: new Date().toISOString(),
    };
    this.items = this.items.filter((x) => !(x.week === entry.week && x.day_index === entry.day_index));
    this.items.push(item);
    await this.persist();
    return item;
  }

  async remove(id: string): Promise<void> {
    await this.load();
    this.items = this.items.filter((x) => x.id !== id);
    await this.persist();
  }

  pendingFor(week: number, day: number): QueuedLog | undefined {
    return this.items.find((x) => x.week === week && x.day_index === day);
  }

  /** Send everything waiting, oldest first. Stops at the first sign of no signal or a signed-out token. */
  flush(): Promise<FlushResult> {
    this.flushing ??= this.doFlush().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  private async doFlush(): Promise<FlushResult> {
    await this.load();
    const out: FlushResult = { sent: [], failed: [], stoppedOffline: false };
    for (const item of [...this.items]) {
      if (item.error) {
        out.failed.push(item);
        continue;
      }
      try {
        const result = await this.send(item);
        this.items = this.items.filter((x) => x.id !== item.id);
        out.sent.push({ item, result });
        await this.persist();
      } catch (e) {
        if (e instanceof ApiError && (e.offline || e.unauthorized || e.status >= 500)) {
          out.stoppedOffline = e.offline;
          break;
        }
        const failed = { ...item, error: e instanceof Error ? e.message : String(e) };
        this.items = this.items.map((x) => (x.id === item.id ? failed : x));
        out.failed.push(failed);
        await this.persist();
      }
    }
    return out;
  }
}
