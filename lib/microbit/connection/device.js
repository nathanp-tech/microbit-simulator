/**
 * (c) 2021, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */
/**
 * Stages reported by the progress callback during connection and flashing.
 */
export const ProgressStage = {
    /** Checking permissions and availability before connecting. */
    Initializing: "Initializing",
    /** Finding device. */
    FindingDevice: "FindingDevice",
    /** Checking that a bond is established. Only applicable on Native platforms. */
    CheckingBond: "CheckingBond",
    /** Resetting device in preparation for flashing. Only applicable on Native platforms. */
    ResettingDevice: "ResettingDevice",
    /** Connecting for flashing. */
    Connecting: "Connecting",
    /** Partial flashing. */
    PartialFlashing: "PartialFlashing",
    /** Full flashing. */
    FullFlashing: "FullFlashing",
};
/**
 * Error type used for all interactions with this module.
 *
 * The code indicates the error type and may be suitable for providing
 * translated error messages.
 *
 * The message is the underlying message text and will usually be in
 * English.
 */
export class DeviceError extends Error {
    constructor({ code, message, cause, }) {
        super(message, { cause });
        Object.defineProperty(this, "code", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.code = code;
    }
}
/**
 * Asserts that a connection is active, throwing a {@link DeviceError}
 * with code `"not-connected"` if it is not.
 */
export function assertConnected(connection) {
    if (!connection) {
        throw new DeviceError({ code: "not-connected", message: "Not connected" });
    }
}
/**
 * Tracks connection status.
 */
export const ConnectionStatus = {
    /**
     * No device available.
     *
     * This is the initial status and will be the case even when a device is
     * physically connected but has not been connected via the browser security UI.
     *
     * Use checkAvailability() to determine whether the connection type is
     * supported before attempting to connect.
     */
    NoAuthorizedDevice: "NoAuthorizedDevice",
    /** Authorized device available but we haven't connected to it. */
    Disconnected: "Disconnected",
    /** Connected. */
    Connected: "Connected",
    /** Connecting. */
    Connecting: "Connecting",
    /**
     * Paused due to tab visibility. The connection was temporarily suspended
     * because the browser tab became hidden. Reconnection will be attempted
     * automatically when the tab becomes visible again.
     */
    Paused: "Paused",
};
export class FlashDataError extends Error {
}
//# sourceMappingURL=device.js.map