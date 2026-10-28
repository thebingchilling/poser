import { CrashGuard, MemoryManager, QUALITY_SETTINGS } from '@poser/platform';

/** App-wide singletons for platform services. */
export const crashGuard = new CrashGuard(localStorage);
export const memoryManager = new MemoryManager(QUALITY_SETTINGS.high.gpuMemoryBudgetMB * 1024 * 1024);
