/**
 * Interprets the data stored in the UICR memory space.
 *
 * For more info:
 * https://microbit-micropython.readthedocs.io/en/latest/devguide/hexformat.html
 *
 * (c) 2019 Micro:bit Educational Foundation and the microbit-fs contributors.
 * SPDX-License-Identifier: MIT
 */
import MemoryMap from 'nrf-intel-hex';
import * as hexMapUtil from './hex-map-utils.js';
const DEVICE_INFO = [
    {
        deviceVersion: 'V1',
        magicHeader: 0x17eeb07c,
        flashSize: 256 * 1024,
        fsEnd: 256 * 1024,
    },
    {
        deviceVersion: 'V2',
        magicHeader: 0x47eeb07c,
        flashSize: 512 * 1024,
        fsEnd: 0x73000,
    },
];
const UICR_START = 0x10001000;
const UICR_CUSTOMER_OFFSET = 0x80;
const UICR_CUSTOMER_UPY_OFFSET = 0x40;
const UICR_UPY_START = UICR_START + UICR_CUSTOMER_OFFSET + UICR_CUSTOMER_UPY_OFFSET;
const UPY_MAGIC_LEN = 4;
const UPY_END_MARKER_LEN = 4;
const UPY_PAGE_SIZE_LEN = 4;
const UPY_START_PAGE_LEN = 2;
const UPY_PAGES_USED_LEN = 2;
const UPY_DELIMITER_LEN = 4;
const UPY_VERSION_LEN = 4;
const UPY_REGIONS_TERMINATOR_LEN = 4;
/** UICR Customer area addresses for MicroPython specific data. */
var MicropythonUicrAddress;
(function (MicropythonUicrAddress) {
    MicropythonUicrAddress[MicropythonUicrAddress["MagicValue"] = UICR_UPY_START] = "MagicValue";
    MicropythonUicrAddress[MicropythonUicrAddress["EndMarker"] = MicropythonUicrAddress.MagicValue + UPY_MAGIC_LEN] = "EndMarker";
    MicropythonUicrAddress[MicropythonUicrAddress["PageSize"] = MicropythonUicrAddress.EndMarker + UPY_END_MARKER_LEN] = "PageSize";
    MicropythonUicrAddress[MicropythonUicrAddress["StartPage"] = MicropythonUicrAddress.PageSize + UPY_PAGE_SIZE_LEN] = "StartPage";
    MicropythonUicrAddress[MicropythonUicrAddress["PagesUsed"] = MicropythonUicrAddress.StartPage + UPY_START_PAGE_LEN] = "PagesUsed";
    MicropythonUicrAddress[MicropythonUicrAddress["Delimiter"] = MicropythonUicrAddress.PagesUsed + UPY_PAGES_USED_LEN] = "Delimiter";
    MicropythonUicrAddress[MicropythonUicrAddress["VersionLocation"] = MicropythonUicrAddress.Delimiter + UPY_DELIMITER_LEN] = "VersionLocation";
    MicropythonUicrAddress[MicropythonUicrAddress["RegionsTerminator"] = MicropythonUicrAddress.VersionLocation + UPY_REGIONS_TERMINATOR_LEN] = "RegionsTerminator";
    MicropythonUicrAddress[MicropythonUicrAddress["End"] = MicropythonUicrAddress.RegionsTerminator + UPY_VERSION_LEN] = "End";
})(MicropythonUicrAddress || (MicropythonUicrAddress = {}));
/**
 * Check if the magic number for the MicroPython UICR data is present in the
 * Intel Hex memory map.
 *
 * @param intelHexMap - Memory map of the Intel Hex data.
 * @return True if the magic number matches, false otherwise.
 */
function confirmMagicValue(intelHexMap) {
    const readMagicHeader = getMagicValue(intelHexMap);
    for (const device of DEVICE_INFO) {
        if (device.magicHeader === readMagicHeader) {
            return true;
        }
    }
    return false;
}
/**
 * Reads the UICR data that contains the Magic Value that indicates the
 * MicroPython presence in the hex data.
 *
 * @param intelHexMap - Memory map of the Intel Hex data.
 * @returns The Magic Value from UICR.
 */
function getMagicValue(intelHexMap) {
    return hexMapUtil.getUint32(intelHexMap, MicropythonUicrAddress.MagicValue);
}
/**
 * Reads the UICR data from an Intel Hex map and detects the device version.
 *
 * @param intelHexMap - Memory map of the Intel Hex data.
 * @returns The micro:bit board version.
 */
function getDeviceVersion(intelHexMap) {
    const readMagicHeader = getMagicValue(intelHexMap);
    for (const device of DEVICE_INFO) {
        if (device.magicHeader === readMagicHeader) {
            return device.deviceVersion;
        }
    }
    throw new Error('Cannot find device version, unknown UICR Magic value');
}
/**
 * Reads the UICR data from an Intel Hex map and retrieves the flash size.
 *
 * @param intelHexMap - Memory map of the Intel Hex data.
 * @returns The micro:bit flash size.
 */
function getFlashSize(intelHexMap) {
    const readMagicHeader = getMagicValue(intelHexMap);
    for (const device of DEVICE_INFO) {
        if (device.magicHeader === readMagicHeader) {
            return device.flashSize;
        }
    }
    throw new Error('Cannot find flash size, unknown UICR Magic value');
}
/**
 * Reads the UICR data from an Intel Hex map and retrieves the fs end address.
 *
 * @param intelHexMap - Memory map of the Intel Hex data.
 * @returns The micro:bit filesystem end address.
 */
function getFsEndAddress(intelHexMap) {
    const readMagicHeader = getMagicValue(intelHexMap);
    for (const device of DEVICE_INFO) {
        if (device.magicHeader === readMagicHeader) {
            return device.fsEnd;
        }
    }
    throw new Error('Cannot find fs end address, unknown UICR Magic value');
}
/**
 * Reads the UICR data that contains the flash page size.
 *
 * @param intelHexMap - Memory map of the Intel Hex data.
 * @returns The size of each flash page size.
 */
function getPageSize(intelHexMap) {
    const pageSize = hexMapUtil.getUint32(intelHexMap, MicropythonUicrAddress.PageSize);
    // Page size is stored as a log base 2
    return Math.pow(2, pageSize);
}
/**
 * Reads the UICR data that contains the start page of the MicroPython runtime.
 *
 * @param intelHexMap - Memory map of the Intel Hex data.
 * @returns The start page number of the MicroPython runtime.
 */
function getStartPage(intelHexMap) {
    return hexMapUtil.getUint16(intelHexMap, MicropythonUicrAddress.StartPage);
}
/**
 * Reads the UICR data that contains the number of flash pages used by the
 * MicroPython runtime.
 *
 * @param intelHexMap - Memory map of the Intel Hex data.
 * @returns The number of pages used by the MicroPython runtime.
 */
function getPagesUsed(intelHexMap) {
    return hexMapUtil.getUint16(intelHexMap, MicropythonUicrAddress.PagesUsed);
}
/**
 * Reads the UICR data that contains the address of the location in flash where
 * the MicroPython version is stored.
 *
 * @param intelHexMap - Memory map of the Intel Hex data.
 * @returns The address of the location in flash where the MicroPython version
 * is stored.
 */
function getVersionLocation(intelHexMap) {
    return hexMapUtil.getUint32(intelHexMap, MicropythonUicrAddress.VersionLocation);
}
/**
 * Reads the UICR data from an Intel Hex map and retrieves the MicroPython data.
 *
 * @throws {Error} When the Magic Header is not present.
 *
 * @param intelHexMap - Memory map of the Intel Hex data.
 * @returns Object with the decoded UICR MicroPython data.
 */
function getHexMapUicrData(intelHexMap) {
    const uicrMap = intelHexMap.slice(UICR_UPY_START);
    if (!confirmMagicValue(uicrMap)) {
        throw new Error('Could not find valid MicroPython UICR data.');
    }
    const flashPageSize = getPageSize(uicrMap);
    const flashSize = getFlashSize(uicrMap);
    const startPage = getStartPage(uicrMap);
    const flashStartAddress = startPage * flashPageSize;
    const flashEndAddress = flashStartAddress + flashSize;
    const pagesUsed = getPagesUsed(uicrMap);
    const runtimeEndAddress = pagesUsed * flashPageSize;
    const versionAddress = getVersionLocation(uicrMap);
    const uPyVersion = hexMapUtil.getString(intelHexMap, versionAddress);
    const deviceVersion = getDeviceVersion(uicrMap);
    const fsEndAddress = getFsEndAddress(uicrMap);
    return {
        flashPageSize,
        flashSize,
        flashStartAddress,
        flashEndAddress,
        runtimeStartAddress: flashStartAddress,
        runtimeEndAddress,
        fsStartAddress: runtimeEndAddress,
        fsEndAddress,
        uicrStartAddress: MicropythonUicrAddress.MagicValue,
        uicrEndAddress: MicropythonUicrAddress.End,
        uPyVersion,
        deviceVersion,
    };
}
/**
 * Reads the UICR data from an Intel Hex string and retrieves the MicroPython
 * data.
 *
 * @throws {Error} When the Magic Header is not present.
 *
 * @param intelHex - MicroPython Intel Hex string.
 * @returns Object with the decoded UICR MicroPython data.
 */
function getIntelHexUicrData(intelHex) {
    return getHexMapUicrData(MemoryMap.fromHex(intelHex));
}
export { getHexMapUicrData, getIntelHexUicrData };
//# sourceMappingURL=uicr.js.map