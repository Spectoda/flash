const baudrates = document.getElementById("baudrates") as HTMLSelectElement;
const mainBaudrate = document.getElementById("mainBaudrate") as HTMLSelectElement;
const connectButton = document.getElementById("connectButton") as HTMLButtonElement;
const traceButton = document.getElementById("copyTraceButton") as HTMLButtonElement;
const disconnectButton = document.getElementById("disconnectButton") as HTMLButtonElement;
const resetButton = document.getElementById("resetButton") as HTMLButtonElement;
const consoleStartButton = document.getElementById("consoleStartButton") as HTMLButtonElement;
const consoleStopButton = document.getElementById("consoleStopButton") as HTMLButtonElement;
const eraseButton = document.getElementById("eraseButton") as HTMLButtonElement;
const eraseControllerButton = document.getElementById("eraseControllerButton") as HTMLButtonElement;
const addFileButton = document.getElementById("addFile") as HTMLButtonElement;
const programButton = document.getElementById("programButton") as HTMLButtonElement;
const filesDiv = document.getElementById("files");
const terminal = document.getElementById("terminal");
const programDiv = document.getElementById("program");
const consoleDiv = document.getElementById("console");
const lblBaudrate = document.getElementById("lblBaudrate");
const lblConsoleFor = document.getElementById("lblConsoleFor");
const lblConnTo = document.getElementById("lblConnTo");
const table = document.getElementById("fileTable") as HTMLTableElement;
const alertDiv = document.getElementById("alertDiv");
const msgElement = document.getElementById("msg") as HTMLElement;

/**
 * Set the status message displayed to the user
 * @param message - The message text to display
 * @param color - The color of the message (e.g., 'red', 'green', 'yellow', 'white')
 */
function setStatusMessage(message: string, color = "white") {
  msgElement.style.color = color;
  msgElement.innerHTML = message;
}

// This is a frontend example of Esptool-JS using local bundle file
// To optimize use a CDN hosted version like
// https://unpkg.com/esptool-js@0.2.0/bundle.js
import { ESPLoader, FlashOptions, LoaderOptions, Transport } from "../../../lib";

declare let Terminal; // Terminal is imported in HTML script
declare let CryptoJS; // CryptoJS is imported in HTML script

// Extend Window interface for custom properties
declare global {
  interface Window {
    term: typeof term;
    controllerInfo: typeof controllerInfo;
    device: SerialPort | null;
    emitControllerInfoToParentWindow: typeof emitControllerInfoToParentWindow;
  }
}

// Extend HTMLInputElement to include custom data property
interface HTMLInputElementWithData extends HTMLInputElement {
  data?: Uint8Array;
}

const term = new Terminal({ cols: 120, rows: 24, fontSize: 14 });

term.open(terminal);

let device = null;
let transport: Transport;
let chip: string = null;
let esploader: ESPLoader;
let selectedPortInfo = null; // Store info about the port user selected this session

const controllerInfo = {
  mac: null,
  chip: null,
  features: null,
  crystal: null,
  flashLog: "",
};
window.term = term;
window.controllerInfo = controllerInfo;

let isFlashing = false;
/**
 *
 * @param is_flashing
 */
function setIsFlashing(is_flashing) {
  isFlashing = is_flashing;

  if (isFlashing) {
    programButton.setAttribute("disabled", "true");
    eraseControllerButton.setAttribute("disabled", "true");
  } else {
    programButton.removeAttribute("disabled");
    eraseControllerButton.removeAttribute("disabled");
  }
}

disconnectButton.style.display = "none";
traceButton.style.display = "none";
eraseButton.style.display = "none";
consoleStopButton.style.display = "none";
filesDiv.style.display = "initial";

setStatusMessage(
  "Click flash controller, select device and then hold till flash is complete... <br />Make sure the Serial port is being opened exclusively by this website.",
);

/**
 * The built in Event object.
 * @external Event
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Event}
 */

/**
 * File reader handler to read given local file.
 * @param {Event} evt File Select event
 */
function handleFileSelect(evt) {
  return new Promise((resolve, reject) => {
    const input = evt.target as HTMLInputElementWithData;
    const file = input.files?.[0];

    if (!file) {
      reject("No file selected");
      return;
    }

    const reader = new FileReader();

    reader.onload = (ev: ProgressEvent<FileReader>) => {
      if (ev.target.result) {
        const arrayBuffer = ev.target.result as ArrayBuffer;
        const bytes = new Uint8Array(arrayBuffer);
        input.data = bytes;
        resolve(bytes);
      } else {
        reject("FileReader did not return a result");
      }
    };

    reader.onerror = () => {
      reject("Error occurred while reading the file");
    };

    reader.readAsArrayBuffer(file);
  });
}

const espLoaderTerminal = {
  clean() {
    term.clear();
  },
  writeLine(data) {
    term.writeln(data);
    controllerInfo.flashLog += data + "\n";
  },
  write(data) {
    term.write(data);
    controllerInfo.flashLog += data;
  },
  writeln(data) {
    term.writeln(data);
    controllerInfo.flashLog += data + "\n";
  },
  clear() {
    term.clear();
  },
};

async function rebootIntoFirmware() {
  if (!transport) return;

  await transport.setDTR(false);
  await new Promise((resolve) => setTimeout(resolve, 100));
  await transport.setDTR(true);
  await new Promise((resolve) => setTimeout(resolve, 300));
}

connectButton.onclick = connectHandler;

/**
 *
 */
async function connectHandler() {
  setStatusMessage("Connecting...", "yellow");

  // Get device if we don't have one
  if (device === null) {
    if (selectedPortInfo) {
      // User already selected a port this session - try to find it without popup
      const ports = await navigator.serial.getPorts();
      const matchingPort = ports.find((port) => {
        const info = port.getInfo();
        return info.usbVendorId === selectedPortInfo.usbVendorId && info.usbProductId === selectedPortInfo.usbProductId;
      });
      if (matchingPort) {
        device = matchingPort;
      } else {
        // Port no longer available, need to show popup again
        device = await navigator.serial.requestPort({});
        selectedPortInfo = device.getInfo();
      }
    } else {
      // First connection this session - always show popup
      device = await navigator.serial.requestPort({});
      selectedPortInfo = device.getInfo();
    }
    device.addEventListener("disconnect", () => {
      const e = { message: "The device has been disconnected." };

      cleanUp();
      setStatusMessage("Warn: " + e.message, "yellow");
      espLoaderTerminal.writeln(`Warn: ${e.message}`);
    });
  }

  // Clean up any existing transport before creating new one
  if (transport) {
    try {
      await transport.disconnect();
    } catch (e) {
      // Ignore disconnect errors
    }
    transport = null;
  }

  // Always recreate transport
  transport = new Transport(device, true);

  setIsFlashing(true);
  window.device = device;

  try {
    const flashOptions: LoaderOptions = {
      transport,
      baudrate: parseInt(mainBaudrate.value),
      terminal: espLoaderTerminal,
      romBaudrate: 115200,
      enableTracing: false,
    };

    // reset logs
    controllerInfo.flashLog = "";
    esploader = new ESPLoader(flashOptions);

    chip = await esploader.main();

    controllerInfo.mac = await esploader.chip.readMac(esploader);
    controllerInfo.chip = chip;
    controllerInfo.crystal = (await esploader.chip.getCrystalFreq(esploader)) + "MHz";
    controllerInfo.features = await esploader.chip.getChipFeatures(esploader);

    // Temporarily broken
    // await esploader.flashId();
  } catch (e) {
    // Clean up serial port on error so it can be reused
    try {
      if (transport) await transport.disconnect();
    } catch (disconnectError) {
      // Ignore disconnect errors
    }
    transport = null;
    device = null;
    chip = null;
    // Clear port info only on device lost errors to force fresh selection
    if (e.message?.includes("lost")) {
      selectedPortInfo = null;
    }
    setIsFlashing(false);

    console.error(e);
    espLoaderTerminal.write(`\n`);
    if (e.message?.includes("Failed to connect") || e.message?.includes("lost")) {
      setTimeout(() => {
        setStatusMessage("Connection failed. Please try again by clicking (Flash controller).", "red");
      }, 50);
    }
    if (!e.message?.includes("The port is already open")) espLoaderTerminal.writeln(`Error: ${e.message}`);
    return; // Exit early on error
  }

  console.log("Settings done for :" + chip);
  lblBaudrate.style.display = "none";
  lblConnTo.innerHTML = "Connected to device: " + chip;
  lblConnTo.style.display = "block";
  baudrates.style.display = "none";
  connectButton.style.display = "none";
  disconnectButton.style.display = "initial";
  traceButton.style.display = "initial";
  eraseButton.style.display = "initial";
  filesDiv.style.display = "initial";
  consoleDiv.style.display = "none";
}

traceButton.onclick = async () => {
  if (transport) {
    transport.returnTrace();
  }
};

resetButton.onclick = async () => {
  if (device === null) {
    device = await navigator.serial.requestPort({});
    transport = new Transport(device, true);
  }

  await transport.setDTR(false);
  await new Promise((resolve) => setTimeout(resolve, 100));
  await transport.setDTR(true);
};

eraseButton.onclick = async () => {
  eraseButton.disabled = true;
  try {
    await esploader.eraseFlash();
  } catch (e) {
    console.error(e);
    espLoaderTerminal.writeln(`Error: ${e.message}`);
  } finally {
    eraseButton.disabled = false;
  }
};

/**
 * Erase controller flash - connects, erases, and reports result
 */
eraseControllerButton.onclick = async () => {
  setIsFlashing(true);
  setStatusMessage("Connecting to device...", "yellow");

  try {
    // Get device if we don't have one
    if (device === null) {
      if (selectedPortInfo) {
        // User already selected a port this session - try to find it without popup
        const ports = await navigator.serial.getPorts();
        const matchingPort = ports.find((port) => {
          const info = port.getInfo();
          return (
            info.usbVendorId === selectedPortInfo.usbVendorId && info.usbProductId === selectedPortInfo.usbProductId
          );
        });
        if (matchingPort) {
          device = matchingPort;
        } else {
          // Port no longer available, need to show popup again
          device = await navigator.serial.requestPort({});
          selectedPortInfo = device.getInfo();
        }
      } else {
        // First connection this session - always show popup
        device = await navigator.serial.requestPort({});
        selectedPortInfo = device.getInfo();
      }
      device.addEventListener("disconnect", () => {
        cleanUp();
        setStatusMessage("Device disconnected.", "yellow");
      });
    }

    // Clean up any existing transport before creating new one
    if (transport) {
      try {
        await transport.disconnect();
      } catch (e) {
        // Ignore disconnect errors
      }
      transport = null;
    }

    // Always recreate transport
    transport = new Transport(device, true);

    const flashOptions: LoaderOptions = {
      transport,
      baudrate: parseInt(mainBaudrate.value),
      terminal: espLoaderTerminal,
      romBaudrate: 115200,
      enableTracing: false,
    };

    controllerInfo.flashLog = "";
    esploader = new ESPLoader(flashOptions);
    await esploader.main();

    setStatusMessage("Erasing flash... This may take a while.", "yellow");

    await esploader.eraseFlash();

    setStatusMessage("Flash erased successfully!", "green");
    espLoaderTerminal.writeln("Flash erased successfully!");

    await rebootIntoFirmware();

    // Disconnect transport but keep device for reuse
    if (transport) await transport.disconnect();
    transport = null;
    chip = null;
  } catch (e) {
    // Clean up serial port on error so it can be reused
    try {
      if (transport) await transport.disconnect();
    } catch (disconnectError) {
      // Ignore disconnect errors
    }
    transport = null;
    device = null;
    chip = null;
    // Clear port info only on device lost errors to force fresh selection
    if (e?.message?.includes("lost")) {
      selectedPortInfo = null;
    }

    console.error(e);
    setStatusMessage("Error: " + e.message + ". Please try again.", "red");
    espLoaderTerminal.writeln(`Error: ${e.message}`);
  } finally {
    setIsFlashing(false);
  }
};

addFileButton.onclick = () => {
  const rowCount = table.rows.length;
  const row = table.insertRow(rowCount);

  //Column 1 - Offset
  const cell1 = row.insertCell(0);
  const element1 = document.createElement("input");
  element1.type = "text";
  element1.id = "offset" + rowCount;
  element1.value = "0x1000";
  cell1.appendChild(element1);

  // Column 2 - File selector
  const cell2 = row.insertCell(1);
  const element2 = document.createElement("input");
  element2.type = "file";
  element2.id = "selectFile" + rowCount;
  element2.name = "selected_File" + rowCount;
  element2.addEventListener("change", handleFileSelect, false);
  cell2.appendChild(element2);

  // Column 3  - Progress
  const cell3 = row.insertCell(2);
  cell3.classList.add("progress-cell");
  cell3.style.display = "none";
  cell3.innerHTML = `<progress value="0" max="100"></progress>`;

  // Column 4  - Remove File
  const cell4 = row.insertCell(3);
  cell4.classList.add("action-cell");
  if (rowCount > 1) {
    const element4 = document.createElement("input");
    element4.type = "button";
    const btnName = "button" + rowCount;
    element4.name = btnName;
    element4.setAttribute("class", "btn");
    element4.setAttribute("value", "Remove"); // or element1.value = "button";
    element4.onclick = function () {
      removeRow(row);
    };
    cell4.appendChild(element4);
  }
};

/**
 * The built in HTMLTableRowElement object.
 * @external HTMLTableRowElement
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/HTMLTableRowElement}
 */

/**
 * Remove file row from HTML Table
 * @param {HTMLTableRowElement} row Table row element to remove
 */
function removeRow(row: HTMLTableRowElement) {
  const rowIndex = Array.from(table.rows).indexOf(row);
  table.deleteRow(rowIndex);
}

/**
 * Clean devices variables on chip disconnect. Remove stale references if any.
 */
function cleanUp() {
  console.log("Cleaning up device variables");
  device = null;
  transport = null;
  chip = null;
  // Keep selectedPortInfo so we can reconnect to same device without popup
  setIsFlashing(false);

  setStatusMessage("");
}

disconnectButton.onclick = async () => {
  if (transport) await transport.disconnect();

  espLoaderTerminal.clear();
  baudrates.style.display = "initial";
  connectButton.style.display = "initial";
  disconnectButton.style.display = "none";
  traceButton.style.display = "none";
  eraseButton.style.display = "none";
  lblConnTo.style.display = "none";
  filesDiv.style.display = "none";
  alertDiv.style.display = "none";
  consoleDiv.style.display = "initial";
  cleanUp();

  emitResetToParentWindow();
};

let isConsoleClosed = false;
consoleStartButton.onclick = async () => {
  if (device === null) {
    device = await navigator.serial.requestPort({});
    transport = new Transport(device, true);
  }
  lblConsoleFor.style.display = "block";
  consoleStartButton.style.display = "none";
  consoleStopButton.style.display = "initial";
  programDiv.style.display = "none";

  await transport.connect();
  isConsoleClosed = false;

  while (true && !isConsoleClosed) {
    const val = await transport.rawRead();
    if (typeof val !== "undefined") {
      espLoaderTerminal.write(val);
    } else {
      break;
    }
  }
  console.log("quitting console");
};

consoleStopButton.onclick = async () => {
  isConsoleClosed = true;
  await transport.disconnect();
  await transport.waitForUnlock(1500);
  espLoaderTerminal.clear();
  consoleStartButton.style.display = "initial";
  consoleStopButton.style.display = "none";
  programDiv.style.display = "initial";
};

/**
 * Validate the provided files images and offset to see if they're valid.
 * @returns {string} Program input validation result
 */
function validateProgramInputs() {
  const offsetArr = [];
  const rowCount = table.rows.length;
  let row;
  let offset = 0;
  let fileData = null;

  // check for mandatory fields
  for (let index = 1; index < rowCount; index++) {
    row = table.rows[index];

    //offset fields checks
    const offSetObj = row.cells[0].childNodes[0];
    offset = parseInt(offSetObj.value);

    // Non-numeric or blank offset
    if (Number.isNaN(offset)) return "Offset field in row " + index + " is not a valid address!";
    // Repeated offset used
    else if (offsetArr.includes(offset)) return "Offset field in row " + index + " is already in use!";
    else offsetArr.push(offset);

    const fileObj = row.cells[1].childNodes[0];
    fileData = fileObj.data;
    if (fileData == null) return "No file selected for row " + index + "!";
  }

  return "success";
}

programButton.onclick = async () => {
  await connectHandler();
  const alertMsg = document.getElementById("alertmsg");
  const err = validateProgramInputs();

  if (err != "success") {
    alertMsg.innerHTML = "<strong>" + err + "</strong>";
    alertDiv.style.display = "block";
    return;
  }

  setStatusMessage("Firmware flashing in progress...", "lightgray");

  // Hide error message
  alertDiv.style.display = "none";

  const fileArray = [];
  const progressBars = [];

  for (let index = 1; index < table.rows.length; index++) {
    const row = table.rows[index];

    const offSetObj = row.cells[0].childNodes[0] as HTMLInputElement;
    const offset = parseInt(offSetObj.value);

    const fileObj = row.cells[1].childNodes[0] as ChildNode & { data: Uint8Array };
    const progressBar = row.cells[2].childNodes[0];

    progressBar.textContent = "0";
    progressBars.push(progressBar);

    row.cells[2].style.display = "initial";
    row.cells[3].style.display = "none";

    fileArray.push({ data: fileObj.data, address: offset });
  }

  try {
    const flashOptions: FlashOptions = {
      fileArray: fileArray,
      flashMode: "keep",
      flashFreq: "keep",
      flashSize: "keep",
      eraseAll: false,
      compress: true,
      reportProgress: (fileIndex, written, total) => {
        progressBars[fileIndex].value = (written / total) * 100;
      },
      calculateMD5Hash: (image) => CryptoJS.MD5(CryptoJS.lib.WordArray.create(image)).toString(),
    } as FlashOptions;
    await esploader.writeFlash(flashOptions);
    await rebootIntoFirmware();

    // Disconnect transport but keep device for reuse
    if (transport) await transport.disconnect();
    transport = null;
    chip = null;
    setIsFlashing(false);

    setStatusMessage("Firmware flashed successfully", "green");

    // moznost pridat barvicky \x1b[1;32m zelena \x1b[0m bila
    espLoaderTerminal.writeln("Flash success");

    emitControllerInfoToParentWindow(controllerInfo, true);
  } catch (e) {
    // Clean up serial port on error so it can be reused
    try {
      if (transport) await transport.disconnect();
    } catch (disconnectError) {
      // Ignore disconnect errors
    }
    transport = null;
    device = null;
    chip = null;
    // Clear port info only on device lost errors to force fresh selection
    if (e?.message?.includes("lost")) {
      selectedPortInfo = null;
    }

    // hack so this shows after listener trigger
    setTimeout(() => {
      setIsFlashing(false);
      emitFailToParentWindow(e?.message);

      if (controllerInfo.mac) {
        emitControllerInfoToParentWindow(controllerInfo, false);
      }

      let message = e?.message;
      message += ". Please try again by clicking (Flash controller).";

      setStatusMessage("Error: " + message, "red");
      espLoaderTerminal.writeln(`Error: ${message}`);
    }, 0);
  } finally {
    // Hide progress bars and show erase buttons
    for (let index = 1; index < table.rows.length; index++) {
      table.rows[index].cells[2].style.display = "none";
      table.rows[index].cells[3].style.display = "initial";
    }
  }
};

/**
 *
 * @param flashAddress
 * @param file
 */
async function addFile(flashAddress, file) {
  const rowCount = table.rows.length;
  const row = table.insertRow(rowCount);

  // Column 1 - Offset
  const cell1 = row.insertCell(0);
  const element1 = document.createElement("input");
  element1.type = "text";
  element1.id = "offset" + rowCount;
  element1.value = flashAddress || "0x1000"; // Use provided flash address or default value
  cell1.appendChild(element1);

  // Column 2 - File selector
  const cell2 = row.insertCell(1);
  const element2 = document.createElement("input") as HTMLInputElementWithData;
  element2.type = "file";
  element2.id = "selectFile" + rowCount;
  element2.name = "selected_File" + rowCount;
  // if (file) {
  //   element2.files = file; // Assign provided file if available

  // }
  if (file) {
    setFilesInput(element2, file);
    const data = await handleFileSelect({ target: { files: [file] } });
    (file as File & { data: Uint8Array }).data = data as Uint8Array;
    element2.data = data as Uint8Array;
  }

  element2.addEventListener("change", handleFileSelect, false);
  cell2.appendChild(element2);

  // Column 3 - Progress
  const cell3 = row.insertCell(2);
  cell3.classList.add("progress-cell");
  cell3.style.display = "none";
  cell3.innerHTML = `<progress value="0" max="100"></progress>`;

  // Column 4 - Remove File
  const cell4 = row.insertCell(3);
  cell4.classList.add("action-cell");
  if (rowCount > 1) {
    const element4 = document.createElement("input");
    element4.type = "button";
    element4.name = "button" + rowCount;
    element4.setAttribute("class", "btn");
    element4.setAttribute("value", "Remove");
    element4.onclick = function () {
      removeRow(row);
    };
    cell4.appendChild(element4);
  }
}

/**
 *
 * @param url
 */
async function fetchFile(url) {
  try {
    // Add cache-busting timestamp to always fetch fresh files
    const cacheBustUrl = url + (url.includes("?") ? "&" : "?") + "t=" + Date.now();
    const response = await fetch(cacheBustUrl, { cache: "no-store" });

    // Check if the response is actually a binary file (not HTML fallback)
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || contentType.includes("text/html")) {
      console.error("File not found or invalid response:", url);
      return null;
    }

    const blob = await response.blob();
    // Extract clean filename without query params
    const filename = url.split("/").pop().split("?")[0];
    const file = new File([blob], filename, { type: blob.type });
    return file;
  } catch (error) {
    console.error("Error fetching file:", error);
    return null;
  }
}

/**
 *
 * @param inputElement
 * @param file
 */
function setFilesInput(inputElement, file) {
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);

  handleFileSelect({ target: { files: [file] } });

  inputElement.files = dataTransfer.files;
}

/**
 *
 */
async function initFiles() {
  // Fetch firmware files from static folder (not bundled, always fresh)
  const fileUrls = ["/fw/bootloader.bin", "/fw/partitions.bin", "/fw/ota_data_initial.bin", "/fw/firmware.bin"];

  const flashAddresses = ["0x1000", "0x8000", "0xe000", "0x10000"];

  setIsFlashing(true);
  setStatusMessage("Loading fw files...", "yellow");

  for (let i = 0; i < fileUrls.length; i++) {
    const file = await fetchFile(fileUrls[i]);
    if (!file || file.size === 0) {
      setStatusMessage("Error: FW files not found, please contact support +420732715743", "red");
      setIsFlashing(false);
      return;
    }
    await addFile(flashAddresses[i], file);
  }

  setStatusMessage("Ready to flash", "green");
  setIsFlashing(false);
}

initFiles();

/**
 *
 * @param controllerInfo this allows integration into other web apps
 * @param success
 */
function emitControllerInfoToParentWindow(controllerInfo, success = false) {
  window.parent.postMessage(JSON.stringify({ type: "controller-info", controllerInfo, success }), "*");

  controllerInfo.mac = null;
  controllerInfo.chip = null;
  controllerInfo.features = null;
  controllerInfo.crystal = null;
}
window.emitControllerInfoToParentWindow = emitControllerInfoToParentWindow;

/**
 *
 */
function emitResetToParentWindow() {
  window.parent.postMessage(JSON.stringify({ type: "reset" }), "*");
}

/**
 *
 * @param message
 */
function emitFailToParentWindow(message: string) {
  window.parent.postMessage(JSON.stringify({ type: "fail", message }), "*");
}

/**
 *
 * @param event
 */
function outerWindowMessageHandler(event) {
  try {
    let { data } = event;
    if (!data?.includes?.("console-message")) return;
    data = JSON.parse(data);

    if (data.type === "console-message") {
      const title = data?.title;
      const titleColor = data?.titleColor;

      const message = data?.message;

      if (title && titleColor) {
        setStatusMessage(title, titleColor);
      }

      term.write(message);
    }
  } catch (e) {
    console.error(e);
  }
}

window.addEventListener("message", outerWindowMessageHandler);
