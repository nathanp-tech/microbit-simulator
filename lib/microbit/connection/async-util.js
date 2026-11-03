/**
 * (c) 2021, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */
import { DeviceError } from "./device.js";
export class TimeoutError extends DeviceError {
    constructor(message = "Timeout") {
        super({ code: "timeout", message });
    }
}
export class DisconnectError extends Error {
    constructor(message = "Disconnect") {
        super(message);
    }
}
/**
 * Utility to time out an action after a delay.
 *
 * The action cannot be cancelled; it may still proceed after the timeout.
 */
export async function withTimeout(actionPromise, timeout) {
    return Promise.race([
        actionPromise,
        timeoutErrorAfter(timeout),
    ]);
}
export async function delay(millis) {
    return new Promise((resolve) => setTimeout(resolve, millis));
}
export async function timeoutErrorAfter(millis, message = "Timeout") {
    await delay(millis);
    throw new TimeoutError(message);
}
export function disconnectErrorCallback(message = "Disconnect") {
    let callback;
    const promise = new Promise((_, reject) => {
        callback = () => reject(new DisconnectError(message));
    });
    return { promise, callback: callback };
}
//# sourceMappingURL=async-util.js.map