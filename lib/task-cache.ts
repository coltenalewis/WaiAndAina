type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const LIST_TTL_MS = 60_000;
const DETAIL_TTL_MS = 30_000;

let taskListEntry: CacheEntry<any> | null = null;
const taskDetailCache = new Map<string, CacheEntry<any>>();

function now() {
  return Date.now();
}

function normalizeKey(name: string) {
  return name.trim().toLowerCase();
}

export function getCachedTaskList() {
  if (!taskListEntry) return null;
  if (taskListEntry.expiresAt <= now()) {
    taskListEntry = null;
    return null;
  }
  return taskListEntry.value;
}

export function setCachedTaskList(value: any) {
  taskListEntry = {
    value,
    expiresAt: now() + LIST_TTL_MS,
  };
}

export function clearCachedTaskList() {
  taskListEntry = null;
}

export function getCachedTaskDetail(name: string) {
  const entry = taskDetailCache.get(normalizeKey(name));
  if (!entry) return null;
  if (entry.expiresAt <= now()) {
    taskDetailCache.delete(normalizeKey(name));
    return null;
  }
  return entry.value;
}

export function setCachedTaskDetail(name: string, value: any) {
  taskDetailCache.set(normalizeKey(name), {
    value,
    expiresAt: now() + DETAIL_TTL_MS,
  });
}

export function clearCachedTaskDetail(name: string) {
  taskDetailCache.delete(normalizeKey(name));
}

export function clearAllTaskDetailCache() {
  taskDetailCache.clear();
}
