const DEFAULTS = {
  addresses: Array.from({ length: 6 }, () => ({ label: "", email: "" })),
  copyToSent: true
};

function text(key, substitutions) {
  return messenger.i18n.getMessage(key, substitutions) || key;
}

function localize() {
  document.documentElement.lang = messenger.i18n.getUILanguage();
  for (const element of document.querySelectorAll("[data-i18n]")) {
    const value = text(element.dataset.i18n);
    if (element.tagName === "TITLE") {
      document.title = value;
    } else {
      element.textContent = value;
    }
  }
}

function createAddressRows(addresses) {
  const container = document.getElementById("addresses");
  container.replaceChildren();
  for (let index = 0; index < 6; index++) {
    const item = addresses[index] || { label: "", email: "" };
    const row = document.createElement("div");
    row.className = "row";

    const number = document.createElement("span");
    number.className = "number";
    number.textContent = `${index + 1}.`;

    const label = document.createElement("input");
    label.type = "text";
    label.placeholder = text("optionalName");
    label.value = item.label || "";
    label.dataset.field = "label";

    const email = document.createElement("input");
    email.type = "email";
    email.placeholder = text("emailPlaceholder");
    email.value = item.email || "";
    email.dataset.field = "email";

    row.append(number, label, email);
    container.append(row);
  }
}

async function loadOptions() {
  const prefs = await messenger.storage.local.get(DEFAULTS);
  createAddressRows(prefs.addresses || DEFAULTS.addresses);
  document.getElementById("copyToSent").checked = prefs.copyToSent !== false;
}

async function saveOptions(event) {
  event.preventDefault();
  const status = document.getElementById("status");
  try {
    const rows = [...document.querySelectorAll(".row")];
    for (const row of rows) {
      const email = row.querySelector('[data-field="email"]');
      if (email.value && !email.checkValidity()) {
        email.reportValidity();
        return;
      }
    }
    const addresses = rows.map(row => ({
      label: row.querySelector('[data-field="label"]').value.trim(),
      email: row.querySelector('[data-field="email"]').value.trim()
    }));
    await messenger.storage.local.set({
      addresses,
      copyToSent: document.getElementById("copyToSent").checked
    });
    status.className = "ok";
    status.textContent = text("saved");
  } catch (error) {
    status.className = "error";
    status.textContent = error?.message || String(error);
  }
}

localize();
document.getElementById("settings").addEventListener("submit", saveOptions);
loadOptions();
