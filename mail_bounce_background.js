const DEFAULTS = {
  addresses: Array.from({ length: 6 }, () => ({ label: "", email: "" })),
  copyToSent: true
};

function text(key, substitutions) {
  return messenger.i18n.getMessage(key, substitutions) || key;
}

function normalizeAddresses(items) {
  return (Array.isArray(items) ? items : [])
    .slice(0, 6)
    .map(item => ({
      label: String(item?.label || "").trim(),
      email: String(item?.email || "").trim()
    }))
    .filter(item => item.email);
}

async function preferences() {
  const prefs = await messenger.storage.local.get(DEFAULTS);
  return {
    addresses: normalizeAddresses(prefs.addresses),
    copyToSent: prefs.copyToSent !== false
  };
}

async function selectIdentity(message) {
  const accounts = await messenger.accounts.list();
  const sourceAccountId = message?.folder?.accountId;
  const sourceAccount = accounts.find(account =>
    account.id === sourceAccountId && account.identities?.length
  );
  const account = sourceAccount || accounts.find(item => item.identities?.length);
  if (!account) {
    throw new Error(text("noIdentity"));
  }
  return account.identities[0].id;
}

function collectParts(part, output = { html: [], plain: [] }) {
  if (!part) {
    return output;
  }
  const type = String(part.contentType || "").toLowerCase();
  if (typeof part.body === "string") {
    if (type === "text/html") {
      output.html.push(part.body);
    } else if (type === "text/plain") {
      output.plain.push(part.body);
    }
  }
  for (const child of part.parts || []) {
    collectParts(child, output);
  }
  return output;
}

async function loadAttachments(messageId) {
  const listed = await messenger.messages.listAttachments(messageId);
  const attachments = [];
  for (const attachment of listed) {
    const file = await messenger.messages.getAttachmentFile(messageId, attachment.partName);
    attachments.push({ file, name: attachment.name || file.name });
  }
  return attachments;
}

async function displayedMessage(windowId) {
  const tabs = await messenger.tabs.query({ active: true, windowId });
  const tab = tabs[0];
  if (!tab?.id) {
    throw new Error(text("activeTabError"));
  }
  const messages = await messenger.messageDisplay.getDisplayedMessages(tab.id);
  if (!messages?.length) {
    throw new Error(text("noDisplayedMessage"));
  }
  return messages[0];
}

async function sendBounce({ windowId, email }) {
  try {
    const message = await displayedMessage(windowId);
    const identityId = await selectIdentity(message);
    const prefs = await preferences();
    // Use the public messages API to obtain the complete RFC 822 source.
    // It handles IMAP messages that are not cached locally and avoids relying
    // on the internal streamMessage() state between consecutive operations.
    let rawMessage;
    try {
      rawMessage = await messenger.messages.getRaw(message.id, {
        data_format: "BinaryString",
        decrypt: false
      });
    } catch (error) {
      throw new Error(`Stage read-original failed: ${error?.message || error}`);
    }

    const result = await messenger.mailBounceUI.redirectMessage(
      message.id,
      String(email || "").trim(),
      identityId,
      prefs.copyToSent,
      rawMessage
    );
    if (typeof result === "string" && result.startsWith("error:")) {
      throw new Error(result.slice("error:".length));
    } else if (typeof result === "string" && result.startsWith("sent-copy-failed:")) {
      const detail = result.slice("sent-copy-failed:".length);
      const warning = text("sentCopyWarning", [detail]);
      await messenger.mailBounceUI.setStatus(windowId, warning, true);
    } else {
      await messenger.mailBounceUI.setStatus(windowId, text("sentSuccess"), false);
    }
  } catch (error) {
    console.error("Mail Bounce send failed:", error);
    await messenger.mailBounceUI.setStatus(
      windowId,
      text("errorPrefix", [error?.message || String(error)]),
      true
    );
  }
}

async function updateAddresses() {
  const prefs = await preferences();
  await messenger.mailBounceUI.setAddresses(prefs.addresses);
}

messenger.mailBounceUI.onDestinationSelected.addListener(sendBounce);
messenger.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.addresses) {
    updateAddresses();
  }
});

(async () => {
  await messenger.mailBounceUI.initialize({
    caption: text("bounceCaption"),
    redirectTitle: text("redirectTitle", ["{email}"]),
    sendingTo: text("sendingTo", ["{email}"]),
    errorPrefix: text("errorPrefix", ["{error}"]),
    customPlaceholder: text("customPlaceholder"),
    customSendTitle: text("customSendTitle"),
    invalidEmail: text("invalidEmail")
  });
  await updateAddresses();
})().catch(error => {
  console.error("Mail Bounce initialization failed:", error);
});
