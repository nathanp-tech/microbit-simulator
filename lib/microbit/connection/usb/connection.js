/**
 * (c) 2021, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */
import { withTimeout } from "../async-util.js";
import { throwIfUnavailable } from "../availability.js";
import { ConnectionStatus, DeviceError, FlashDataError, ProgressStage, assertConnected, } from "../device.js";
import { TypedEventTarget } from "../events.js";
import { ConsoleLogging } from "../logging.js";
import { PromiseQueue } from "./promise-queue.js";
import { USBDeviceWrapper, } from "./device-wrapper.js";
import { PartialFlashing } from "./partial-flashing.js";
import { saturateCdcPipeline } from "./cdc-saturation.js";
const defaultFilters = [{ vendorId: 0x0d28, productId: 0x0204 }];
export const DeviceSelectionMode = {
    /**
     * Attempts to connect to known device, otherwise asks which device to
     * connect to.
     */
    AlwaysAsk: "AlwaysAsk",
    /**
     * Attempts to connect to known device, otherwise attempts to connect to any
     * allowed devices. If that fails, asks which device to connect to.
     */
    UseAnyAllowed: "UseAnyAllowed",
};
/**
 * A WebUSB connection factory.
 */
export const createUSBConnection = (options) => new MicrobitUSBConnectionImpl(options);
/**
 * A WebUSB connection to a micro:bit device.
 */
class MicrobitUSBConnectionImpl extends TypedEventTarget {
    constructor(options = {}) {
        super();
        Object.defineProperty(this, "type", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: "usb"
        });
        Object.defineProperty(this, "status", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: ConnectionStatus.NoAuthorizedDevice
        });
        Object.defineProperty(this, "exclusionFilters", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        /**
         * The raw USB device we last connected to.
         * Cleared if it is disconnected.
         */
        Object.defineProperty(this, "usbDevice", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        /**
         * Device-specific state. Created on connect, cleared on disconnect.
         */
        Object.defineProperty(this, "device", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        /**
         * Cached device properties that persist across reconnections until clearDevice.
         */
        Object.defineProperty(this, "cachedConnectionInfo", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "loggedBoardSerialInfo", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        /**
         * Whether CDC pipeline saturation has been performed for this physical
         * USB connection. Once saturated, the buffers stay full until the device
         * is physically disconnected.
         */
        Object.defineProperty(this, "cdcSaturated", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        /**
         * Whether the serial read loop is running.
         *
         * This is false even if we have serial listeners when we're disconnected or flashing.
         * The serial reads interfere with the flash process.
         */
        Object.defineProperty(this, "serialState", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "serialStateChangeQueue", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new PromiseQueue()
        });
        Object.defineProperty(this, "serialListener", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (data) => {
                this.dispatchEvent("serialdata", { data });
            }
        });
        Object.defineProperty(this, "flashing", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "pauseAfterFlash", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "visibilityChangeListener", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: () => {
                if (document.visibilityState === "visible") {
                    // We may not have actually paused when we became hidden due to an in-progress flash.
                    this.pauseAfterFlash = false;
                    if (this.status === ConnectionStatus.Paused) {
                        if (!this.flashing) {
                            this.log("Reconnecting visible tab");
                            // withEnrichedErrors already disconnects and logs on failure.
                            this.connect().catch(() => { });
                        }
                    }
                }
                else {
                    if (!this.unloading && this.status === ConnectionStatus.Connected) {
                        if (!this.flashing) {
                            this.log("Pausing connection for hidden tab");
                            // Transition to PAUSED not DISCONNECTED
                            void this.disconnect(false, ConnectionStatus.Paused);
                        }
                        else {
                            this.log("Scheduling disconnect of hidden tab for after flash");
                            this.pauseAfterFlash = true;
                        }
                    }
                }
            }
        });
        Object.defineProperty(this, "unloading", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "beforeUnloadListener", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: () => {
                // If serial is in progress when the page unloads with V1 DAPLink 0254 or V2 0255
                // then it'll fail to reconnect with mismatched command/response errors.
                // Try hard to disconnect as a workaround.
                // https://github.com/microbit-foundation/python-editor-v3/issues/89
                this.unloading = true;
                void this.stopSerialInternal();
                // The user might stay on the page if they have unsaved changes and there's another beforeunload listener.
                window.addEventListener("focus", () => {
                    const assumePageIsStayingOpenDelay = 1000;
                    setTimeout(() => {
                        if (this.status === ConnectionStatus.Connected) {
                            this.unloading = false;
                            if (this.hasSerialEventListeners()) {
                                void this.startSerialInternal();
                            }
                        }
                    }, assumePageIsStayingOpenDelay);
                }, { once: true });
            }
        });
        Object.defineProperty(this, "logging", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "deviceSelectionMode", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "pauseOnHidden", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "handleDisconnect", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: (event) => {
                if (event.device === this.usbDevice) {
                    this.cdcSaturated = false;
                    this.device = undefined;
                    this.usbDevice = undefined;
                    this.setStatus(ConnectionStatus.NoAuthorizedDevice);
                }
            }
        });
        this.logging = options.logging || new ConsoleLogging();
        this.deviceSelectionMode =
            options.deviceSelectionMode || DeviceSelectionMode.AlwaysAsk;
        this.pauseOnHidden = options.pauseOnHidden ?? true;
    }
    log(v) {
        this.logging.log(v);
    }
    initialize() {
        if (navigator.usb) {
            navigator.usb.addEventListener("disconnect", this.handleDisconnect);
        }
        if (typeof window !== "undefined") {
            window.addEventListener("beforeunload", this.beforeUnloadListener);
            if (this.pauseOnHidden && window.document) {
                window.document.addEventListener("visibilitychange", this.visibilityChangeListener);
            }
        }
        return Promise.resolve();
    }
    checkAvailability() {
        if (!navigator.usb) {
            return Promise.resolve("unsupported");
        }
        return Promise.resolve("available");
    }
    dispose() {
        if (navigator.usb) {
            navigator.usb.removeEventListener("disconnect", this.handleDisconnect);
        }
        if (typeof window !== "undefined") {
            window.removeEventListener("beforeunload", this.beforeUnloadListener);
            if (this.pauseOnHidden && window.document) {
                window.document.removeEventListener("visibilitychange", this.visibilityChangeListener);
            }
        }
    }
    setRequestDeviceExclusionFilters(exclusionFilters) {
        this.exclusionFilters = exclusionFilters;
    }
    async connect(options) {
        await this.withEnrichedErrors(async () => {
            await this.connectInternal(options?.progress);
            return this.status;
        });
    }
    getDeviceId() {
        assertConnected(this.cachedConnectionInfo);
        return this.cachedConnectionInfo.deviceId;
    }
    getDevice() {
        return this.usbDevice;
    }
    getBoardVersion() {
        assertConnected(this.cachedConnectionInfo);
        return this.cachedConnectionInfo.boardSerialInfo.id.toBoardVersion();
    }
    async flash(dataSource, options) {
        this.flashing = true;
        try {
            const startTime = new Date().getTime();
            await this.withEnrichedErrors(() => this.flashInternal(dataSource, options));
            this.dispatchEvent("flash");
            const flashTime = new Date().getTime() - startTime;
            this.logging.event({
                type: "WebUSB-time",
                detail: {
                    flashTime,
                },
            });
            this.logging.log("Flash complete");
        }
        finally {
            this.flashing = false;
        }
    }
    async flashInternal(dataSource, options = {}) {
        const partial = options.partial ?? true;
        const progress = rateLimitProgress(options.minimumProgressIncrement ?? 0.0025, options.progress || (() => { }));
        this.log("Stopping serial before flash");
        await this.stopSerialInternal();
        this.log("Reconnecting before flash");
        await this.connectInternal(progress);
        if (!this.device) {
            throw new DeviceError({
                code: "connection-error",
                message: "Must be connected now",
            });
        }
        // Saturate DAPLink's CDC buffers on the first flash after physical
        // connection, but only if someone is listening for serial data.
        // Once saturated, the buffers stay full until physical disconnect.
        if (!this.cdcSaturated && this.hasSerialEventListeners()) {
            // Ensure DAPLink's UART is at 115200 before saturation.
            // V1 DAPLink defaults to 9600 on fresh connection.
            // setBaudrate may reset the target, so reinit SWD afterwards.
            const currentBaud = await this.device.serial.getBaudrate();
            if (currentBaud !== 115200) {
                this.log(`Setting DAPLink baud from ${currentBaud} to 115200`);
                await this.device.serial.setBaudrate(115200);
                await this.device.adi.reinit();
            }
            this.log("Halting target");
            await this.device.cortexM.halt();
            const boardVersion = this.cachedConnectionInfo.boardSerialInfo.id.toBoardVersion();
            await saturateCdcPipeline(this.device, boardVersion, this.logging);
            this.cdcSaturated = true;
            await this.device.serial.drain();
        }
        // Halt unconditionally — flash needs the target stopped.
        if (!(await this.device.cortexM.isHalted())) {
            this.log("Halting target");
            await this.device.cortexM.halt();
        }
        const { boardSerialInfo, pageSize, numPages } = this.cachedConnectionInfo;
        const boardVersion = boardSerialInfo.id.toBoardVersion();
        const data = await dataSource(boardVersion);
        const flashing = new PartialFlashing(this.device, this.logging, boardVersion, pageSize, numPages);
        let wasPartial = false;
        try {
            if (partial) {
                wasPartial = await flashing.flashAsync(data, progress);
            }
            else {
                await flashing.fullFlashAsync(data, progress);
            }
        }
        finally {
            progress(wasPartial ? ProgressStage.PartialFlashing : ProgressStage.FullFlashing, undefined);
            if (this.pauseAfterFlash) {
                this.log("Disconnecting after flash due to tab visibility");
                this.pauseAfterFlash = false;
                await this.disconnect(false, ConnectionStatus.Paused);
            }
            else {
                await this.device.adi.reinit();
                // Start serial before resetting so we capture startup output.
                // For full flash FLASH_CLOSE already reset the target, so its
                // early output accumulates in DAPLink's 512-byte serial ring
                // buffer until the first read here.
                if (this.hasSerialEventListeners()) {
                    this.log("Reinstating serial after flash");
                    await this.startSerialInternal();
                }
                if (wasPartial) {
                    // Partial flash writes pages via SWD without resetting.
                    // Full flash already resets via FLASH_CLOSE.
                    this.log("Resetting micro:bit to run new program");
                    try {
                        await this.device.cortexM.reset();
                    }
                    catch {
                        // Allow errors on resetting, user can always manually reset if necessary.
                    }
                }
            }
        }
    }
    async startSerialInternal() {
        return this.serialStateChangeQueue.add(async () => {
            if (!this.device || this.serialState) {
                return;
            }
            this.log("Starting serial");
            this.serialState = true;
            const serial = this.device.serial;
            const currentBaud = await serial.getBaudrate();
            if (currentBaud !== 115200) {
                // Changing the baud rate causes a micro:bit reset, so only do it if necessary
                await serial.setBaudrate(115200);
            }
            serial
                .startPolling(this.serialListener, 1)
                .then(() => {
                this.log("Finished listening for serial data");
            })
                .catch((e) => {
                this.dispatchEvent("backgrounderror", {
                    error: enrichedError(e),
                    event: "serialdata",
                });
            })
                .finally(() => {
                this.serialState = false;
                // Don't reset when paused — the same program is still running and
                // serial will resume when the tab becomes visible again.
                if (this.status !== ConnectionStatus.Paused) {
                    this.dispatchEvent("serialreset");
                }
            });
        });
    }
    async stopSerialInternal() {
        return this.serialStateChangeQueue.add(() => {
            if (this.device && this.serialState) {
                this.device.serial.stopPolling();
            }
            return Promise.resolve();
        });
    }
    async disconnect(quiet, finalStatus = ConnectionStatus.Disconnected) {
        try {
            if (this.device) {
                await this.stopSerialInternal();
                await this.device.disconnect();
            }
        }
        catch (e) {
            if (!quiet) {
                this.log("Error during disconnection:\r\n" + String(e));
                this.logging.event({
                    type: "WebUSB-error",
                    message: "error-disconnecting",
                });
            }
        }
        finally {
            this.device = undefined;
            this.setStatus(finalStatus);
            if (!quiet) {
                this.logging.log("Disconnection complete");
                this.logging.event({
                    type: "WebUSB-info",
                    message: "disconnected",
                });
            }
        }
    }
    setStatus(newStatus) {
        const previousStatus = this.status;
        this.status = newStatus;
        this.log("USB connection status " + newStatus);
        this.dispatchEvent("status", {
            status: newStatus,
            previousStatus,
        });
    }
    logBoardInfo(info) {
        this.logging.event({
            type: "WebUSB-info",
            message: "connected",
        });
        if (!this.loggedBoardSerialInfo || !this.loggedBoardSerialInfo.eq(info)) {
            this.loggedBoardSerialInfo = info;
            this.logging.event({
                type: "WebUSB-info",
                message: "board-id/" + info.id.toString(),
            });
            this.logging.event({
                type: "WebUSB-info",
                message: "board-family-hic/" + info.familyId + info.hic,
            });
        }
    }
    async withEnrichedErrors(f) {
        try {
            return await f();
        }
        catch (e) {
            if (e instanceof FlashDataError) {
                throw e;
            }
            if (e instanceof DeviceError) {
                throw e;
            }
            // Log error to console for feedback
            this.log("An error occurred whilst attempting to use WebUSB.");
            this.log("Details of the error can be found below, and may be useful when trying to replicate and debug the error.");
            this.log(e);
            // Disconnect from the microbit.
            // Any new connection reallocates all the internals.
            // Use the top-level API so any listeners reflect that we're disconnected.
            await this.disconnect(true);
            const enriched = enrichedError(e);
            // Sanitise error message, replace all special chars with '-', if last char is '-' remove it
            const errorMessage = e instanceof Error
                ? e.message.replace(/\W+/g, "-").replace(/\W$/, "").toLowerCase()
                : "";
            this.logging.event({
                type: "WebUSB-error",
                message: String(e.code) + "/" + errorMessage,
            });
            throw enriched;
        }
    }
    serialWrite(data) {
        assertConnected(this.device);
        const device = this.device;
        return this.withEnrichedErrors(async () => {
            // WebUSB packets are 64 bytes with a two byte header.
            // https://github.com/microbit-foundation/python-editor-v3/issues/215
            const maxSerialWrite = 62;
            let start = 0;
            while (start < data.length) {
                const end = Math.min(start + maxSerialWrite, data.length);
                const chunkData = data.slice(start, end);
                await device.serial.write(chunkData);
                start = end;
            }
        });
    }
    async softwareReset() {
        assertConnected(this.device);
        const device = this.device;
        return this.serialStateChangeQueue.add(async () => await device.cortexM.softwareReset());
    }
    async clearDevice() {
        await this.disconnect();
        this.usbDevice = undefined;
        this.cachedConnectionInfo = undefined;
        this.cdcSaturated = false;
        this.setStatus(ConnectionStatus.NoAuthorizedDevice);
    }
    async connectInternal(progress) {
        const reportProgress = progress ?? (() => { });
        reportProgress(ProgressStage.Initializing);
        throwIfUnavailable(await this.checkAvailability());
        if (!this.device && this.usbDevice) {
            reportProgress(ProgressStage.Connecting);
            this.device = new USBDeviceWrapper(this.usbDevice, this.logging);
            this.cachedConnectionInfo = await withTimeout(this.device.reconnect(), 10_000);
        }
        else if (!this.device) {
            await this.connectWithOtherDevice(reportProgress);
        }
        else {
            reportProgress(ProgressStage.Connecting);
            this.cachedConnectionInfo = await withTimeout(this.device.reconnect(), 10_000);
        }
        this.logBoardInfo(this.cachedConnectionInfo.boardSerialInfo);
        if (this.hasSerialEventListeners() && !this.flashing) {
            void this.startSerialInternal();
        }
        this.setStatus(ConnectionStatus.Connected);
    }
    async connectWithOtherDevice(progress) {
        if (this.deviceSelectionMode === DeviceSelectionMode.UseAnyAllowed) {
            await this.attemptConnectAllowedDevices();
        }
        if (!this.device) {
            progress(ProgressStage.FindingDevice);
            this.usbDevice = await this.chooseDevice();
            progress(ProgressStage.Connecting);
            this.device = new USBDeviceWrapper(this.usbDevice, this.logging);
            this.cachedConnectionInfo = await withTimeout(this.device.reconnect(), 10_000);
        }
    }
    // Based on: https://github.com/microsoft/pxt/blob/ab97a2422879824c730f009b15d4bf446b0e8547/pxtlib/webusb.ts#L361
    async attemptConnectAllowedDevices() {
        const pairedDevices = await this.getFilteredAllowedDevices();
        for (const usbDevice of pairedDevices) {
            const device = await this.attemptDeviceConnection(usbDevice);
            if (device) {
                this.usbDevice = usbDevice;
                this.device = device;
                return;
            }
        }
    }
    // Based on: https://github.com/microsoft/pxt/blob/ab97a2422879824c730f009b15d4bf446b0e8547/pxtlib/webusb.ts#L530
    async getFilteredAllowedDevices() {
        this.log("Retrieving previously paired USB devices");
        const devices = await navigator.usb?.getDevices();
        if (devices === undefined) {
            return [];
        }
        const filteredDevices = devices.filter((device) => applyDeviceFilters(device, defaultFilters, this.exclusionFilters ?? []));
        return filteredDevices;
    }
    async attemptDeviceConnection(usbDevice) {
        this.log(`Attempting connection to: ${usbDevice.manufacturerName} ${usbDevice.productName}`);
        this.log(`Serial number: ${usbDevice.serialNumber}`);
        const device = new USBDeviceWrapper(usbDevice, this.logging);
        this.cachedConnectionInfo = await withTimeout(device.reconnect(), 10_000);
        return device;
    }
    async chooseDevice() {
        this.dispatchEvent("beforerequestdevice");
        try {
            this.usbDevice = await navigator.usb.requestDevice({
                exclusionFilters: this.exclusionFilters,
                filters: defaultFilters,
            });
        }
        finally {
            this.dispatchEvent("afterrequestdevice");
        }
        return this.usbDevice;
    }
    eventActivated(type) {
        switch (type) {
            case "serialdata": {
                // Prevent starting serial when flashing. We'll reinstate later.
                if (!this.flashing) {
                    void this.startSerialInternal();
                }
                break;
            }
        }
    }
    eventDeactivated(type) {
        switch (type) {
            case "serialdata": {
                void this.stopSerialInternal();
                break;
            }
        }
    }
    hasSerialEventListeners() {
        return this.getActiveEvents().includes("serialdata");
    }
}
/**
 * Applying WebUSB device filter. Exported for testing.
 * Based on: https://wicg.github.io/webusb/#enumeration
 */
export const applyDeviceFilters = (device, filters, exclusionFilters) => {
    return ((filters.length === 0 ||
        filters.some((filter) => matchFilter(device, filter))) &&
        (exclusionFilters.length === 0 ||
            exclusionFilters.every((filter) => !matchFilter(device, filter))));
};
const matchFilter = (device, filter) => {
    if (filter.vendorId && device.vendorId !== filter.vendorId) {
        return false;
    }
    if (filter.productId && device.productId !== filter.productId) {
        return false;
    }
    if (filter.serialNumber && device.serialNumber !== filter.serialNumber) {
        return false;
    }
    return hasMatchingInterface(device, filter);
};
const hasMatchingInterface = (device, filter) => {
    if (filter.classCode === undefined &&
        filter.subclassCode === undefined &&
        filter.protocolCode === undefined) {
        return true;
    }
    if (!device.configuration?.interfaces) {
        return false;
    }
    return device.configuration.interfaces.some((configInterface) => {
        return configInterface.alternates?.some((alternate) => {
            const classCodeNotMatch = filter.classCode !== undefined &&
                alternate.interfaceClass !== filter.classCode;
            const subClassCodeNotMatch = filter.subclassCode !== undefined &&
                alternate.interfaceSubclass !== filter.subclassCode;
            const protocolCodeNotMatch = filter.protocolCode !== undefined &&
                alternate.interfaceProtocol !== filter.protocolCode;
            return (!classCodeNotMatch || !subClassCodeNotMatch || !protocolCodeNotMatch);
        });
    });
};
const enrichedError = (err) => {
    if (err instanceof DeviceError) {
        return err;
    }
    if (err instanceof Error) {
        // Match Chromium WebUSB DOMException messages for user-friendly error codes.
        // These are hardcoded English strings in Chromium (not localized).
        // https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/modules/webusb/usb.cc
        if (/No device selected/.test(err.message)) {
            return new DeviceError({
                code: "no-device-selected",
                message: err.message,
                cause: err,
            });
        }
        // https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/modules/webusb/usb_device.cc
        if (/Unable to claim interface/.test(err.message)) {
            return new DeviceError({
                code: "device-in-use",
                message: err.message,
                cause: err,
            });
        }
        if (/The device was disconnected/.test(err.message)) {
            return new DeviceError({
                code: "device-disconnected",
                message: err.message,
                cause: err,
            });
        }
    }
    return new DeviceError({
        code: "connection-error",
        message: err instanceof Error ? err.message : String(err),
        cause: err,
    });
};
const rateLimitProgress = (minimumProgressIncrement, callback) => {
    let lastCallValue = -1;
    let lastStage;
    return (stage, value) => {
        if (lastStage !== stage ||
            value === undefined ||
            value === 0 ||
            value === 1 ||
            value >= lastCallValue + minimumProgressIncrement) {
            lastStage = stage;
            lastCallValue = value ?? -1;
            callback(stage, value);
        }
    };
};
//# sourceMappingURL=connection.js.map