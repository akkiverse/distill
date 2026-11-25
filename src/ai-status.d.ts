export function watchAiStatus(opts?: { mount?: HTMLElement | null; text?: string; url?: string; everyMs?: number; onChange?: (online: boolean) => void }): () => void;
export function isAiOffline(response: Response, opts?: object): Promise<boolean>;
