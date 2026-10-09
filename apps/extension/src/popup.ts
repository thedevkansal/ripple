import { RIPPLE_URL, send, SETTINGS } from "./messages";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function render() {
  $("dashboard").setAttribute("href", `${RIPPLE_URL}/dashboard`);
  $("connect").setAttribute("href", `${RIPPLE_URL}/dashboard/extension`);

  const settings = await chrome.storage.sync.get(SETTINGS.trackByDefault);
  $<HTMLInputElement>("trackByDefault").checked = settings[SETTINGS.trackByDefault] !== false;

  const res = await send<{ user: { name: string | null; email: string }; workspace: { name: string } }>({ type: "me" });
  $("connected").hidden = !res.ok;
  $("disconnected").hidden = res.ok;
  if (res.ok) {
    $("who").textContent = res.data.user.name ?? res.data.user.email;
    $("workspace").textContent = `${res.data.user.email} · ${res.data.workspace.name}`;
  } else if (!res.unauthorized) {
    $("error").hidden = false;
    $("error").textContent = res.error;
  }
}

$<HTMLInputElement>("trackByDefault").addEventListener("change", (e) => {
  void chrome.storage.sync.set({ [SETTINGS.trackByDefault]: (e.target as HTMLInputElement).checked });
});

$("disconnect").addEventListener("click", async () => {
  await send({ type: "disconnect" });
  await render();
});

void render();
