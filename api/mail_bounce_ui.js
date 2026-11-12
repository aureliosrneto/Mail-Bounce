const { ExtensionCommon } = ChromeUtils.importESModule(
  "resource://gre/modules/ExtensionCommon.sys.mjs"
);
const { ExtensionSupport } = ChromeUtils.importESModule(
  "resource://gre/modules/ExtensionSupport.sys.mjs"
);
const Services = globalThis.Services || ChromeUtils.importESModule(
  "resource://gre/modules/Services.sys.mjs"
).Services;



const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

function encodeHeaderLine(name, value) {
  const prefix = `${name}: `;
  const raw = prefix + String(value || "");
  return MailServices.mimeConverter.encodeMimePartIIStr_UTF8(
    raw,
    true,
    prefix.length,
    Ci.nsIMimeConverter.MIME_ENCODED_WORD_SIZE
  ) + "\r\n";
}

function makeMessageId(identity) {
  const domain = String(identity.email || "localhost").split("@").pop() || "localhost";
  const uuid = Services.uuid.generateUUID().toString().replace(/[{}]/g, "");
  return `<${uuid}@${domain}>`;
}

function resentHeaders(identity, destination, messageId) {
  const from = MailServices.headerParser.makeMimeHeader([
    { name: identity.fullName || "", email: identity.email }
  ], 1);
  return [
    encodeHeaderLine("Resent-From", from),
    encodeHeaderLine("Resent-To", destination),
    `Resent-Date: ${new Date().toUTCString()}\r\n`,
    `Resent-Message-ID: ${messageId}\r\n`
  ].join("");
}

function writeRawMessageToFile(rawMessage, prefix) {
  const file = Services.dirsvc.get("TmpD", Ci.nsIFile);
  file.append("mail-bounce-message.eml");
  file.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o600);

  const fileStream = Cc["@mozilla.org/network/file-output-stream;1"]
    .createInstance(Ci.nsIFileOutputStream);
  const binaryOut = Cc["@mozilla.org/binaryoutputstream;1"]
    .createInstance(Ci.nsIBinaryOutputStream);

  try {
    fileStream.init(file, 0x02 | 0x08 | 0x20, 0o600, 0);
    binaryOut.setOutputStream(fileStream);

    // Experiment API parent scopes do not expose the browser TextEncoder
    // global. The Resent-* prefix is MIME-header encoded and therefore safe
    // to write as bytes by taking the low 8 bits of each character.
    const prefixBytes = new Array(prefix.length);
    for (let i = 0; i < prefix.length; i++) {
      prefixBytes[i] = prefix.charCodeAt(i) & 0xff;
    }
    binaryOut.writeByteArray(prefixBytes);

    // getRaw(..., {data_format: "BinaryString"}) returns one JavaScript
    // character per original byte. Write in chunks to avoid large temporary
    // arrays and preserve MIME bodies and attachments byte-for-byte.
    const chunkSize = 64 * 1024;
    for (let offset = 0; offset < rawMessage.length; offset += chunkSize) {
      const chunk = rawMessage.slice(offset, offset + chunkSize);
      const bytes = new Array(chunk.length);
      for (let i = 0; i < chunk.length; i++) {
        bytes[i] = chunk.charCodeAt(i) & 0xff;
      }
      binaryOut.writeByteArray(bytes);
    }

    binaryOut.close();
    if (file.fileSize <= prefix.length) {
      throw new Error("The original message is empty.");
    }
    return file;
  } catch (error) {
    try { binaryOut.close(); } catch (_) {}
    try { file.remove(false); } catch (_) {}
    throw error;
  }
}

function findAccountForIdentity(identity, sourceServer) {
  // sendMessageFile expects an account key, not a server key.
  // Prefer the account that owns the selected identity and only then the
  // account of the source message. This is important when the displayed
  // message belongs to a different account.
  try {
    for (const account of MailServices.accounts.accounts || []) {
      for (const candidate of account.identities || []) {
        if (candidate?.key === identity?.key) {
          return account;
        }
      }
    }
  } catch (error) {
    console.warn("Mail Bounce: could not locate account by identity:", error);
  }

  try {
    if (sourceServer) {
      const account = MailServices.accounts.findAccountForServer(sourceServer);
      if (account) return account;
    }
  } catch (error) {
    console.warn("Mail Bounce: could not locate source account:", error);
  }

  throw new Error("The account associated with the sending identity could not be located.");
}

function markOriginalMessageRedirected(msgHdr) {
  if (!msgHdr?.folder) {
    throw new Error("The original message folder is not available.");
  }

  // Use Thunderbird's native redirected disposition. The thread pane already
  // knows how to render this flag with the orange redirect arrow, so no custom
  // column or icon injection is required.
  try {
    msgHdr.folder.addMessageDispositionState(
      msgHdr,
      Ci.nsIMsgFolder.nsMsgDispositionState_Redirected
    );
    return;
  } catch (primaryError) {
    // Compatibility fallback for folders where the disposition helper is not
    // available but the message database can still persist the Redirected bit.
    try {
      msgHdr.folder.msgDatabase.markRedirected(
        msgHdr.messageKey,
        true,
        null
      );
      return;
    } catch (fallbackError) {
      throw new Error(
        `Could not mark the original message as redirected: ${
          fallbackError?.message || primaryError?.message || fallbackError || primaryError
        }`
      );
    }
  }
}

function sendRedirectFile(identity, accountKey, fields, file) {
  return new Promise((resolve, reject) => {
    const sender = Cc["@mozilla.org/messengercompose/send;1"]
      .createInstance(Ci.nsIMsgSend);
    const listener = {
      QueryInterface: ChromeUtils.generateQI(["nsIMsgSendListener"]),
      onStartSending() {},
      onProgress() {},
      onStatus() {},
      onGetDraftFolderURI() {},
      onSendNotPerformed(messageId, status) {
        reject(new Error(`Message was not sent (status ${status}).`));
      },
      onStopSending(messageId, status, message, returnFile) {
        if (Components.isSuccessCode(status)) {
          resolve();
        } else {
          reject(new Error(message || `SMTP send failed (status ${status}).`));
        }
      }
    };

    sender.sendMessageFile(
      identity,
      accountKey,
      fields,
      file,
      false,
      false,
      sender.nsMsgDeliverNow,
      null,
      listener,
      null,
      ""
    );
  });
}


function resolveSentFolder(identity, sourceServer) {
  // Thunderbird stores Copies & Folders preferences on identities, but the
  // native resolver uses the account/server associated with that identity.
  // getOrCreateFccFolder() is therefore the correct way to obtain the actual
  // Sent folder, including the common "Sent on this account" configuration
  // where fccFolderURI has not yet been materialized.
  const candidates = [];
  if (identity) {
    candidates.push(identity);
  }

  try {
    const sourceAccount = sourceServer
      ? MailServices.accounts.findAccountForServer(sourceServer)
      : null;
    if (sourceAccount) {
      if (sourceAccount.defaultIdentity && !candidates.includes(sourceAccount.defaultIdentity)) {
        candidates.push(sourceAccount.defaultIdentity);
      }
      for (const accountIdentity of sourceAccount.identities || []) {
        if (accountIdentity && !candidates.includes(accountIdentity)) {
          candidates.push(accountIdentity);
        }
      }
    }
  } catch (error) {
    console.warn("Mail Bounce: could not enumerate source-account identities:", error);
  }

  const errors = [];
  for (const candidate of candidates) {
    try {
      const folder = candidate.getOrCreateFccFolder();
      if (folder) {
        return folder;
      }
    } catch (error) {
      errors.push(error?.message || String(error));
    }

    // Compatibility fallback for profiles where the URI is already stored.
    try {
      const uri = String(candidate.fccFolderURI || candidate.fccFolder || "").trim();
      if (uri && uri !== "nocopy://") {
        const folder = MailServices.folderLookup.getFolderForURL(uri);
        if (folder) {
          return folder;
        }
      }
    } catch (error) {
      errors.push(error?.message || String(error));
    }
  }

  throw new Error(
    "The Sent folder could not be resolved for the source account" +
    (errors.length ? `: ${errors.join(" | ")}` : ".")
  );
}

function copyRedirectToSent(identity, sourceServer, file) {
  return new Promise((resolve, reject) => {
    let folder;
    try {
      folder = resolveSentFolder(identity, sourceServer);
    } catch (error) {
      reject(error);
      return;
    }

    let newKey = null;
    const listener = {
      QueryInterface: ChromeUtils.generateQI(["nsIMsgCopyServiceListener"]),
      onStartCopy() {},
      onProgress(progress, progressMax) {},
      setMessageKey(key) { newKey = key; },
      getMessageId() { return ""; },
      onStopCopy(status) {
        if (Components.isSuccessCode(status)) {
          resolve(newKey);
        } else {
          reject(new Error(`Could not save the message in Sent (status 0x${Number(status).toString(16)}).`));
        }
      }
    };

    try {
      MailServices.copy.copyFileMessage(
        file,
        folder,
        null,
        false,
        0,
        "",
        listener,
        null
      );
    } catch (error) {
      reject(new Error(`Could not start the Sent-folder copy: ${error?.message || error}`));
    }
  });
}

let redirectQueue = Promise.resolve();

async function redirectMessage(context, messageId, destination, identityId, copyToSent, rawMessage) {
  const email = String(destination || "").trim();
  if (!email) throw new Error("Destination address is empty.");

  const msgHdr = context.extension.messageManager.get(messageId);
  if (!msgHdr) throw new Error("The displayed message could not be located.");

  const identity = MailServices.accounts.getIdentity(identityId);
  if (!identity) throw new Error("The selected sending identity could not be located.");

  const fields = Cc["@mozilla.org/messengercompose/composefields;1"]
    .createInstance(Ci.nsIMsgCompFields);
  fields.from = MailServices.headerParser.makeMimeHeader([
    { name: identity.fullName || "", email: identity.email }
  ], 1);
  fields.to = email;
  fields.messageId = makeMessageId(identity);
  // Disable the native FCC step. Thunderbird may report a successful SMTP send
  // but fail while copying to Sent. We save the exact redirected RFC message
  // ourselves after the SMTP operation completes.
  fields.fcc = "nocopy://";
  fields.fcc2 = "";

  if (typeof rawMessage !== "string" || rawMessage.length === 0) {
    throw new Error("Stage read-original failed: The original message content was not supplied.");
  }

  const prefix = resentHeaders(identity, email, fields.messageId);
  let file;
  try {
    file = writeRawMessageToFile(rawMessage, prefix);
  } catch (error) {
    throw new Error(`Stage prepare-message failed: ${error?.message || error}`);
  }
  try {
    try {
      const sendAccount = findAccountForIdentity(identity, msgHdr.folder.server);
      await sendRedirectFile(identity, sendAccount.key, fields, file);
      // Mark only after SMTP confirms success. This activates Thunderbird's
      // native redirected icon beside the original message in the thread list.
      try {
        markOriginalMessageRedirected(msgHdr);
      } catch (markError) {
        // The bounce itself succeeded, so failure to update the visual marker
        // must not turn a successful send into an error.
        console.error("Mail Bounce: could not mark message as redirected:", markError);
      }
    } catch (error) {
      throw new Error(`Stage SMTP-send failed: ${error?.message || error}`);
    }

    if (!copyToSent) {
      return "sent-no-copy";
    }

    try {
      await copyRedirectToSent(identity, msgHdr.folder.server, file);
      return "sent-copied";
    } catch (copyError) {
      console.error("Mail Bounce: message sent, but Sent-folder copy failed:", copyError);
      return `sent-copy-failed:${String(copyError?.message || copyError || "Unknown copy error")}`;
    }
  } finally {
    try { if (file.exists()) file.remove(false); } catch (_) {}
  }
}

const LISTENER_ID = "mail-bounce-ui-listener";

let sharedState = null;

function walkDocuments(win, callback, seen = new Set()) {
  const visit = doc => {
    if (!doc || seen.has(doc)) return;
    seen.add(doc);
    callback(doc);
    let frames = [];
    try { frames = doc.querySelectorAll("browser, iframe"); } catch (e) {}
    for (const frame of frames) {
      try {
        if (frame.contentDocument) visit(frame.contentDocument);
      } catch (e) {}
    }
  };
  try { visit(win.document); } catch (e) {}
}

function isMessageDocument(doc) {
  if (!doc) return false;
  let href = "";
  try { href = String(doc.location?.href || ""); } catch (e) {}
  return href.startsWith("about:message") ||
    !!doc.getElementById("messageHeader") ||
    !!doc.getElementById("msgHeaderView");
}

function findHost(doc) {
  return doc.getElementById("headerSubjectSecurityContainer") ||
    doc.getElementById("expandedsubjectRow") ||
    doc.getElementById("messageHeader") ||
    doc.getElementById("msgHeaderView");
}

function ownerChromeWindow(doc, fallback) {
  try {
    return doc.defaultView?.browsingContext?.topChromeWindow || fallback;
  } catch (e) {
    return fallback;
  }
}

function windowIdFor(state, doc, fallback) {
  const win = ownerChromeWindow(doc, fallback);
  return state.extension.windowManager.getWrapper(win).id;
}

function setBusy(bar, busy) {
  for (const control of bar.querySelectorAll("button, input")) {
    control.disabled = busy;
  }
}

function showStatus(bar, text, isError = false) {
  const status = bar.querySelector(".mail-bounce-status");
  if (!status) return;
  status.hidden = !text;
  status.textContent = text || "";
  status.style.color = isError ? "var(--color-red-60, #d70022)" : "inherit";
}

function replaceTokens(text, values) {
  let result = String(text || "");
  for (const [key, value] of Object.entries(values || {})) {
    result = result.replaceAll(`{${key}}`, String(value));
  }
  return result;
}

async function waitForBackgroundListener(state, win, timeoutMs = 5000) {
  if (state.fire) return state.fire;
  const started = Date.now();
  while (!state.fire && Date.now() - started < timeoutMs) {
    await new Promise(resolve => win.setTimeout(resolve, 50));
  }
  if (!state.fire) {
    throw new Error("Mail Bounce background listener is not ready.");
  }
  return state.fire;
}

function renderInDocument(state, doc, chromeWin) {
  if (!isMessageDocument(doc)) return false;
  const host = findHost(doc);
  if (!host) return false;

  let bar = doc.getElementById("mail-bounce-quick-bar");
  if (!bar) {
    bar = doc.createElement("div");
    bar.id = "mail-bounce-quick-bar";
    bar.setAttribute("role", "toolbar");
    bar.setAttribute("aria-label", "Mail Bounce");
    bar.style.cssText = [
      "display:flex",
      "align-items:center",
      "flex-wrap:wrap",
      "gap:8px",
      "min-height:24px",
      "padding:2px 8px 6px 8px",
      "font-size:13px",
      "border-top:1px solid color-mix(in srgb, currentColor 14%, transparent)"
    ].join(";");

    const caption = doc.createElement("span");
    caption.className = "mail-bounce-caption";
    caption.style.cssText = "font-weight:600;opacity:.78";
    bar.appendChild(caption);

    const fixed = doc.createElement("span");
    fixed.className = "mail-bounce-fixed-addresses";
    fixed.style.cssText = "display:contents";
    bar.appendChild(fixed);

    const customWrap = doc.createElement("span");
    customWrap.className = "mail-bounce-custom-wrap";
    customWrap.style.cssText = "display:inline-flex;align-items:center;gap:4px;margin-inline-start:4px";

    const input = doc.createElement("input");
    input.type = "email";
    input.className = "mail-bounce-custom-email";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.style.cssText = "min-width:210px;height:24px;padding:1px 6px;font:inherit";

    const send = doc.createElement("button");
    send.type = "button";
    send.className = "mail-bounce-custom-send";
    send.textContent = "↪";
    send.style.cssText = "height:24px;min-width:28px;padding:0 6px;cursor:pointer";

    const sendCustom = async () => {
      const email = input.value.trim();
      if (!email || !input.checkValidity()) {
        try { input.reportValidity(); } catch (e) {}
        showStatus(bar, state.strings.invalidEmail, true);
        return;
      }
      setBusy(bar, true);
      showStatus(bar, replaceTokens(state.strings.sendingTo, { email }), false);
      try {
        const fire = await waitForBackgroundListener(state, chromeWin);
        await fire.async({
          windowId: windowIdFor(state, doc, chromeWin),
          email
        });
      } catch (error) {
        setBusy(bar, false);
        showStatus(bar, replaceTokens(state.strings.errorPrefix, {
          error: error?.message || String(error)
        }), true);
      }
    };

    input.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        sendCustom();
      }
    });
    send.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      sendCustom();
    });

    customWrap.appendChild(input);
    customWrap.appendChild(send);
    bar.appendChild(customWrap);

    const status = doc.createElement("span");
    status.className = "mail-bounce-status";
    status.hidden = true;
    status.style.cssText = "margin-inline-start:6px;opacity:.85";
    bar.appendChild(status);

    if (["headerSubjectSecurityContainer", "expandedsubjectRow"].includes(host.id)) {
      host.insertAdjacentElement("afterend", bar);
    } else {
      host.appendChild(bar);
    }
  }

  bar.hidden = false;
  bar.querySelector(".mail-bounce-caption").textContent = state.strings.caption;
  const input = bar.querySelector(".mail-bounce-custom-email");
  input.placeholder = state.strings.customPlaceholder;
  input.title = state.strings.customPlaceholder;
  bar.querySelector(".mail-bounce-custom-send").title = state.strings.customSendTitle;

  const fixed = bar.querySelector(".mail-bounce-fixed-addresses");
  fixed.replaceChildren();
  for (const item of state.addresses) {
    const button = doc.createElement("button");
    button.type = "button";
    button.className = "mail-bounce-address";
    button.textContent = item.label || item.email;
    button.title = replaceTokens(state.strings.redirectTitle, { email: item.email });
    button.style.cssText = [
      "appearance:none", "border:0", "padding:0", "margin:0",
      "background:transparent", "color:var(--link-color, #0060df)",
      "text-decoration:underline", "cursor:pointer", "font:inherit"
    ].join(";");
    button.addEventListener("click", async event => {
      event.preventDefault();
      event.stopPropagation();
      setBusy(bar, true);
      showStatus(bar, replaceTokens(state.strings.sendingTo, { email: item.email }), false);
      try {
        const fire = await waitForBackgroundListener(state, chromeWin);
        await fire.async({
          windowId: windowIdFor(state, doc, chromeWin),
          email: item.email
        });
      } catch (error) {
        setBusy(bar, false);
        showStatus(bar, replaceTokens(state.strings.errorPrefix, {
          error: error?.message || String(error)
        }), true);
      }
    });
    fixed.appendChild(button);
  }
  return true;
}

function renderWindow(state, win) {
  let rendered = false;
  walkDocuments(win, doc => {
    if (renderInDocument(state, doc, win)) rendered = true;
  });
  return rendered;
}

function installWindow(state, win) {
  if (!win?.document || state.windows.has(win)) return;

  const refresh = () => {
    try { renderWindow(state, win); } catch (e) { console.error("Mail Bounce render:", e); }
  };
  const onLoad = () => win.setTimeout(refresh, 0);
  win.addEventListener("load", onLoad, true);
  win.addEventListener("pageshow", onLoad, true);

  let observer = null;
  try {
    observer = new win.MutationObserver(refresh);
    observer.observe(win.document.documentElement, { childList: true, subtree: true });
  } catch (e) {}

  const timer = win.setInterval(refresh, 700);
  state.windows.set(win, { timer, observer, onLoad });
  refresh();
}

function uninstallWindow(state, win) {
  const data = state.windows.get(win);
  if (!data) return;
  try { win.clearInterval(data.timer); } catch (e) {}
  try { data.observer?.disconnect(); } catch (e) {}
  try { win.removeEventListener("load", data.onLoad, true); } catch (e) {}
  try { win.removeEventListener("pageshow", data.onLoad, true); } catch (e) {}
  state.windows.delete(win);
}

function registerWindows(state) {
  try { ExtensionSupport.unregisterWindowListener(LISTENER_ID); } catch (e) {}
  ExtensionSupport.registerWindowListener(LISTENER_ID, {
    chromeURLs: [
      "chrome://messenger/content/messenger.xhtml",
      "chrome://messenger/content/messageWindow.xhtml"
    ],
    onLoadWindow(win) { installWindow(state, win); },
    onUnloadWindow(win) { uninstallWindow(state, win); }
  });

  for (const type of ["mail:3pane", "mail:messageWindow"]) {
    const enumerator = Services.wm.getEnumerator(type);
    while (enumerator.hasMoreElements()) {
      installWindow(state, enumerator.getNext());
    }
  }
}

var mailBounceUI = class extends ExtensionCommon.ExtensionAPI {
  onStartup() {
    // The API is initialized by the background script through getAPI().
  }

  onShutdown(isAppShutdown) {
    if (isAppShutdown) return;
    Services.obs.notifyObservers(null, "startupcache-invalidate");
  }

  getAPI(context) {
    if (!sharedState) {
      sharedState = {
        extension: context.extension,
        addresses: [],
        strings: {
          caption: "Bounce:",
          redirectTitle: "Bounce to {email}",
          sendingTo: "Sending to {email}…",
          errorPrefix: "Error: {error}",
          customPlaceholder: "Other email address",
          customSendTitle: "Bounce to this address",
          invalidEmail: "Enter a valid email address."
        },
        fire: null,
        windows: new Map()
      };
      registerWindows(sharedState);
      context.callOnClose({
        close() {
          if (!sharedState) return;
          for (const win of [...sharedState.windows.keys()]) uninstallWindow(sharedState, win);
          try { ExtensionSupport.unregisterWindowListener(LISTENER_ID); } catch (e) {}
          sharedState = null;
        }
      });
    }

    const state = sharedState;
    return {
      mailBounceUI: {
        initialize: async strings => {
          state.strings = { ...state.strings, ...(strings || {}) };
          registerWindows(state);
          for (const win of state.windows.keys()) renderWindow(state, win);
        },
        setAddresses: async addresses => {
          state.addresses = (Array.isArray(addresses) ? addresses : [])
            .map(item => ({
              label: String(item?.label || "").trim(),
              email: String(item?.email || "").trim()
            }))
            .filter(item => item.email)
            .slice(0, 6);
          for (const win of state.windows.keys()) renderWindow(state, win);
        },
        redirectMessage: async (messageId, destination, identityId, copyToSent, rawMessage) => {
          const operation = redirectQueue.then(() =>
            redirectMessage(context, messageId, destination, identityId, copyToSent, rawMessage)
          );
          // Keep the queue alive even after a failed operation. Without this, a
          // rejected promise would poison all subsequent bounces until restart.
          redirectQueue = operation.catch(() => undefined);
          try {
            return await operation;
          } catch (error) {
            console.error("Mail Bounce redirect failed:", error);
            return `error:${String(error?.message || error || "Unknown redirect error")}`;
          }
        },
        setStatus: async (windowId, text, isError) => {
          let wrapper = null;
          try { wrapper = context.extension.windowManager.get(windowId, context); } catch (e) {}
          const win = wrapper?.window;
          if (!win) return;
          walkDocuments(win, doc => {
            const bar = doc.getElementById("mail-bounce-quick-bar");
            if (!bar) return;
            showStatus(bar, text, isError);
            setBusy(bar, false);
          });
        },
        onDestinationSelected: new ExtensionCommon.EventManager({
          context,
          name: "mailBounceUI.onDestinationSelected",
          register: fire => {
            state.fire = fire;
            // The chrome UI can be created before the background listener is
            // fully registered. Refresh all message windows as soon as the
            // listener becomes available.
            for (const win of state.windows.keys()) {
              try { renderWindow(state, win); } catch (e) {}
            }
            return () => {
              if (state.fire === fire) {
                state.fire = null;
              }
            };
          }
        }).api()
      }
    };
  }
};
