export class PromiseQueue {
    constructor(options = {}) {
        Object.defineProperty(this, "busy", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "entries", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "abortCheck", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.abortCheck = options.abortCheck ?? (() => undefined);
    }
    /**
     * Queue an action.
     *
     * @param action Async action to perform.
     * @returns A promise that resolves when all prior added actions and this action have been performed.
     */
    add(action) {
        return new Promise((resolve, reject) => {
            const entry = {
                resolve,
                reject,
                action,
            };
            this.entries.push(entry);
            if (!this.busy) {
                void this.processQueue();
            }
        });
    }
    async processQueue() {
        const rejection = this.abortCheck();
        if (rejection) {
            this.clear(rejection);
            return;
        }
        const entry = this.entries.shift();
        if (!entry) {
            return;
        }
        this.busy = true;
        try {
            entry.resolve(await entry.action());
        }
        catch (e) {
            entry.reject(e);
        }
        this.busy = false;
        return this.processQueue();
    }
    /**
     * Skips any queued actions that aren't in progress and rejects their
     * promises with errors created with the supplied function.
     */
    clear(rejection) {
        const entries = this.entries;
        this.entries = [];
        entries.forEach((e) => {
            e.reject(rejection());
        });
    }
}
//# sourceMappingURL=promise-queue.js.map