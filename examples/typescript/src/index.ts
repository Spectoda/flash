const baudrates = document.getElementById("baudrates") as HTMLSelectElement;
const connectButton = document.getElementById("connectButton") as HTMLButtonElement;
const traceButton = document.getElementById("copyTraceButton") as HTMLButtonElement;
const disconnectButton = document.getElementById("disconnectButton") as HTMLButtonElement;
const resetButton = document.getElementById("resetButton") as HTMLButtonElement;
const consoleStartButton = document.getElementById("consoleStartButton") as HTMLButtonElement;
const consoleStopButton = document.getElementById("consoleStopButton") as HTMLButtonElement;
const eraseButton = document.getElementById("eraseButton") as HTMLButtonElement;
const addFileButton = document.getElementById("addFile") as HTMLButtonElement;
const programButton = document.getElementById("programButton");
const filesDiv = document.getElementById("files");
const terminal = document.getElementById("terminal");
const programDiv = document.getElementById("program");
const consoleDiv = document.getElementById("console");
const lblBaudrate = document.getElementById("lblBaudrate");
const lblConsoleFor = document.getElementById("lblConsoleFor");
const lblConnTo = document.getElementById("lblConnTo");
const table = document.getElementById("fileTable") as HTMLTableElement;
const alertDiv = document.getElementById("alertDiv");

// This is a frontend example of Esptool-JS using local bundle file
// To optimize use a CDN hosted version like
// https://unpkg.com/esptool-js@0.2.0/bundle.js
import { ESPLoader, FlashOptions, LoaderOptions, Transport } from "../../../lib";

declare let Terminal; // Terminal is imported in HTML script
declare let CryptoJS; // CryptoJS is imported in HTML script

const term = new Terminal({ cols: 120, rows: 24, fontSize: 14 });

term.open(terminal);

let device = null;
let transport: Transport;
let chip: string = null;
let esploader: ESPLoader;

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
function setIsFlashing(is_flashing) {
  isFlashing = is_flashing;

  if (isFlashing) {
    programButton.setAttribute("disabled", "true");
  } else {
    programButton.removeAttribute("disabled");
  }
}

disconnectButton.style.display = "none";
traceButton.style.display = "none";
eraseButton.style.display = "none";
consoleStopButton.style.display = "none";
filesDiv.style.display = "initial";

document.querySelector("#msg").innerHTML =
  "Click flash controller, select device and then hold till flash is complete... <br />Make sure the Serial port is being opened exclusively by this website.";

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
    const file = evt.target.files[0];

    if (!file) {
      reject("No file selected");
      return;
    }

    console.log("File selected: " + file.name);
    const reader = new FileReader();

    reader.onload = (ev: ProgressEvent<FileReader>) => {
      console.log("File loaded: " + file.name);
      if (ev.target.result) {
        resolve(ev.target.result);
      } else {
        reject("FileReader did not return a result");
      }
    };

    reader.onerror = () => {
      reject("Error occurred while reading the file");
    };

    reader.readAsBinaryString(file);
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
};

connectButton.onclick = connectHandler;

async function connectHandler() {
  if (device === null) {
    cleanUp();
    device = await navigator.serial.requestPort({});
    device.addEventListener("disconnect", () => {
      const e = { message: "The device has been disconnected." };

      cleanUp();
      document.querySelector("#msg").style.color = "yellow";
      document.querySelector("#msg").innerHTML = "Warn: " + e.message;
      espLoaderTerminal.writeln(`Warn: ${e.message}`);
    });

    transport = new Transport(device, true);
  }
  setIsFlashing(true);
  window.device = device;

  try {
    await device.close().catch((e) => {
      console.error(e);
    });
    const flashOptions = {
      transport,
      baudrate: parseInt(baudrates.value),
      terminal: espLoaderTerminal,
    } as LoaderOptions;

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
    console.error(e);
    if (!e.message?.includes("The port is already open")) espLoaderTerminal.writeln(`Error: ${e.message}`);
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
  setIsFlashing(false);

  document.querySelector("#msg").style.color = "white";
  document.querySelector("#msg").innerHTML = "";
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

  document.querySelector("#msg").style.color = "lightgray";
  document.querySelector("#msg").innerHTML = "Firmware flashing in progress...";

  // Hide error message
  alertDiv.style.display = "none";

  const fileArray = [];
  const progressBars = [];

  for (let index = 1; index < table.rows.length; index++) {
    const row = table.rows[index];

    const offSetObj = row.cells[0].childNodes[0] as HTMLInputElement;
    const offset = parseInt(offSetObj.value);

    const fileObj = row.cells[1].childNodes[0] as ChildNode & { data: string };
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
      flashSize: "keep",
      eraseAll: false,
      compress: true,
      reportProgress: (fileIndex, written, total) => {
        progressBars[fileIndex].value = (written / total) * 100;
      },
      calculateMD5Hash: (image) => CryptoJS.MD5(CryptoJS.enc.Latin1.parse(image)),
    } as FlashOptions;
    await esploader.writeFlash(flashOptions);
    await esploader.hardReset();
    document.querySelector("#msg").style.color = "green";
    document.querySelector("#msg").innerHTML = "Firmware flashed successfully";

    setIsFlashing(false);
    // moznost pridat barvicky \x1b[1;32m zelena \x1b[0m bila
    espLoaderTerminal.writeln("Flash success");

    emitControllerInfoToParentWindow(controllerInfo);
  } catch (e) {
    // hack so this shows after listener trigger
    setTimeout(() => {
      let message = e.message;
      message += ". Please reconnect controller and try again by clicking (Flash controller).";

      document.querySelector("#msg").style.color = "red";
      document.querySelector("#msg").innerHTML = "Error: " + message;
      espLoaderTerminal.writeln(`Error: ${message}`);

      emitControllerInfoToParentWindow(controllerInfo);
    }, 0);
  } finally {
    // Hide progress bars and show erase buttons
    for (let index = 1; index < table.rows.length; index++) {
      table.rows[index].cells[2].style.display = "none";
      table.rows[index].cells[3].style.display = "initial";
    }
  }
};

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
  const element2 = document.createElement("input");
  element2.type = "file";
  element2.id = "selectFile" + rowCount;
  element2.name = "selected_File" + rowCount;
  // if (file) {
  //   element2.files = file; // Assign provided file if available

  // }
  if (file) {
    setFilesInput(element2, file);
    let data = await handleFileSelect({ target: { files: [file] } });
    file.data = data;
    element2.data = data;
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

async function fetchFile(url) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    let file = new File([blob], url.split("/").pop(), { type: blob.type });
    console.log(blob);
    return file;
  } catch (error) {
    console.error("Error fetching file:", error);
    return null;
  }
}

function setFilesInput(inputElement, file) {
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);

  handleFileSelect({ target: { files: [file] } });

  inputElement.files = dataTransfer.files;
}

async function initFiles() {
  const fileUrls = ["/fw/bootloader.bin", "/fw/partitions.bin", "/fw/ota_data_initial.bin", "/fw/firmware.bin"];

  const flashAddresses = ["0x1000", "0x8000", "0xe000", "0x10000"];

  for (let i = 0; i < fileUrls.length; i++) {
    const file = await fetchFile(fileUrls[i]);
    setIsFlashing(true);
    document.querySelector("#msg").style.color = "yellow";
    document.querySelector("#msg").innerHTML = "Loading fw files...";
    addFile(flashAddresses[i], file);
    if (file.type !== "application/octet-stream") {
      document.querySelector("#msg").style.color = "red";
      document.querySelector("#msg").innerHTML = "Error: " + "FW files not found, please contact support +420730659547";
      return;
    }
  }
  document.querySelector("#msg").style.color = "green";
  document.querySelector("#msg").innerHTML = "Ready...";

  setIsFlashing(false);
}

initFiles();

/**
 *
 * @param controllerInfo this allows integration into other web apps
 */
function emitControllerInfoToParentWindow(controllerInfo) {
  window.parent.postMessage(JSON.stringify({ type: "controller-info", controllerInfo }), "*");

  controllerInfo.mac = null;
  controllerInfo.chip = null;
  controllerInfo.features = null;
  controllerInfo.crystal = null;
}
