/**
 * (c) 2021, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */
import { BoardId } from "../board-id.js";
export class BoardSerialInfo {
    constructor(id, familyId, hic) {
        Object.defineProperty(this, "id", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: id
        });
        Object.defineProperty(this, "familyId", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: familyId
        });
        Object.defineProperty(this, "hic", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: hic
        });
    }
    static fromSerial(serial, log) {
        if (serial.length !== 48) {
            log(`Serial number unexpected length: ${serial.length}`);
        }
        const id = serial.substring(0, 4);
        const familyId = serial.substring(4, 8);
        const hic = serial.slice(-8);
        return new BoardSerialInfo(BoardId.parse(id), familyId, hic);
    }
    static parse(device, log) {
        const serial = device.serialNumber;
        if (!serial) {
            throw new Error("Could not detected ID from connected board.");
        }
        return BoardSerialInfo.fromSerial(serial, log);
    }
    eq(other) {
        return (other.id === this.id &&
            other.familyId === this.familyId &&
            other.hic === this.hic);
    }
}
//# sourceMappingURL=board-serial-info.js.map