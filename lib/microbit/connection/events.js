export class TypedEventTarget {
    constructor() {
        Object.defineProperty(this, "listeners", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
    }
    addEventListener(type, listener) {
        let set = this.listeners.get(type);
        const wasEmpty = !set || set.size === 0;
        if (!set) {
            set = new Set();
            this.listeners.set(type, set);
        }
        if (!set.has(listener)) {
            set.add(listener);
            if (wasEmpty)
                this.eventActivated(type);
        }
    }
    removeEventListener(type, listener) {
        const set = this.listeners.get(type);
        if (set?.delete(listener) && set.size === 0) {
            this.listeners.delete(type);
            this.eventDeactivated(type);
        }
    }
    dispatchEvent(type, ...[data]) {
        const set = this.listeners.get(type);
        if (set) {
            for (const listener of set) {
                listener(data);
            }
        }
    }
    eventActivated(_type) { }
    eventDeactivated(_type) { }
    getActiveEvents() {
        return [...this.listeners.keys()];
    }
}
//# sourceMappingURL=events.js.map